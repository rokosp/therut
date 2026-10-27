-- Add a course by hand from the app (for courses the online search doesn't know).
-- Anyone signed in can add one. Distances per hole are optional (metres).

alter table public.courses add column if not exists created_by uuid references public.profiles (id) on delete set null;
alter table public.course_tees add column if not exists hole_lengths int[];

-- c = { name, city, country, holes, pars: int[], stroke_index?: int[],
--       tees?: [{ name, course_rating?, slope?, lengths?: int[] }] }
create or replace function public.add_course(c jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  n int := (c ->> 'holes')::int;
  nm text := trim(coalesce(c ->> 'name', ''));
  pars int[] := array(select x::int from jsonb_array_elements_text(c -> 'pars') x);
  si int[];
  t jsonb;
  k int := 0;
  lens int[];
  cid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if length(nm) < 2 then raise exception 'Give the course a name.'; end if;
  if n not in (9, 18) then raise exception 'A course has 9 or 18 holes.'; end if;
  if coalesce(array_length(pars, 1), 0) <> n or exists (select 1 from unnest(pars) p where p not between 3 and 6) then
    raise exception 'Every hole needs a par between 3 and 6.';
  end if;
  if jsonb_typeof(c -> 'stroke_index') = 'array' and jsonb_array_length(c -> 'stroke_index') > 0 then
    si := array(select x::int from jsonb_array_elements_text(c -> 'stroke_index') x);
    if array_length(si, 1) <> n or (select array_agg(v order by v) from unnest(si) v) <> array(select generate_series(1, n)) then
      raise exception 'Stroke index needs each number from 1 to % once.', n;
    end if;
  end if;
  if exists (select 1 from courses where lower(name) = lower(nm) and lower(coalesce(city, '')) = lower(coalesce(trim(c ->> 'city'), ''))) then
    raise exception 'That course is already saved. Search for it instead.';
  end if;

  insert into courses (slug, club_name, name, city, country, holes, par, created_by)
  values (
    'user-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10),
    nm, nm,
    nullif(trim(c ->> 'city'), ''),
    nullif(trim(c ->> 'country'), ''),
    n,
    (select sum(p) from unnest(pars) p),
    auth.uid()
  )
  returning id into cid;

  for t in select value from jsonb_array_elements(case when jsonb_typeof(c -> 'tees') = 'array' then c -> 'tees' else '[]'::jsonb end) loop
    lens := case when jsonb_typeof(t -> 'lengths') = 'array'
                 then array(select nullif(x, '')::int from jsonb_array_elements_text(t -> 'lengths') x) end;
    if lens is not null and (array_length(lens, 1) <> n or array_position(lens, null) is not null) then lens := null; end if;
    insert into course_tees (course_id, name, course_rating, slope, hole_pars, stroke_index, hole_lengths, sort_order)
    values (
      cid,
      coalesce(nullif(trim(t ->> 'name'), ''), 'Tee ' || (k + 1)),
      case when nullif(t ->> 'course_rating', '')::numeric between 20 and 90 then (t ->> 'course_rating')::numeric end,
      case when nullif(t ->> 'slope', '')::int between 55 and 155 then (t ->> 'slope')::int end,
      pars, si, lens, k
    )
    on conflict (course_id, name) do nothing;
    k := k + 1;
  end loop;
  -- Quick add: one plain tee so the pars are used in matches.
  if k = 0 then
    insert into course_tees (course_id, name, hole_pars, stroke_index, sort_order) values (cid, 'Standard', pars, si, 0);
  end if;
  return cid;
end $$;

grant execute on function public.add_course(jsonb) to authenticated;
