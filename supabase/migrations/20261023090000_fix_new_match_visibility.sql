-- Fix: creating a match failed with "new row violates row-level security policy".
-- The read rule looked the match up by id, which can't see a row that is still being
-- inserted, so the app couldn't get its new match back. Check the row's own columns first.
drop policy if exists "members and friends read matches" on public.matches;
create policy "members and friends read matches" on public.matches for select to authenticated
  using (created_by = auth.uid() or public.is_league_member(league_id) or public.can_view_match(id));
