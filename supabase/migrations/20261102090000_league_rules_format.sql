-- League rules: a third match format next to stroke play and Stableford.
-- Each hole: best score gets 1 point, 2nd 2, 3rd 3 (ties share the average). Fewest points wins.
-- The app works out the points from the hole scores; the database only stores the format.
do $$
declare con text;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.matches'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%format%'
  loop
    execute format('alter table public.matches drop constraint %I', con);
  end loop;
end $$;
alter table public.matches add constraint matches_format_check check (format in ('stroke', 'stableford', 'league'));

-- Backoutsideboyz Season 2 is played under league rules: switch its matches (Season 1 stays as is)
-- and make league rules the default for new Season 2 matches.
update public.matches m set format = 'league'
from public.leagues l
where l.id = m.league_id and l.name = 'Backoutsideboyz' and l.season = '2';

update public.leagues set settings = settings || '{"defaultFormat": "league"}'::jsonb
where name = 'Backoutsideboyz' and season = '2';
