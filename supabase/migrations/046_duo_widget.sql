-- The buddy list on the home-screen widget.
--
-- A widget is a separate process. It cannot reuse the app's sign-in, and a long-lived
-- login token should not sit in a shared folder. So the app asks for a widget token:
-- 64 hex characters that can do exactly one thing, list the buddies who are at a hall
-- right now. Only its SHA-256 hash is stored. The token lives in the app group on the
-- phone, a server route (api/duo-widget.js) hashes what the widget sends and calls
-- duo_widget_list as the service role, and signing out revokes the token.
--
-- Nothing here returns an email, a plan, a meal or anything a buddy did not choose to
-- share with "I'm here".
--
-- Run after 045. Safe to run more than once.

create table if not exists public.duo_widget_tokens (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  token_hash   text        not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists duo_widget_tokens_user on public.duo_widget_tokens (user_id, created_at desc);

alter table public.duo_widget_tokens enable row level security;
revoke all on public.duo_widget_tokens from public, anon, authenticated;

-- A new token for this phone. The plain token is returned once and never stored. A
-- student keeps at most five, so a phone that reinstalls does not pile them up.
create or replace function public.duo_widget_token()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  v_token := encode(uuid_send(gen_random_uuid()), 'hex') || encode(uuid_send(gen_random_uuid()), 'hex');
  insert into public.duo_widget_tokens (user_id, token_hash)
  values (v_uid, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));

  delete from public.duo_widget_tokens t
   where t.user_id = v_uid
     and t.id not in (select x.id from public.duo_widget_tokens x
                      where x.user_id = v_uid order by x.created_at desc limit 5);
  return v_token;
end;
$$;

-- Called on sign out, before the session ends.
create or replace function public.duo_widget_revoke(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  delete from public.duo_widget_tokens t
   where t.user_id = auth.uid()
     and t.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
end;
$$;

-- The list the widget shows, for the person who owns the token. Only the server route
-- may call this: it takes the hash of a token, not a signed-in user. An unknown hash
-- raises invalid_token so the route can answer 401 and the widget can ask to set up.
create or replace function public.duo_widget_list(p_hash text)
returns table(
  display_name  text,
  hall          text,
  meal          text,
  here_at       timestamptz,
  here_until    timestamptz,
  mascot_outfit text,
  mascot_color  text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tok public.duo_widget_tokens%rowtype;
begin
  select * into v_tok from public.duo_widget_tokens t where t.token_hash = p_hash;
  if not found then raise exception 'invalid_token'; end if;

  if v_tok.last_used_at is null or v_tok.last_used_at < now() - interval '1 hour' then
    update public.duo_widget_tokens t set last_used_at = now() where t.id = v_tok.id;
  end if;

  return query
    select p.display_name, hp.hall, hp.meal, hp.created_at, hp.expires_at, p.mascot_outfit, p.mascot_color
    from public.friendships f
    join public.profiles p
      on p.id = case when f.user_a = v_tok.user_id then f.user_b else f.user_a end
    join public.here_pings hp
      on hp.sender = p.id and hp.recipient = v_tok.user_id and hp.expires_at > now()
    where f.status = 'active' and v_tok.user_id in (f.user_a, f.user_b)
    order by hp.created_at desc
    limit 8;
end;
$$;

-- ── Who may call what ─────────────────────────────────────────────────────────

do $$
declare f text;
begin
  foreach f in array array['duo_widget_token()', 'duo_widget_revoke(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

revoke all on function public.duo_widget_list(text) from public, anon, authenticated;
grant execute on function public.duo_widget_list(text) to service_role;

notify pgrst, 'reload schema';
