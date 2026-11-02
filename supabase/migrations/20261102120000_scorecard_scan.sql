-- Scan a paper scorecard: the app sends a photo, Claude reads the scores, the app shows them
-- for review before anything is saved.
-- The Anthropic API key lives only in the Supabase Vault (secret name "anthropic_api_key").
-- The request runs in the background (pg_net), so slow reads never hit the database time limit:
-- scan_scorecard() starts it and scorecard_scan_result() is asked every few seconds for the answer.
create extension if not exists pg_net;

create table if not exists public.scorecard_scans (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null default auth.uid(),
  request_id bigint,
  result jsonb,
  error text,
  created_at timestamptz not null default now()
);
-- Only reachable through the two functions below.
alter table public.scorecard_scans enable row level security;

create or replace function public.scan_scorecard(m uuid, image text, media_type text default 'image/jpeg')
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  api_key text;
  x matches;
  n_holes int;
  offs int;
  names text;
  pars text;
  prompt text;
  req bigint;
  sid uuid;
  schema jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not can_score(m) then raise exception 'Only players in this match can add scores'; end if;
  if coalesce(length(image), 0) < 1000 then raise exception 'That photo did not come through. Try again.'; end if;
  if length(image) > 6000000 then raise exception 'That photo is too big. Try again a bit further away.'; end if;
  if media_type not in ('image/jpeg', 'image/png', 'image/webp') then media_type := 'image/jpeg'; end if;
  if (select count(*) from scorecard_scans where user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s 20 scans today. Enter the rest by hand or try again tomorrow.';
  end if;

  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'anthropic_api_key' limit 1;
  if api_key is null then raise exception 'Scorecard scanning is not set up yet (no API key in Supabase).'; end if;

  select * into x from matches where id = m;
  n_holes := x.holes;
  offs := case when x.nine = 'back' then 9 else 0 end;
  select string_agg(coalesce(nullif(p.nickname, ''), p.display_name), ', ')
    into names
    from match_players mp join profiles p on p.id = mp.user_id
   where mp.match_id = m;
  -- A 9-hole course played twice repeats its pars.
  select string_agg((offs + i)::text || ':' || coalesce(
           (t.hole_pars)[((offs + i - 1) % greatest(coalesce(array_length(t.hole_pars, 1), 18), 1)) + 1]::text, '?'),
           ' ' order by i)
    into pars
    from course_tees t, generate_series(1, n_holes) i
   where t.id = x.tee_id;

  prompt := 'This is a photo of a golf scorecard. Read the strokes each player took on each hole. '
    || 'The round is ' || n_holes || ' holes, holes ' || (offs + 1) || ' to ' || (offs + n_holes) || '. '
    || 'Players in the app for this round: ' || coalesce(names, 'unknown') || '. Names on the card may be '
    || 'nicknames, initials or first names; copy the name exactly as written on the card. '
    || coalesce('Pars by hole (hole:par): ' || pars || '. ', '')
    || 'Give one row per player who has scores written on the card, with exactly ' || n_holes
    || ' numbers in hole order starting at hole ' || (offs + 1) || '. Use null for a hole that is blank '
    || 'or that you cannot read. Ignore totals (OUT/IN/TOT), handicap, net, points and putts rows. '
    || 'Scores are gross strokes per hole, usually between 1 and 12. If a number is crossed out, use the '
    || 'corrected one. In "notes" say briefly anything you were unsure about, or leave it empty.';

  schema := jsonb_build_object(
    'type', 'object',
    'additionalProperties', false,
    'required', jsonb_build_array('players', 'notes'),
    'properties', jsonb_build_object(
      'notes', jsonb_build_object('type', 'string'),
      'players', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'additionalProperties', false,
          'required', jsonb_build_array('name', 'scores'),
          'properties', jsonb_build_object(
            'name', jsonb_build_object('type', 'string'),
            'scores', jsonb_build_object(
              'type', 'array',
              'items', jsonb_build_object('type', jsonb_build_array('integer', 'null'))
            )
          )
        )
      )
    )
  );

  req := net.http_post(
    url := 'https://api.anthropic.com/v1/messages',
    body := jsonb_build_object(
      'model', 'claude-opus-5-5',
      'max_tokens', 8000,
      'fallbacks', 'default',
      'output_config', jsonb_build_object(
        'effort', 'medium',
        'format', jsonb_build_object('type', 'json_schema', 'schema', schema)
      ),
      'messages', jsonb_build_array(jsonb_build_object(
        'role', 'user',
        'content', jsonb_build_array(
          jsonb_build_object('type', 'image', 'source', jsonb_build_object(
            'type', 'base64', 'media_type', media_type, 'data', image)),
          jsonb_build_object('type', 'text', 'text', prompt)
        )
      ))
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-api-key', api_key,
      'anthropic-version', '2023-06-01',
      'anthropic-beta', 'server-side-fallback-2026-07-01'
    ),
    timeout_milliseconds := 150000
  );

  insert into scorecard_scans (match_id, request_id) values (m, req) returning id into sid;
  return sid;
end;
$$;

-- Asked every few seconds by the app: {status: 'pending'} until the card is read,
-- then {status: 'done', players: [{name, scores}], notes} or {status: 'error', message}.
create or replace function public.scorecard_scan_result(s uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  sc scorecard_scans;
  r record;
  body jsonb;
  txt text;
  card jsonb;
begin
  select * into sc from scorecard_scans where id = s and user_id = auth.uid();
  if sc.id is null then raise exception 'Scan not found'; end if;
  if sc.result is not null then return jsonb_build_object('status', 'done') || sc.result; end if;
  if sc.error is not null then return jsonb_build_object('status', 'error', 'message', sc.error); end if;

  select * into r from net._http_response where id = sc.request_id;
  if not found then
    if sc.created_at < now() - interval '4 minutes' then
      update scorecard_scans set error = 'Reading the card took too long. Try again.' where id = s;
      return jsonb_build_object('status', 'error', 'message', 'Reading the card took too long. Try again.');
    end if;
    return jsonb_build_object('status', 'pending');
  end if;

  if r.timed_out or r.error_msg is not null then
    update scorecard_scans set error = 'Could not reach the card reader. Try again.' where id = s;
    return jsonb_build_object('status', 'error', 'message', 'Could not reach the card reader. Try again.');
  end if;

  begin
    body := r.content::jsonb;
  exception when others then
    body := null;
  end;
  if r.status_code <> 200 or body is null then
    update scorecard_scans
       set error = 'The card reader said no (error ' || r.status_code || '): '
                   || coalesce(body -> 'error' ->> 'message', left(r.content, 200))
     where id = s returning error into txt;
    return jsonb_build_object('status', 'error', 'message', txt);
  end if;
  if body ->> 'stop_reason' = 'refusal' then
    update scorecard_scans set error = 'The card reader could not read this photo. Try another one.' where id = s;
    return jsonb_build_object('status', 'error', 'message', 'The card reader could not read this photo. Try another one.');
  end if;

  select string_agg(b ->> 'text', '') into txt
    from jsonb_array_elements(coalesce(body -> 'content', '[]'::jsonb)) b
   where b ->> 'type' = 'text';
  begin
    card := txt::jsonb;
  exception when others then
    card := null;
  end;
  if card is null or jsonb_typeof(card -> 'players') <> 'array' then
    update scorecard_scans set error = 'Could not make out the scores. Try a sharper, straight-on photo.' where id = s;
    return jsonb_build_object('status', 'error', 'message', 'Could not make out the scores. Try a sharper, straight-on photo.');
  end if;

  update scorecard_scans set result = card where id = s;
  return jsonb_build_object('status', 'done') || card;
end;
$$;

revoke all on function public.scan_scorecard(uuid, text, text) from public, anon;
revoke all on function public.scorecard_scan_result(uuid) from public, anon;
grant execute on function public.scan_scorecard(uuid, text, text) to authenticated;
grant execute on function public.scorecard_scan_result(uuid) to authenticated;
