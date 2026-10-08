-- Duo, phase 1: friends, invites, "I'm here", and the shared streak.
--
-- Design: SOCIAL_SPEC.md. Nothing here is readable by a friend directly. Every
-- table below has row-level security on and NO policy for clients, and direct
-- table access is revoked, so the only way in is the functions at the bottom.
-- They run as the table owner (security definer), check auth.uid() first, and
-- return only the fields the app needs.
--
-- Do not add a Pulse admin policy to any of these tables. Migration 009 did that
-- for profiles, meal_history and dietary_restrictions and it should not spread.
--
-- Every row points at auth.users with on delete cascade, so delete_user() removes
-- a student's friendships, invites and pings without any extra step.
--
-- Safe to run more than once.

-- ── Profile columns ───────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists push_social_enabled boolean not null default false;

alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles
  add constraint profiles_display_name_len
  check (display_name is null or char_length(btrim(display_name)) between 1 and 20);

comment on column public.profiles.display_name is
  'Name friends see. Free text, 1 to 20 characters. Set before the first invite.';
comment on column public.profiles.push_social_enabled is
  'Separate from push_enabled: friend alerts can be off while meal reminders stay on.';

-- ── Tables ────────────────────────────────────────────────────────────────────

-- One row per pair, stored with user_a < user_b so a pair can only exist once.
-- share_a is whether user_a lets user_b see their "I'm here", and share_b the
-- other way round. The invite code is the acceptance, so there is no pending
-- state: a row exists once someone redeemed a code.
create table if not exists public.friendships (
  id           uuid        primary key default gen_random_uuid(),
  user_a       uuid        not null references auth.users(id) on delete cascade,
  user_b       uuid        not null references auth.users(id) on delete cascade,
  requested_by uuid        not null,
  status       text        not null default 'active'
                           check (status in ('active', 'ended', 'blocked')),
  blocked_by   uuid,
  share_a      boolean     not null default true,
  share_b      boolean     not null default true,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  constraint friendships_ordered check (user_a < user_b),
  constraint friendships_pair unique (user_a, user_b)
);
create index if not exists friendships_user_b on public.friendships (user_b);

-- Only the hash of a code is stored. The code itself is shown once.
create table if not exists public.friend_invites (
  id         uuid        primary key default gen_random_uuid(),
  inviter    uuid        not null references auth.users(id) on delete cascade,
  code_hash  text        not null unique,
  expires_at timestamptz not null,
  used_by    uuid        references auth.users(id) on delete set null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists friend_invites_inviter on public.friend_invites (inviter);

-- One live "I'm here" per sender and recipient. Replaced by the next tap.
create table if not exists public.here_pings (
  id         uuid        primary key default gen_random_uuid(),
  sender     uuid        not null references auth.users(id) on delete cascade,
  recipient  uuid        not null references auth.users(id) on delete cascade,
  hall       text        not null check (char_length(hall) between 1 and 40),
  meal       text        not null check (meal in ('breakfast', 'lunch', 'dinner')),
  meal_date  date        not null,
  created_at timestamptz not null default now(),
  constraint here_pings_pair unique (sender, recipient)
);
create index if not exists here_pings_recipient on public.here_pings (recipient, created_at desc);

-- A count of taps, kept apart from here_pings because a new tap replaces the old
-- row, which would reset the daily limit if it were counted there.
create table if not exists public.duo_ping_log (
  user_id uuid        not null references auth.users(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists duo_ping_log_user on public.duo_ping_log (user_id, at desc);

-- Failed and successful redemptions, to slow down guessing a code.
create table if not exists public.duo_attempts (
  user_id uuid        not null references auth.users(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists duo_attempts_user on public.duo_attempts (user_id, at desc);

-- ── Lock the tables ───────────────────────────────────────────────────────────

alter table public.friendships    enable row level security;
alter table public.friend_invites enable row level security;
alter table public.here_pings     enable row level security;
alter table public.duo_ping_log   enable row level security;
alter table public.duo_attempts   enable row level security;

revoke all on public.friendships    from public, anon, authenticated;
revoke all on public.friend_invites from public, anon, authenticated;
revoke all on public.here_pings     from public, anon, authenticated;
revoke all on public.duo_ping_log   from public, anon, authenticated;
revoke all on public.duo_attempts   from public, anon, authenticated;

-- ── Limits ────────────────────────────────────────────────────────────────────
-- One place to change them.

create or replace function public.duo_limit(p_name text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_name
    when 'friends'          then 20
    when 'open_invites'     then 5
    when 'redeem_per_hour'  then 10
    when 'pings_per_day'    then 6
    when 'ping_minutes'     then 90
    else 0
  end;
$$;

-- ── Housekeeping ──────────────────────────────────────────────────────────────

create or replace function public.duo_purge()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.here_pings     where created_at < now() - interval '24 hours';
  delete from public.duo_ping_log   where at         < now() - interval '48 hours';
  delete from public.duo_attempts   where at         < now() - interval '1 hour';
  delete from public.friend_invites where expires_at < now() - interval '7 days';
$$;
revoke all on function public.duo_purge() from public, anon, authenticated;

-- ── Invites ───────────────────────────────────────────────────────────────────

-- Returns a code like 7KQ2M9XA. It is shown once and only its hash is kept.
create or replace function public.duo_create_invite()
returns table(code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- no I, L or O
  v_bytes    bytea;
  v_code     text := '';
  v_expires  timestamptz := now() + interval '24 hours';
  i          integer;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.display_name is not null and p.university is not null
  ) then
    raise exception 'profile_incomplete';
  end if;

  if (select count(*) from public.friend_invites f
      where f.inviter = v_uid and f.used_at is null and f.expires_at > now())
     >= public.duo_limit('open_invites') then
    raise exception 'too_many_invites';
  end if;

  -- Bytes 0 to 5 and 9 to 12 of a version 4 uuid are random. 6 and 8 are not.
  v_bytes := uuid_send(gen_random_uuid());
  for i in 0..7 loop
    v_code := v_code || substr(
      v_alphabet,
      1 + (get_byte(v_bytes, case when i < 6 then i else i + 3 end) % length(v_alphabet)),
      1
    );
  end loop;

  insert into public.friend_invites (inviter, code_hash, expires_at)
  values (v_uid, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), v_expires);

  return query select v_code, v_expires;
end;
$$;

-- Turns a code into a friendship. Every failure the person could use to learn
-- something (no such code, used, expired, different school, blocked) says
-- the same thing: invalid_code.
--
-- It reports failure as a row with a status, not as an exception. An exception
-- rolls back the whole call, including the attempt recorded above it, so a
-- wrong guess would never count against the limit.
create or replace function public.duo_redeem(p_code text)
returns table(status text, friend_id uuid, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_code    text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_invite  public.friend_invites%rowtype;
  v_a       uuid;
  v_b       uuid;
  v_friend  public.friendships%rowtype;
  v_uni_me  text;
  v_uni_inv text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select p.university into v_uni_me
  from public.profiles p
  where p.id = v_uid and p.display_name is not null;
  if v_uni_me is null then raise exception 'profile_incomplete'; end if;

  delete from public.duo_attempts a where a.at < now() - interval '1 hour';
  if (select count(*) from public.duo_attempts a where a.user_id = v_uid)
     >= public.duo_limit('redeem_per_hour') then
    return query select 'too_many_attempts'::text, null::uuid, null::text;
    return;
  end if;
  insert into public.duo_attempts (user_id) values (v_uid);

  select * into v_invite
  from public.friend_invites f
  where f.code_hash = encode(sha256(convert_to(v_code, 'UTF8')), 'hex')
    and f.used_at is null and f.expires_at > now()
  for update;
  if not found or v_invite.inviter = v_uid then
    return query select 'invalid_code'::text, null::uuid, null::text;
    return;
  end if;

  select p.university into v_uni_inv from public.profiles p where p.id = v_invite.inviter;
  if v_uni_inv is distinct from v_uni_me then
    return query select 'invalid_code'::text, null::uuid, null::text;
    return;
  end if;

  v_a := least(v_uid, v_invite.inviter);
  v_b := greatest(v_uid, v_invite.inviter);

  select * into v_friend from public.friendships f where f.user_a = v_a and f.user_b = v_b;

  if found and v_friend.status = 'blocked' then
    return query select 'invalid_code'::text, null::uuid, null::text;
    return;
  end if;

  if not found or v_friend.status = 'ended' then
    if (select count(*) from public.friendships f
        where f.status = 'active' and v_uid in (f.user_a, f.user_b))
       >= public.duo_limit('friends')
       or (select count(*) from public.friendships f
           where f.status = 'active' and v_invite.inviter in (f.user_a, f.user_b))
       >= public.duo_limit('friends') then
      return query select 'friend_limit'::text, null::uuid, null::text;
      return;
    end if;

    if found then
      -- A friendship that ended starts again from now, so the shared streak
      -- does not borrow days from before.
      update public.friendships f
         set status = 'active', ended_at = null, blocked_by = null,
             started_at = now(), share_a = true, share_b = true,
             requested_by = v_invite.inviter
       where f.id = v_friend.id;
    else
      insert into public.friendships (user_a, user_b, requested_by)
      values (v_a, v_b, v_invite.inviter);
    end if;
  end if;

  update public.friend_invites f
     set used_by = v_uid, used_at = now()
   where f.id = v_invite.id;

  return query
    select 'ok'::text, v_invite.inviter, p.display_name
    from public.profiles p where p.id = v_invite.inviter;
end;
$$;

-- ── Friends and "I'm here" ────────────────────────────────────────────────────

-- The caller's friends, with the live "I'm here" each one has sent them.
create or replace function public.duo_friends()
returns table(
  friend_id    uuid,
  display_name text,
  started_at   timestamptz,
  i_share      boolean,
  here_hall    text,
  here_meal    text,
  here_at      timestamptz
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
           hp.created_at
    from public.friendships f
    join public.profiles p
      on p.id = case when f.user_a = v_uid then f.user_b else f.user_a end
    left join public.here_pings hp
      on hp.sender = p.id and hp.recipient = v_uid
     and hp.created_at > now() - make_interval(mins => public.duo_limit('ping_minutes'))
    where f.status = 'active' and v_uid in (f.user_a, f.user_b)
    order by p.display_name;
end;
$$;

-- Sends "I'm here" to the chosen friends, skipping anyone the caller has switched
-- off. Returns who it reached, so the push route knows whom to notify. p_friends
-- null means every friend the caller shares with.
create or replace function public.duo_ping_here(p_hall text, p_meal text, p_friends uuid[] default null)
returns table(recipient uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_hall text := btrim(coalesce(p_hall, ''));
  v_date date := (now() at time zone 'America/New_York')::date;
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

  insert into public.here_pings (sender, recipient, hall, meal, meal_date)
  select v_uid, r, v_hall, p_meal, v_date from unnest(v_ids) as r
  on conflict on constraint here_pings_pair do update
    set hall = excluded.hall, meal = excluded.meal,
        meal_date = excluded.meal_date, created_at = now();

  return query select r from unnest(v_ids) as r;
end;
$$;

-- "I've left": clears every live ping the caller sent.
create or replace function public.duo_clear_here()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  delete from public.here_pings h where h.sender = auth.uid();
end;
$$;

-- Switch "I'm here" on or off for one friend.
create or replace function public.duo_set_sharing(p_friend uuid, p_share boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  update public.friendships f
     set share_a = case when f.user_a = v_uid then p_share else f.share_a end,
         share_b = case when f.user_b = v_uid then p_share else f.share_b end
   where f.status = 'active'
     and f.user_a = least(v_uid, p_friend) and f.user_b = greatest(v_uid, p_friend);
  if not p_share then
    delete from public.here_pings h where h.sender = v_uid and h.recipient = p_friend;
  end if;
end;
$$;

-- ── Ending a friendship ───────────────────────────────────────────────────────

-- Quiet on both sides: the other person just stops seeing this one in their list.
create or replace function public.duo_end(p_friend uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  update public.friendships f
     set status = 'ended', ended_at = now()
   where f.status = 'active'
     and f.user_a = least(v_uid, p_friend) and f.user_b = greatest(v_uid, p_friend);
  delete from public.here_pings h
   where (h.sender = v_uid and h.recipient = p_friend)
      or (h.sender = p_friend and h.recipient = v_uid);
end;
$$;

-- The blocked person sees the same thing as an ended friendship, and cannot
-- redeem a code from the blocker (duo_redeem reports invalid_code).
create or replace function public.duo_block(p_friend uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  update public.friendships f
     set status = 'blocked', blocked_by = v_uid, ended_at = now()
   where f.status in ('active', 'ended')
     and f.user_a = least(v_uid, p_friend) and f.user_b = greatest(v_uid, p_friend);
  delete from public.here_pings h
   where (h.sender = v_uid and h.recipient = p_friend)
      or (h.sender = p_friend and h.recipient = v_uid);
end;
$$;

-- ── Shared streak and week counts ─────────────────────────────────────────────
-- Worked out from both people's confirmed meals each time. Nothing is stored and
-- no client can move it. Days are Eastern, and only days since the friendship
-- started count. The rule matches increment_streak: a day with no dining open is
-- skipped, one missed open day is forgiven, two in a row end the streak. Today
-- not being done yet is not a miss.

create or replace function public.duo_streak(p_friend uuid)
returns table(current_streak integer, me_today boolean, friend_today boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_today  date := (now() at time zone 'America/New_York')::date;
  v_start  date;
  v_d      date;
  v_streak integer := 0;
  v_gap    integer := 0;
  v_me     boolean;
  v_fr     boolean;
  v_open   boolean;
  v_me_today boolean := false;
  v_fr_today boolean := false;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select (f.started_at at time zone 'America/New_York')::date into v_start
  from public.friendships f
  where f.status = 'active'
    and f.user_a = least(v_uid, p_friend) and f.user_b = greatest(v_uid, p_friend);
  if v_start is null then raise exception 'not_friends'; end if;

  v_d := v_today;
  while v_d >= v_start and v_d > v_today - 400 loop
    v_me := exists (select 1 from public.meal_history m where m.user_id = v_uid and m.meal_date = v_d);
    v_fr := exists (select 1 from public.meal_history m where m.user_id = p_friend and m.meal_date = v_d);
    if v_d = v_today then v_me_today := v_me; v_fr_today := v_fr; end if;

    if v_me and v_fr then
      exit when v_gap >= 2;
      v_streak := v_streak + 1;
      v_gap := 0;
    elsif v_d < v_today then
      select da.any_open into v_open from public.dining_availability da where da.date = v_d;
      if not found or v_open is distinct from false then v_gap := v_gap + 1; end if;
    end if;
    v_d := v_d - 1;
  end loop;

  return query select v_streak, v_me_today, v_fr_today;
end;
$$;

-- Counts for the paired quests in one Monday to Sunday week: days both confirmed
-- any meal, and days both confirmed dinner. Days before the friendship started
-- do not count.
create or replace function public.duo_week(p_friend uuid, p_week_start date)
returns table(days_both integer, dinners_both integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_start date;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select (f.started_at at time zone 'America/New_York')::date into v_start
  from public.friendships f
  where f.status = 'active'
    and f.user_a = least(v_uid, p_friend) and f.user_b = greatest(v_uid, p_friend);
  if v_start is null then raise exception 'not_friends'; end if;

  return query
  select
    (select count(*)::integer from generate_series(p_week_start, p_week_start + 6, interval '1 day') g(d)
      where g.d::date >= v_start
        and exists (select 1 from public.meal_history m where m.user_id = v_uid and m.meal_date = g.d::date)
        and exists (select 1 from public.meal_history m where m.user_id = p_friend and m.meal_date = g.d::date)),
    (select count(*)::integer from generate_series(p_week_start, p_week_start + 6, interval '1 day') g(d)
      where g.d::date >= v_start
        and exists (select 1 from public.meal_history m where m.user_id = v_uid and m.meal_date = g.d::date and m.meal_type = 'dinner')
        and exists (select 1 from public.meal_history m where m.user_id = p_friend and m.meal_date = g.d::date and m.meal_type = 'dinner'));
end;
$$;

-- ── Who may call what ─────────────────────────────────────────────────────────

do $$
declare f text;
begin
  foreach f in array array[
    'duo_create_invite()', 'duo_redeem(text)', 'duo_friends()',
    'duo_ping_here(text, text, uuid[])', 'duo_clear_here()',
    'duo_set_sharing(uuid, boolean)', 'duo_end(uuid)', 'duo_block(uuid)',
    'duo_streak(uuid)', 'duo_week(uuid, date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
