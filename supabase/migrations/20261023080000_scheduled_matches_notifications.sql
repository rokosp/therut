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
