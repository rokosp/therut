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
