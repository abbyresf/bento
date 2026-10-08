-- "I'm here" gets a length the sender chooses.
--
-- Until now every tap lasted a fixed 90 minutes. A meal rarely takes that long, so a
-- friend who forgot to tap "I've left" stayed at the hall in everyone's list for far
-- too long. Each tap now carries its own end time (expires_at). The sender picks 30,
-- 60 or 90 minutes in the app, 60 by default, and the database accepts 15 to 120.
-- After that moment the tap is gone from every friend's list without anyone doing
-- anything. "I've left" (duo_clear_here) still ends it early.
--
-- Run after 043. Safe to run more than once.

-- ── The column ────────────────────────────────────────────────────────────────

alter table public.here_pings add column if not exists expires_at timestamptz;

update public.here_pings
   set expires_at = created_at + interval '90 minutes'
 where expires_at is null;

alter table public.here_pings alter column expires_at set not null;
alter table public.here_pings alter column expires_at set default (now() + interval '60 minutes');

create index if not exists here_pings_expires on public.here_pings (recipient, expires_at);

-- ── Limits ────────────────────────────────────────────────────────────────────

create or replace function public.duo_limit(p_name text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_name
    when 'friends'            then 20
    when 'open_invites'       then 5
    when 'redeem_per_hour'    then 10
    when 'pings_per_day'      then 6
    when 'ping_default_mins'  then 60
    when 'ping_min_mins'      then 15
    when 'ping_max_mins'      then 120
    else 0
  end;
$$;

-- ── The friend list, with when each tap ends ──────────────────────────────────
-- The return type changes, so the old function has to go first.

drop function if exists public.duo_friends();

create function public.duo_friends()
returns table(
  friend_id    uuid,
  display_name text,
  started_at   timestamptz,
  i_share      boolean,
  here_hall    text,
  here_meal    text,
  here_at      timestamptz,
  here_until   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  return query
    select p.id,
           p.display_name,
           f.started_at,
           case when f.user_a = v_uid then f.share_a else f.share_b end,
           hp.hall,
           hp.meal,
           hp.created_at,
           hp.expires_at
    from public.friendships f
    join public.profiles p
      on p.id = case when f.user_a = v_uid then f.user_b else f.user_a end
    left join public.here_pings hp
      on hp.sender = p.id and hp.recipient = v_uid and hp.expires_at > now()
    where f.status = 'active' and v_uid in (f.user_a, f.user_b)
    order by p.display_name;
end;
$$;

-- ── "I'm here" with a length ──────────────────────────────────────────────────

drop function if exists public.duo_ping_here(text, text, uuid[]);
drop function if exists public.duo_ping_here(text, text, uuid[], integer);

create function public.duo_ping_here(
  p_hall text, p_meal text, p_friends uuid[] default null, p_minutes integer default null
)
returns table(recipient uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_hall text := btrim(coalesce(p_hall, ''));
  v_date date := (now() at time zone 'America/New_York')::date;
  v_mins integer := least(
    greatest(coalesce(p_minutes, public.duo_limit('ping_default_mins')), public.duo_limit('ping_min_mins')),
    public.duo_limit('ping_max_mins')
  );
  v_ids  uuid[];
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if char_length(v_hall) not between 1 and 40 then raise exception 'invalid_hall'; end if;
  if p_meal is null or p_meal not in ('breakfast', 'lunch', 'dinner') then
    raise exception 'invalid_meal';
  end if;

  perform public.duo_purge();

  if (select count(*) from public.duo_ping_log l
      where l.user_id = v_uid and l.at > now() - interval '24 hours')
     >= public.duo_limit('pings_per_day') then
    raise exception 'ping_limit';
  end if;

  select coalesce(array_agg(case when f.user_a = v_uid then f.user_b else f.user_a end), '{}')
    into v_ids
  from public.friendships f
  where f.status = 'active' and v_uid in (f.user_a, f.user_b)
    and case when f.user_a = v_uid then f.share_a else f.share_b end
    and (p_friends is null
         or (case when f.user_a = v_uid then f.user_b else f.user_a end) = any (p_friends));

  if array_length(v_ids, 1) is null then return; end if;

  insert into public.duo_ping_log (user_id) values (v_uid);

  insert into public.here_pings (sender, recipient, hall, meal, meal_date, created_at, expires_at)
  select v_uid, r, v_hall, p_meal, v_date, now(), now() + make_interval(mins => v_mins)
  from unnest(v_ids) as r
  on conflict on constraint here_pings_pair do update
    set hall = excluded.hall, meal = excluded.meal, meal_date = excluded.meal_date,
        created_at = excluded.created_at, expires_at = excluded.expires_at;

  return query select r from unnest(v_ids) as r;
end;
$$;

-- ── Housekeeping: taps are deleted a day after they ended ─────────────────────

create or replace function public.duo_purge()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.here_pings     where expires_at < now() - interval '24 hours';
  delete from public.duo_ping_log   where at         < now() - interval '48 hours';
  delete from public.duo_attempts   where at         < now() - interval '1 hour';
  delete from public.friend_invites where expires_at < now() - interval '7 days';
$$;
revoke all on function public.duo_purge() from public, anon, authenticated;

-- ── Who may call what ─────────────────────────────────────────────────────────

do $$
declare f text;
begin
  foreach f in array array['duo_friends()', 'duo_ping_here(text, text, uuid[], integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
