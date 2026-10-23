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
