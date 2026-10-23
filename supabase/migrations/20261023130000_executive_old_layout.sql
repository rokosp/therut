-- Riverside Executive hole 3 was a par 3 until autumn 2025 (it's a par 4 now).
-- Old matches keep the old par through a "2025 layout" copy of each tee, hidden from the
-- tee picker so new matches use today's layout.

alter table public.course_tees add column if not exists retired boolean not null default false;

insert into public.course_tees (course_id, name, color, course_rating, slope, hole_pars, stroke_index, sort_order, retired)
select t.course_id, t.name || ' · 2025 layout', t.color, t.course_rating, t.slope,
       -- Hole 3 (and hole 12, its second time round on an 18) back to par 3.
       (select array_agg(case when i in (3, 12) then 3 else p end order by i)
          from unnest(t.hole_pars) with ordinality as x(p, i)),
       t.stroke_index, t.sort_order + 100, true
from public.course_tees t
join public.courses c on c.id = t.course_id
where c.slug = 'riverside-executive' and not t.retired and t.hole_pars is not null
on conflict (course_id, name) do nothing;

-- Backoutsideboyz Seasons 1 and 2: every Executive match moves to the old layout.
with old as (
  select m.id as match_id, m.tee_id
  from public.matches m
  join public.leagues l on l.id = m.league_id
  join public.courses c on c.id = m.course_id
  where l.name = 'Backoutsideboyz' and l.season in ('1', '2') and c.slug = 'riverside-executive'
)
update public.matches m
set tee_id = (select n.id from public.course_tees o join public.course_tees n
                on n.course_id = o.course_id and n.name = o.name || ' · 2025 layout'
              where o.id = m.tee_id)
from old where old.match_id = m.id
  and exists (select 1 from public.course_tees n join public.course_tees o on o.id = m.tee_id
              where n.course_id = o.course_id and n.name = o.name || ' · 2025 layout');

update public.match_players mp
set tee_id = (select n.id from public.course_tees o join public.course_tees n
                on n.course_id = o.course_id and n.name = o.name || ' · 2025 layout'
              where o.id = mp.tee_id)
from public.matches m
join public.leagues l on l.id = m.league_id
join public.courses c on c.id = m.course_id
where mp.match_id = m.id and mp.tee_id is not null
  and l.name = 'Backoutsideboyz' and l.season in ('1', '2') and c.slug = 'riverside-executive'
  and exists (select 1 from public.course_tees n join public.course_tees o on o.id = mp.tee_id
              where n.course_id = o.course_id and n.name = o.name || ' · 2025 layout');
