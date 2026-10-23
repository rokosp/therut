-- Course search: look courses up on GolfCourseAPI from inside the database, so the API key
-- never ships in the app (the code is public). Results are saved as normal courses with all
-- their tees, ratings, slopes, pars and stroke indexes, so each course only costs one request.
--
-- The key lives in Supabase Vault. Store it once with (replace the text in quotes):
--   select vault.create_secret('YOUR-KEY-HERE', 'golfcourseapi_key');

create extension if not exists http with schema extensions;

alter table public.courses add column if not exists external_id text unique;

-- Every request made to the API, to stay under its 35-a-day limit and skip repeat searches.
create table if not exists public.course_api_log (
  id bigserial primary key,
  query text not null,
  found int not null default 0,
  called_by uuid default auth.uid(),
  called_at timestamptz not null default now()
);
alter table public.course_api_log enable row level security;

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
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if length(term) < 3 then raise exception 'Type at least 3 letters to search online'; end if;

  -- Same search in the last 30 days: the results are already saved.
  if exists (select 1 from course_api_log where lower(query) = lower(term) and called_at > now() - interval '30 days') then
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
    -- Hole count and par come from the first tee listed.
    t := coalesce(c -> 'tees' -> 'male' -> 0, c -> 'tees' -> 'female' -> 0);
    n_holes := (t ->> 'number_of_holes')::numeric::int;
    continue when t is null or n_holes not in (9, 18);

    insert into courses (slug, external_id, club_name, name, city, country, holes, par)
    values (
      'gca-' || (c ->> 'id'),
      'gca:' || (c ->> 'id'),
      coalesce(nullif(c ->> 'club_name', ''), c ->> 'course_name', 'Golf course'),
      coalesce(nullif(c ->> 'course_name', ''), c ->> 'club_name', 'Golf course'),
      c -> 'location' ->> 'city',
      c -> 'location' ->> 'country',
      n_holes,
      coalesce((t ->> 'par_total')::numeric::int, n_holes * 4)
    )
    on conflict (external_id) do update
      set club_name = excluded.club_name, name = excluded.name, city = excluded.city,
          country = excluded.country, holes = excluded.holes, par = excluded.par
    returning id into cid;

    delete from course_tees where course_id = cid;
    foreach g in array array['male', 'female'] loop
      k := 0;
      for t in select value from jsonb_array_elements(coalesce(c -> 'tees' -> g, '[]'::jsonb)) loop
        select array_agg((h ->> 'par')::numeric::int order by i), array_agg((h ->> 'handicap')::numeric::int order by i)
          into pars, si
          from jsonb_array_elements(coalesce(t -> 'holes', '[]'::jsonb)) with ordinality as x(h, i);
        if coalesce(array_length(pars, 1), 0) <> n_holes or array_position(pars, null) is not null then pars := null; end if;
        if coalesce(array_length(si, 1), 0) <> n_holes or array_position(si, null) is not null then si := null; end if;
        insert into course_tees (course_id, name, course_rating, slope, hole_pars, stroke_index, sort_order)
        values (
          cid,
          coalesce(nullif(t ->> 'tee_name', ''), 'Tee') || case when g = 'female' then ' · Ladies' else '' end,
          nullif(t ->> 'course_rating', '')::numeric,
          case when (t ->> 'slope_rating')::numeric::int between 55 and 155 then (t ->> 'slope_rating')::numeric::int end,
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

  insert into course_api_log (query, found) values (term, found);
  return jsonb_build_object('source', 'api', 'found', found);
end $$;
