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
