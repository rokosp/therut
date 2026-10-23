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

-- Finished seasons are locked: no more matches, scores, bonuses or settings changes.
-- Casual matches live outside any league; friends join them with a short code.

alter table public.leagues add column if not exists finished_at timestamptz;

alter table public.matches alter column league_id drop not null;
alter table public.matches add column if not exists join_code text unique
  default upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));

create or replace function public.league_locked(l uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from leagues where id = l and finished_at is not null);
$$;

-- Players (and whoever set the match up) keep score while it is open; league admins can
-- fix scores later. Nothing changes once the league's season is finished.
create or replace function public.can_score(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches x where x.id = m
      and not league_locked(x.league_id)
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

-- A match is visible to its league, whoever set it up, and anyone playing or friends with a player.
create or replace function public.can_view_match(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from matches x where x.id = m and (is_league_member(x.league_id) or x.created_by = auth.uid()))
      or exists (select 1 from match_players p where p.match_id = m and (p.user_id = auth.uid() or are_friends(auth.uid(), p.user_id)));
$$;

drop policy if exists "admins update league" on public.leagues;
create policy "admins update league" on public.leagues for update to authenticated
  using (public.is_league_admin(id) and finished_at is null)
  with check (public.is_league_admin(id));

drop policy if exists "members create matches" on public.matches;
create policy "members create matches" on public.matches for insert to authenticated
  with check (
    created_by = auth.uid()
    and (league_id is null or (public.is_league_member(league_id) and not public.league_locked(league_id)))
  );
drop policy if exists "creator or admin edits match" on public.matches;
create policy "creator or admin edits match" on public.matches for update to authenticated
  using ((created_by = auth.uid() or public.is_league_admin(league_id)) and not public.league_locked(league_id))
  with check (league_id is null or public.is_league_member(league_id));
drop policy if exists "creator or admin deletes match" on public.matches;
create policy "creator or admin deletes match" on public.matches for delete to authenticated
  using ((created_by = auth.uid() or public.is_league_admin(league_id)) and not public.league_locked(league_id));

drop policy if exists "members add players" on public.match_players;
create policy "members add players" on public.match_players for insert to authenticated
  with check (
    public.can_score(match_id)
    and (public.match_league(match_id) is null or public.is_league_member(public.match_league(match_id)))
  );

drop policy if exists "awarder or admin removes bonus" on public.bonus_awards;
create policy "awarder or admin removes bonus" on public.bonus_awards for delete to authenticated
  using (
    (created_by = auth.uid() or public.is_league_admin(public.match_league(match_id)))
    and not public.league_locked(public.match_league(match_id))
  );

-- Join an open match with its code.
create or replace function public.join_match(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare mid uuid; st text; lg uuid;
begin
  select id, status, league_id into mid, st, lg from matches where join_code = upper(trim(code));
  if mid is null then raise exception 'No match with that code'; end if;
  if st <> 'open' then raise exception 'That match is already finished'; end if;
  if lg is not null and not is_league_member(lg) then raise exception 'That match is in a league you are not in'; end if;
  if league_locked(lg) then raise exception 'That season is finished'; end if;
  insert into match_players (match_id, user_id) values (mid, auth.uid()) on conflict do nothing;
  return mid;
end $$;

-- Guest players: people on a scorecard who don't have an account yet.
-- A league admin can add one, and gets a claim code for them. When the friend signs up,
-- they enter the code on their Profile and every score, league and bonus moves to their account.

alter table public.profiles add column if not exists is_guest boolean not null default false;
update public.profiles set is_guest = true
  where id in (select id from auth.users where email like '%@therut.invalid');

create table if not exists public.guest_claims (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique default upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6)),
  created_at timestamptz not null default now()
);
-- Only reachable through the functions below.
alter table public.guest_claims enable row level security;

-- Am I an admin of a league this player is in?
create or replace function public.admin_of_player(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from league_members g join league_members me on me.league_id = g.league_id
    where g.user_id = p and me.user_id = auth.uid() and me.role = 'admin'
  );
$$;

-- Add a guest player to a league (admins only).
create or replace function public.add_guest_player(league uuid, name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid := gen_random_uuid();
begin
  if not is_league_admin(league) then raise exception 'Only league admins can add guest players'; end if;
  if coalesce(trim(name), '') = '' then raise exception 'Give the guest a name'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, confirmation_token, recovery_token,
                          email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', g, 'authenticated', 'authenticated', 'guest-' || g || '@therut.invalid',
          '', '', '', '', '', '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', trim(name)), now(), now());
  update profiles set is_guest = true, display_name = trim(name) where id = g;
  insert into league_members (league_id, user_id) values (league, g);
  return g;
end $$;

-- The claim code for a guest, for an admin of one of their leagues.
create or replace function public.guest_claim_code(p uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not exists (select 1 from profiles where id = p and is_guest) then raise exception 'Not a guest player'; end if;
  if not admin_of_player(p) then raise exception 'Only a league admin can see this code'; end if;
  insert into guest_claims (profile_id) values (p) on conflict do nothing;
  select code into c from guest_claims where profile_id = p;
  return c;
end $$;

-- Take over a guest player's history with their claim code.
create or replace function public.claim_guest(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid; me uuid := auth.uid();
begin
  select profile_id into g from guest_claims where guest_claims.code = upper(trim(claim_guest.code));
  if g is null then raise exception 'No guest player with that code'; end if;
  if me is null or me = g then raise exception 'Sign in with your own account first'; end if;
  if exists (select 1 from profiles where id = me and is_guest) then raise exception 'Guest players cannot claim'; end if;

  -- Scores (if both somehow played the same match, keep the real account's card).
  update match_players set user_id = me
    where user_id = g and match_id not in (select match_id from match_players where user_id = me);
  delete from match_players where user_id = g;

  insert into league_members (league_id, user_id, role)
    select league_id, me, role from league_members where user_id = g
    on conflict (league_id, user_id) do nothing;
  delete from league_members where user_id = g;

  update bonus_awards set user_id = me where user_id = g;
  update bonus_awards set created_by = me where created_by = g;
  update matches set created_by = me where created_by = g;
  update leagues set created_by = me where created_by = g;
  delete from friendships where g in (requester, addressee);

  update profiles set self_handicap = coalesce(self_handicap, (select self_handicap from profiles where id = g))
    where id = me;
  delete from auth.users where id = g; -- removes the guest profile and its code too
  return me;
end $$;

-- Profile photos, stored in a public "avatars" bucket. Each player can only write their own folder.
alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;

drop policy if exists "avatar images are public" on storage.objects;
create policy "avatar images are public" on storage.objects for select
  using (bucket_id = 'avatars');
drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "replace own avatar" on storage.objects;
create policy "replace own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "delete own avatar" on storage.objects;
create policy "delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

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

-- Scheduled matches (planned for a future date and time) and in-app notifications.

alter table public.matches drop constraint if exists matches_status_check;
alter table public.matches add constraint matches_status_check check (status in ('scheduled', 'open', 'final'));
alter table public.matches add column if not exists starts_at timestamptz;

-- Players can be added (and the line-up changed) while a match is scheduled, as well as while it's live.
create or replace function public.can_score(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches x where x.id = m
      and not league_locked(x.league_id)
      and (
        is_league_admin(x.league_id)
        or (
          x.status in ('open', 'scheduled')
          and (
            x.created_by = auth.uid()
            or exists (select 1 from match_players p where p.match_id = m and p.user_id = auth.uid())
          )
        )
      )
  );
$$;

-- Anyone in a scheduled match (or whoever planned it, or a league admin) can start it.
create or replace function public.start_match(m uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update matches x set status = 'open', played_on = current_date
  where x.id = m and x.status = 'scheduled' and not league_locked(x.league_id)
    and (x.created_by = auth.uid() or is_league_admin(x.league_id)
         or exists (select 1 from match_players p where p.match_id = m and p.user_id = auth.uid()));
  if not found then raise exception 'You can''t start this match'; end if;
end $$;

-- Joining with a code also works before a scheduled match starts.
create or replace function public.join_match(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare mid uuid; st text; lg uuid;
begin
  select id, status, league_id into mid, st, lg from matches where join_code = upper(trim(code));
  if mid is null then raise exception 'No match with that code'; end if;
  if st = 'final' then raise exception 'That match is already finished'; end if;
  if lg is not null and not is_league_member(lg) then raise exception 'That match is in a league you are not in'; end if;
  if league_locked(lg) then raise exception 'That season is finished'; end if;
  insert into match_players (match_id, user_id) values (mid, auth.uid()) on conflict do nothing;
  return mid;
end $$;

-- Notifications -----------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('invite', 'live')),
  title text not null,
  body text,
  match_id uuid references public.matches (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create unique index if not exists notifications_once on public.notifications (user_id, match_id, kind);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;

drop policy if exists "read my notifications" on public.notifications;
create policy "read my notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "mark my notifications read" on public.notifications;
create policy "mark my notifications read" on public.notifications for update to authenticated using (user_id = auth.uid());
drop policy if exists "clear my notifications" on public.notifications;
create policy "clear my notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());

create or replace function public.player_name(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(nickname, ''), nullif(display_name, ''), 'A friend') from profiles where id = u;
$$;

create or replace function public.course_label(m uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select c.name from courses c join matches x on x.course_id = c.id where x.id = m), 'the course');
$$;

-- Tell a player's friends (who aren't in the match) that they're teeing off.
create or replace function public.notify_live(m uuid, u uuid) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body, match_id)
  select f.friend, 'live', player_name(u) || ' is teeing off', 'Live at ' || course_label(m) || '. Tap to watch.', m
  from (
    select case when requester = u then addressee else requester end as friend
    from friendships where status = 'accepted' and u in (requester, addressee)
  ) f
  where not exists (select 1 from match_players p where p.match_id = m and p.user_id = f.friend)
  on conflict do nothing;
$$;

create or replace function public.on_match_player_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare x matches;
begin
  select * into x from matches where id = new.match_id;
  if x.status = 'scheduled' and new.user_id <> x.created_by then
    insert into notifications (user_id, kind, title, body, match_id)
    values (
      new.user_id, 'invite',
      player_name(x.created_by) || ' invited you to a match',
      course_label(x.id) || ' · ' ||
        coalesce(to_char(x.starts_at at time zone 'Europe/Zagreb', 'Dy DD Mon, HH24:MI'), to_char(x.played_on, 'Dy DD Mon')),
      x.id
    ) on conflict do nothing;
  elsif x.status = 'open' and x.created_at > now() - interval '1 hour' then
    perform notify_live(x.id, new.user_id);
  end if;
  return new;
end $$;

drop trigger if exists match_player_added on public.match_players;
create trigger match_player_added after insert on public.match_players
  for each row execute function public.on_match_player_added();

create or replace function public.on_match_started() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if old.status = 'scheduled' and new.status = 'open' then
    for p in select user_id from match_players where match_id = new.id loop
      perform notify_live(new.id, p.user_id);
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists match_started on public.matches;
create trigger match_started after update of status on public.matches
  for each row execute function public.on_match_started();

-- Fix: creating a match failed with "new row violates row-level security policy".
-- The read rule looked the match up by id, which can't see a row that is still being
-- inserted, so the app couldn't get its new match back. Check the row's own columns first.
drop policy if exists "members and friends read matches" on public.matches;
create policy "members and friends read matches" on public.matches for select to authenticated
  using (created_by = auth.uid() or public.is_league_member(league_id) or public.can_view_match(id));

-- Inbox notifications for friend requests and accepted requests.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('invite', 'live', 'friend_request', 'friend_accepted'));
alter table public.notifications add column if not exists from_user uuid references public.profiles (id) on delete cascade;

create or replace function public.on_friendship_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    -- Clear an older unread request from the same person so it isn't listed twice.
    delete from notifications where user_id = new.addressee and from_user = new.requester and kind = 'friend_request';
    insert into notifications (user_id, kind, title, body, from_user)
    values (new.addressee, 'friend_request', player_name(new.requester) || ' added you as a friend',
            'Tap to accept it on your profile.', new.requester);
  elsif new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    delete from notifications where user_id = new.addressee and from_user = new.requester and kind = 'friend_request';
    insert into notifications (user_id, kind, title, body, from_user)
    values (new.requester, 'friend_accepted', player_name(new.addressee) || ' accepted your friend request',
            'Tap to see their profile.', new.addressee);
  end if;
  return new;
end $$;

drop trigger if exists friendship_change on public.friendships;
create trigger friendship_change after insert or update of status on public.friendships
  for each row execute function public.on_friendship_change();

-- Achievements are worked out in the app from match history. This only stores which
-- badges (up to 4) a player picked to show off on their profile.
alter table public.profiles add column if not exists showcase text[] not null default '{}';
alter table public.profiles drop constraint if exists profiles_showcase_max;
alter table public.profiles add constraint profiles_showcase_max check (coalesce(array_length(showcase, 1), 0) <= 4);

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
