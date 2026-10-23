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
