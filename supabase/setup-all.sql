-- One-shot setup for a fresh project: paste into Supabase > SQL Editor and run once.

-- The Rut: golf league schema.
-- Points, tie breakers and handicaps are calculated in the app (src/lib) from these rows,
-- so changing a league's settings re-scores its history straight away.

create extension if not exists pgcrypto;

-- Profiles ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  nickname text,
  self_handicap numeric(4,1) check (self_handicap between -10 and 54),
  home_course_id uuid,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Courses -------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  club_name text not null,
  name text not null,
  city text,
  country text,
  holes int not null check (holes in (9, 18)),
  par int not null,
  created_at timestamptz not null default now()
);

create table public.course_tees (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  name text not null,
  color text,
  course_rating numeric(4,1),
  slope int check (slope between 55 and 155),
  -- Per-hole data is optional until we have the club scorecard.
  hole_pars int[],
  stroke_index int[],
  sort_order int not null default 0,
  unique (course_id, name)
);

alter table public.profiles add constraint profiles_home_course_fk
  foreign key (home_course_id) references public.courses (id) on delete set null;

-- Leagues -------------------------------------------------------------------
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season text,
  join_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)),
  -- LeagueSettings from src/lib/types.ts. Empty means app defaults.
  settings jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

-- Matches -------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  -- Default tee for the match; each player can play from a different one.
  tee_id uuid references public.course_tees (id) on delete set null,
  played_on date not null default current_date,
  kind text not null check (kind in ('major', 'minor')),
  holes int not null check (holes in (9, 18)),
  -- Which nine was played when a 9-hole match is on an 18-hole course.
  nine text check (nine in ('front', 'back')),
  status text not null default 'open' check (status in ('open', 'final')),
  notes text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Tees this player played from. Null means the match's default tee.
  tee_id uuid references public.course_tees (id) on delete set null,
  hole_scores int[],
  gross int check (gross > 0),
  -- Course handicap used for this match, frozen when the match is created.
  course_handicap int not null default 0,
  playoff_rank int,
  primary key (match_id, user_id)
);

create table public.bonus_awards (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type_key text,
  label text not null,
  points numeric(6,1) not null,
  hole int check (hole between 1 and 18),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create index on public.matches (league_id, played_on);
create index on public.match_players (user_id);
create index on public.bonus_awards (match_id);

-- Helpers (security definer so policies don't recurse) ------------------------
create function public.is_league_member(l uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_members where league_id = l and user_id = auth.uid());
$$;

create function public.is_league_admin(l uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_members where league_id = l and user_id = auth.uid() and role = 'admin');
$$;

create function public.match_league(m uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select league_id from matches where id = m;
$$;

-- Creator of a league becomes its admin.
create function public.handle_new_league() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into league_members (league_id, user_id, role) values (new.id, new.created_by, 'admin');
  return new;
end $$;

create trigger on_league_created after insert on public.leagues
  for each row execute function public.handle_new_league();

-- Join a league with its code.
create function public.join_league(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare l uuid;
begin
  select id into l from leagues where join_code = upper(trim(code));
  if l is null then raise exception 'No league with that code'; end if;
  insert into league_members (league_id, user_id) values (l, auth.uid()) on conflict do nothing;
  return l;
end $$;

-- Row level security ----------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_tees enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.bonus_awards enable row level security;

create policy "profiles readable by signed-in users" on public.profiles for select to authenticated using (true);
create policy "edit own profile" on public.profiles for update to authenticated using (id = auth.uid());

create policy "courses readable" on public.courses for select to authenticated using (true);
create policy "tees readable" on public.course_tees for select to authenticated using (true);

create policy "members read league" on public.leagues for select to authenticated
  using (public.is_league_member(id) or created_by = auth.uid());
create policy "anyone creates league" on public.leagues for insert to authenticated with check (created_by = auth.uid());
create policy "admins update league" on public.leagues for update to authenticated using (public.is_league_admin(id));
create policy "admins delete league" on public.leagues for delete to authenticated using (public.is_league_admin(id));

create policy "members read members" on public.league_members for select to authenticated
  using (public.is_league_member(league_id));
create policy "admins add members" on public.league_members for insert to authenticated
  with check (public.is_league_admin(league_id));
create policy "admins change members" on public.league_members for update to authenticated
  using (public.is_league_admin(league_id));
create policy "admins remove members or leave" on public.league_members for delete to authenticated
  using (public.is_league_admin(league_id) or user_id = auth.uid());

create policy "members read matches" on public.matches for select to authenticated
  using (public.is_league_member(league_id));
create policy "members create matches" on public.matches for insert to authenticated
  with check (public.is_league_member(league_id) and created_by = auth.uid());
create policy "creator or admin edits match" on public.matches for update to authenticated
  using (created_by = auth.uid() or public.is_league_admin(league_id));
create policy "creator or admin deletes match" on public.matches for delete to authenticated
  using (created_by = auth.uid() or public.is_league_admin(league_id));

-- Any league member can enter scores while a match is open; admins can always fix them.
create function public.can_score(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches x where x.id = m
      and (is_league_admin(x.league_id) or (x.status = 'open' and is_league_member(x.league_id)))
  );
$$;

create policy "members read scores" on public.match_players for select to authenticated
  using (public.is_league_member(public.match_league(match_id)));
create policy "members add players" on public.match_players for insert to authenticated
  with check (public.can_score(match_id) and public.is_league_member(public.match_league(match_id)));
create policy "members edit scores" on public.match_players for update to authenticated
  using (public.can_score(match_id));
create policy "members remove players" on public.match_players for delete to authenticated
  using (public.can_score(match_id));

create policy "members read bonuses" on public.bonus_awards for select to authenticated
  using (public.is_league_member(public.match_league(match_id)));
create policy "members award bonuses" on public.bonus_awards for insert to authenticated
  with check (public.can_score(match_id) and created_by = auth.uid());
create policy "awarder or admin removes bonus" on public.bonus_awards for delete to authenticated
  using (created_by = auth.uid() or public.is_league_admin(public.match_league(match_id)));

-- Only the people in a match (plus whoever set it up, and league admins) can enter
-- its scores and bonuses. Everyone else in the league can watch.
create or replace function public.can_score(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches x where x.id = m
      and (
        is_league_admin(x.league_id)
        or (
          x.status = 'open'
          and (
            x.created_by = auth.uid()
            or exists (select 1 from match_players p where p.match_id = m and p.user_id = auth.uid())
          )
        )
      )
  );
$$;

-- Friends: players can add each other as friends. Friends see each other's full
-- profile and match history; everyone else only sees name and handicap.

alter table public.profiles add column if not exists app_handicap numeric(4,1);
alter table public.profiles add column if not exists app_handicap_rounds int not null default 0;

create table if not exists public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

alter table public.friendships enable row level security;

drop policy if exists "see my friendships" on public.friendships;
create policy "see my friendships" on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));
drop policy if exists "send friend request" on public.friendships;
create policy "send friend request" on public.friendships for insert to authenticated
  with check (requester = auth.uid() and status = 'pending');
drop policy if exists "accept friend request" on public.friendships;
create policy "accept friend request" on public.friendships for update to authenticated
  using (addressee = auth.uid()) with check (addressee = auth.uid());
drop policy if exists "remove friendship" on public.friendships;
create policy "remove friendship" on public.friendships for delete to authenticated
  using (auth.uid() in (requester, addressee));

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

-- A match is visible to its league, and to friends of anyone playing in it.
create or replace function public.can_view_match(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from matches x where x.id = m and is_league_member(x.league_id))
      or exists (select 1 from match_players p where p.match_id = m and (p.user_id = auth.uid() or are_friends(auth.uid(), p.user_id)));
$$;

drop policy if exists "members read matches" on public.matches;
drop policy if exists "members and friends read matches" on public.matches;
create policy "members and friends read matches" on public.matches for select to authenticated
  using (public.can_view_match(id));

drop policy if exists "members read scores" on public.match_players;
drop policy if exists "members and friends read scores" on public.match_players;
create policy "members and friends read scores" on public.match_players for select to authenticated
  using (public.can_view_match(match_id));

drop policy if exists "members read bonuses" on public.bonus_awards;
drop policy if exists "members and friends read bonuses" on public.bonus_awards;
create policy "members and friends read bonuses" on public.bonus_awards for select to authenticated
  using (public.can_view_match(match_id));

-- Match format: stroke play (fewest strokes) or Stableford (most points).
alter table public.matches add column if not exists format text not null default 'stroke'
  check (format in ('stroke', 'stableford'));

-- Generated by scripts/gen-course-seed.mjs from data/courses. Do not edit by hand.

insert into public.courses (slug, club_name, name, city, country, holes, par) values ('riverside-championship', 'Riverside Golf Zagreb', 'Riverside Championship', 'Zagreb', 'Croatia', 18, 72)
  on conflict (slug) do update set name = excluded.name, holes = excluded.holes, par = excluded.par;
insert into public.course_tees (course_id, name, color, course_rating, slope, hole_pars, stroke_index, sort_order)
  select id, 'White', '#FFFFFF', 74.8, 143, array[4,3,4,5,4,4,3,5,4,4,3,4,5,4,5,4,3,4]::int[], array[11,17,5,9,1,13,15,7,3,6,18,12,14,2,10,16,8,4]::int[], 0 from public.courses where slug = 'riverside-championship'
  on conflict (course_id, name) do update set color = excluded.color, course_rating = excluded.course_rating, slope = excluded.slope,
    hole_pars = excluded.hole_pars, stroke_index = excluded.stroke_index, sort_order = excluded.sort_order;
insert into public.course_tees (course_id, name, color, course_rating, slope, hole_pars, stroke_index, sort_order)
  select id, 'White · Ladies', '#FFFFFF', 75, 146, array[4,3,4,5,4,4,3,5,4,4,3,4,5,4,5,4,3,4]::int[], array[11,17,5,9,1,13,15,7,3,6,18,12,14,2,10,16,8,4]::int[], 1 from public.courses where slug = 'riverside-championship'
  on conflict (course_id, name) do update set color = excluded.color, course_rating = excluded.course_rating, slope = excluded.slope,
    hole_pars = excluded.hole_pars, stroke_index = excluded.stroke_index, sort_order = excluded.sort_order;
insert into public.course_tees (course_id, name, color, course_rating, slope, hole_pars, stroke_index, sort_order)
  select id, 'Yellow', '#F7E21B', 72.3, 138, array[4,3,4,5,4,4,3,5,4,4,3,4,5,4,5,4,3,4]::int[], array[11,17,5,9,1,13,15,7,3,6,18,12,14,2,10,16,8,4]::int[], 2 from public.courses where slug = 'riverside-championship'
  on conflict (course_id, name) do update set color = excluded.color, course_rating = excluded.course_rating, slope = excluded.slope,
    hole_pars = excluded.hole_pars, stroke_index = excluded.stroke_index, sort_order = excluded.sort_order;
insert into public.course_tees (course_id, name, color, course_rating, slope, hole_pars, stroke_index, sort_order)
  select id, 'Yellow · Ladies', '#F7E21B', 72.4, 140, array[4,3,4,5,4,4,3,5,4,4,3,4,5,4,5,4,3,4]::int[], array[11,17,5,9,1,13,15,7,3,6,18,12,14,2,10,16,8,4]::int[], 3 from public.courses where slug = 'riverside-championship'
  on conflict (course_id, name) do update set color = excluded.color, course_rating = excluded.course_rating, slope = excluded.slope,
    hole_pars = excluded.hole_pars, stroke_index = excluded.stroke_index, sort_order = excluded.sort_order;
insert into public.course_tees (course_id, name, color, course_rating, slope, hole_pars, stroke_index, sort_order)
  select id, 'Blue', '#4F86F7', 70.4, 134, array[4,3,4,5,4,4,3,5,4,4,3,4,5,4,5,4,3,4]::int[], array[11,17,5,9,1,13,15,7,3,6,18,12,14,2,10,16,8,4]::int[], 4 from public.courses where slug = 'riverside-championship'
  on conflict (course_id, name) do update set color = excluded.color, course_rating = excluded.course_rating, slope = excluded.slope,
    hole_pars = excluded.hole_pars, stroke_index = excluded.stroke_index, sort_order = excluded.sort_order;
insert into public.course_tees (course_id, name, color, course_rating, slope, hole_pars, stroke_index, sort_order)
  select id, 'Blue · Ladies', '#4F86F7', 76.5, 139, array[4,3,4,5,4,4,3,5,4,4,3,4,5,4,5,4,3,4]::int[], array[11,17,5,9,1,13,15,7,3,6,18,12,14,2,10,16,8,4]::int[], 5 from public.courses where slug = 'riverside-championship'
  on conflict (course_id, name) do update set color = excluded.color, course_rating = excluded.course_rating, slope = excluded.slope,
    hole_pars = excluded.hole_pars, stroke_index = excluded.stroke_index, sort_order = excluded.sort_order;
insert into public.course_tees (course_id, name, color, course_rating, slope, hole_pars, stroke_index, sort_order)
  select id, 'Red', '#FF0000', 68.1, 128, array[4,3,4,5,4,4,3,5,4,4,3,4,5,4,5,4,3,4]::int[], array[11,17,5,9,1,13,15,7,3,6,18,12,14,2,10,16,8,4]::int[], 6 from public.courses where slug = 'riverside-championship'
  on conflict (course_id, name) do update set color = excluded.color, course_rating = excluded.course_rating, slope = excluded.slope,
    hole_pars = excluded.hole_pars, stroke_index = excluded.stroke_index, sort_order = excluded.sort_order;
insert into public.course_tees (course_id, name, color, course_rating, slope, hole_pars, stroke_index, sort_order)
  select id, 'Red · Ladies', '#FF0000', 74, 135, array[4,3,4,5,4,4,3,5,4,4,3,4,5,4,5,4,3,4]::int[], array[11,17,5,9,1,13,15,7,3,6,18,12,14,2,10,16,8,4]::int[], 7 from public.courses where slug = 'riverside-championship'
  on conflict (course_id, name) do update set color = excluded.color, course_rating = excluded.course_rating, slope = excluded.slope,
    hole_pars = excluded.hole_pars, stroke_index = excluded.stroke_index, sort_order = excluded.sort_order;

insert into public.courses (slug, club_name, name, city, country, holes, par) values ('riverside-executive', 'Riverside Golf Zagreb', 'Riverside Executive', 'Zagreb', 'Croatia', 18, 72)
  on conflict (slug) do update set name = excluded.name, holes = excluded.holes, par = excluded.par;
insert into public.course_tees (course_id, name, color, course_rating, slope, hole_pars, stroke_index, sort_order)
  select id, 'Yellow', '#F7E21B', 63.4, 109, array[5,4,4,3,4,5,4,4,3,5,4,4,3,4,5,4,4,3]::int[], array[7,15,3,9,1,5,11,13,17,8,16,4,10,2,6,12,14,18]::int[], 0 from public.courses where slug = 'riverside-executive'
  on conflict (course_id, name) do update set color = excluded.color, course_rating = excluded.course_rating, slope = excluded.slope,
    hole_pars = excluded.hole_pars, stroke_index = excluded.stroke_index, sort_order = excluded.sort_order;
insert into public.course_tees (course_id, name, color, course_rating, slope, hole_pars, stroke_index, sort_order)
  select id, 'Red', '#F03E4F', 65.4, 109, array[5,4,4,3,4,5,4,4,3,5,4,4,3,4,5,4,4,3]::int[], array[7,15,3,9,1,5,11,13,17,8,16,4,10,2,6,12,14,18]::int[], 1 from public.courses where slug = 'riverside-executive'
  on conflict (course_id, name) do update set color = excluded.color, course_rating = excluded.course_rating, slope = excluded.slope,
    hole_pars = excluded.hole_pars, stroke_index = excluded.stroke_index, sort_order = excluded.sort_order;

