-- Trash talk: short messages and emoji on a match, for anyone who can see the match.

create table if not exists public.match_chat (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists match_chat_match on public.match_chat (match_id, created_at);
alter table public.match_chat enable row level security;

drop policy if exists "watchers read trash talk" on public.match_chat;
create policy "watchers read trash talk" on public.match_chat for select to authenticated
  using (public.can_view_match(match_id));
drop policy if exists "watchers talk trash" on public.match_chat;
create policy "watchers talk trash" on public.match_chat for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_match(match_id));
drop policy if exists "take back your trash" on public.match_chat;
create policy "take back your trash" on public.match_chat for delete to authenticated
  using (user_id = auth.uid());
