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
