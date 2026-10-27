-- Course search fixes:
-- * Courses whose API data leaves out the hole count no longer break the search
--   (the count comes from the hole list instead).
-- * Only searches that found something are remembered for 30 days; empty ones can be retried.
-- * Courses saved by an earlier search are kept as they are instead of being rebuilt.
-- * Search results without hole data get their full details fetched (a few per search),
--   and courses are saved even when the hole count is still missing (assumed 18).
-- * The first result of each search is kept in the log, to help fix future problems.
-- Also forget earlier empty searches so they can run again.
delete from public.course_api_log where found = 0;
alter table public.course_api_log add column if not exists sample jsonb;

-- The tees of one gender as a JSON array, whatever the API sent.
create or replace function public.gca_tees(c jsonb, g text) returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(c -> 'tees' -> g) = 'array' then c -> 'tees' -> g else '[]'::jsonb end
$$;

create or replace function public.search_courses_online(q text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  term text := trim(coalesce(q, ''));
  api_key text;
  res http_response;
  body jsonb;
  c jsonb;
  t jsonb;
  g text;
  cid uuid;
  n_holes int;
  pars int[];
  si int[];
  k int;
  found int := 0;
  details int := 0;
  d jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if length(term) < 3 then raise exception 'Type at least 3 letters to search online'; end if;

  -- Same search found courses in the last 30 days: they're already saved. Empty or failed
  -- searches don't count, so they can be retried.
  if exists (select 1 from course_api_log l where lower(l.query) = lower(term) and l.found > 0
             and l.called_at > now() - interval '30 days') then
    return jsonb_build_object('source', 'saved', 'found', 0);
  end if;
  if (select count(*) from course_api_log where called_at > now() - interval '1 day') >= 30 then
    raise exception 'Online course search is used up for today. Try again tomorrow.';
  end if;

  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'golfcourseapi_key' limit 1;
  if api_key is null then raise exception 'Online course search is not set up yet (no API key in Supabase).'; end if;

  res := http((
    'GET',
    'https://api.golfcourseapi.com/v1/search?search_query=' || urlencode(term),
    array[http_header('Authorization', 'Key ' || api_key)],
    null,
    null
  )::http_request);
  if res.status <> 200 then
    raise exception 'Course search failed (error %). Try again later.', res.status;
  end if;
  body := res.content::jsonb;

  for c in select value from jsonb_array_elements(coalesce(body -> 'courses', '[]'::jsonb)) loop
    -- Already saved from an earlier search: keep it as is (matches may use its tees).
    if exists (select 1 from courses where external_id = 'gca:' || (c ->> 'id')) then
      found := found + 1;
      continue;
    end if;
    -- Search results can be cut down. If no tee has hole data, ask for the full course
    -- (only for the first few results, to save the daily allowance).
    if not exists (select 1 from jsonb_array_elements(gca_tees(c, 'male') || gca_tees(c, 'female')) x
                   where jsonb_typeof(x -> 'holes') = 'array' and jsonb_array_length(x -> 'holes') > 0)
       and details < 3 and c ->> 'id' is not null then
      details := details + 1;
      begin
        res := http((
          'GET', 'https://api.golfcourseapi.com/v1/courses/' || urlencode(c ->> 'id'),
          array[http_header('Authorization', 'Key ' || api_key)], null, null
        )::http_request);
        if res.status = 200 then
          d := res.content::jsonb;
          d := case when jsonb_typeof(d -> 'course') = 'object' then d -> 'course' else d end;
          if jsonb_typeof(d -> 'tees') = 'object' then c := c || jsonb_build_object('tees', d -> 'tees'); end if;
        end if;
      exception when others then null;
      end;
    end if;

    -- Hole count and par come from the first tee listed. Some courses leave out the
    -- hole count, so fall back to counting the holes, then to 18.
    t := coalesce(gca_tees(c, 'male') -> 0, gca_tees(c, 'female') -> 0, '{}'::jsonb);
    n_holes := coalesce(nullif(t ->> 'number_of_holes', '')::numeric::int,
                        nullif(case when jsonb_typeof(t -> 'holes') = 'array' then jsonb_array_length(t -> 'holes') end, 0),
                        18);
    if n_holes > 18 then n_holes := 18; end if;
    if n_holes not in (9, 18) then n_holes := case when n_holes < 9 then 9 else 18 end; end if;

    insert into courses (slug, external_id, club_name, name, city, country, holes, par)
    values (
      'gca-' || (c ->> 'id'),
      'gca:' || (c ->> 'id'),
      coalesce(nullif(c ->> 'club_name', ''), c ->> 'course_name', 'Golf course'),
      coalesce(nullif(c ->> 'course_name', ''), c ->> 'club_name', 'Golf course'),
      c -> 'location' ->> 'city',
      c -> 'location' ->> 'country',
      n_holes,
      coalesce(nullif(t ->> 'par_total', '')::numeric::int,
               (select sum((h ->> 'par')::numeric::int) from jsonb_array_elements(case when jsonb_typeof(t -> 'holes') = 'array' then t -> 'holes' else '[]'::jsonb end) h),
               n_holes * 4)
    )
    returning id into cid;
    foreach g in array array['male', 'female'] loop
      k := 0;
      for t in select value from jsonb_array_elements(gca_tees(c, g)) loop
        select array_agg(nullif(h ->> 'par', '')::numeric::int order by i), array_agg(nullif(h ->> 'handicap', '')::numeric::int order by i)
          into pars, si
          from jsonb_array_elements(case when jsonb_typeof(t -> 'holes') = 'array' then t -> 'holes' else '[]'::jsonb end) with ordinality as x(h, i)
          where i <= n_holes;
        if coalesce(array_length(pars, 1), 0) <> n_holes or array_position(pars, null) is not null then pars := null; end if;
        if coalesce(array_length(si, 1), 0) <> n_holes or array_position(si, null) is not null then si := null; end if;
        insert into course_tees (course_id, name, course_rating, slope, hole_pars, stroke_index, sort_order)
        values (
          cid,
          coalesce(nullif(t ->> 'tee_name', ''), 'Tee') || case when g = 'female' then ' · Ladies' else '' end,
          nullif(t ->> 'course_rating', '')::numeric,
          case when nullif(t ->> 'slope_rating', '')::numeric::int between 55 and 155 then (t ->> 'slope_rating')::numeric::int end,
          pars,
          si,
          k * 2 + case when g = 'female' then 1 else 0 end
        )
        on conflict (course_id, name) do nothing;
        k := k + 1;
      end loop;
    end loop;
    -- Some tees come without hole data; borrow it from another tee of the same course.
    update course_tees set
      hole_pars = coalesce(hole_pars, (select x.hole_pars from course_tees x where x.course_id = cid and x.hole_pars is not null order by x.sort_order limit 1)),
      stroke_index = coalesce(stroke_index, (select x.stroke_index from course_tees x where x.course_id = cid and x.stroke_index is not null order by x.sort_order limit 1))
    where course_id = cid and (hole_pars is null or stroke_index is null);
    found := found + 1;
  end loop;

  insert into course_api_log (query, found, sample) values (term, found, body -> 'courses' -> 0);
  -- Each full-course lookup counts toward the daily allowance too.
  insert into course_api_log (query, found) select '(details) ' || term, 0 from generate_series(1, details);
  return jsonb_build_object('source', 'api', 'found', found);
end $$;
