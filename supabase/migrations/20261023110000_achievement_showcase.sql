-- Achievements are worked out in the app from match history. This only stores which
-- badges (up to 4) a player picked to show off on their profile.
alter table public.profiles add column if not exists showcase text[] not null default '{}';
alter table public.profiles drop constraint if exists profiles_showcase_max;
alter table public.profiles add constraint profiles_showcase_max check (coalesce(array_length(showcase, 1), 0) <= 4);
