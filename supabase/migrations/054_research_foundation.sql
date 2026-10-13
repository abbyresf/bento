-- Research study, phase 1: the research schema, who may read it, and enrolment.
--
-- Design: RESEARCH_DASHBOARD_SPEC.md. Read sections 1, 2 and 3 first.
--
-- The researchers run the study. They randomise students into groups and give
-- Bento the list. Students sign the consent form in the researchers' Qualtrics
-- survey. Bento does neither: it matches a student to the list, enrols them in
-- the group the list gives, and keeps the study data apart from everything else.
--
-- Four rules shape this file.
--
-- 1. Students cannot read anything in the research schema, including their own
--    rows. The only way in is the functions at the bottom, which run as the
--    owner, check auth.uid() first and return only what the app needs. They are
--    in the public schema so PostgREST can call them without exposing research.
--
-- 2. Researchers read through row-level security, and only with a multi-factor
--    session (aal2). Test studies never show up in their views. The dining
--    admin_users table has no part in this and must not be given one.
--
-- 3. Nothing here points at auth.users. A participant's rows survive account
--    deletion by design (13 Oct 2026, the study has its own consent form), so
--    user_id is a plain value and delete_user() neither cascades into the
--    research tables nor gets blocked by them. Email, and the name if the list
--    has one, are copied into research.participants at enrolment for the same
--    reason.
--
-- 4. The research features belong to the iOS app only. The functions take the
--    platform and refuse anything but 'ios'. A client can lie about it, so this
--    is a guard against the PWA doing it by accident and not a security
--    boundary. The real gate is the code plus the researchers' list.
--
-- 5. A student who has the right code but is not on the list is told so, apart
--    from a wrong code (13 Oct 2026, the owner's call). That lets someone holding
--    the code learn whether their own email is listed, and nothing about anyone
--    else. Wrong codes still count toward the hourly limit. A closed, full,
--    unstarted or ended study still looks exactly like a wrong code.
--
-- A study code is never stored, only its hash. Studies are created, and the list
-- is loaded, from the SQL editor, so neither the code nor a single name or email
-- appears in this public repository.
--
-- Safe to run more than once.

create schema if not exists research;
revoke all on schema research from public, anon;
grant usage on schema research to authenticated, service_role;

-- ── Profile flag ──────────────────────────────────────────────────────────────

-- True from enrolment onward and never cleared. It means "was ever a research
-- participant", so dining aggregates can skip these students for good. Whether
-- someone is active in the study right now is research.participants.status.
alter table public.profiles
  add column if not exists research_cohort boolean not null default false;

comment on column public.profiles.research_cohort is
  'Set by research enrolment and never by a client. True means the student was ever a research participant.';

-- A student can update their own profile row, so the flag needs a guard. A
-- client write is silently kept at the old value. The enrolment function runs
-- as the table owner and passes through.
create or replace function public.profiles_guard_research_cohort()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.research_cohort := false;
    else
      new.research_cohort := old.research_cohort;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_research_cohort on public.profiles;
create trigger profiles_guard_research_cohort
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_research_cohort();

-- ── Tables ────────────────────────────────────────────────────────────────────

create table if not exists research.studies (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (char_length(btrim(name)) between 1 and 120),
  -- sha256 of the normalised code. Never the code.
  code_hash   text        not null unique,
  -- The groups the list may use. S is snack, L is loop and plan. The researchers
  -- assign people to them. A third group is a data change.
  groups      text[]      not null default array['S', 'L']
                          check (cardinality(groups) between 1 and 6),
  -- How a student is matched to the list. Email is the only kind so far. The
  -- researchers have not settled this, and a new kind is one branch in
  -- research.account_key().
  match_on    text        not null default 'email' check (match_on in ('email')),
  cap         integer     not null check (cap between 1 and 1000),
  -- Closed until the researchers open it. The kill switch is this column.
  is_open     boolean     not null default false,
  -- App Review's study. Hidden from every researcher view.
  is_test     boolean     not null default false,
  -- Length of each participant's window, counted from their own enrolment.
  -- Expected to change, so it is data. Existing participants keep the end date
  -- they were given.
  window_days integer     not null default 21 check (window_days between 1 and 120),
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint studies_dates check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- The researchers' list: who is in the study and which group they are in. Only
-- people the researchers have consented and randomised belong here, so being on
-- the list is Bento's proof of both.
create table if not exists research.roster (
  id         uuid        primary key default gen_random_uuid(),
  study_id   uuid        not null references research.studies(id),
  -- Normalised value of whatever studies.match_on names. Lower-cased email.
  match_key  text        not null check (char_length(match_key) between 3 and 320),
  grp        text        not null check (char_length(grp) between 1 and 8),
  -- Optional. Copied to the participant row at enrolment.
  full_name  text        check (full_name is null or char_length(btrim(full_name)) between 1 and 100),
  added_at   timestamptz not null default now(),
  -- Set when a student enrols against this row. A row is claimed once.
  claimed_by uuid,
  claimed_at timestamptz,
  constraint roster_key unique (study_id, match_key),
  constraint roster_claim check ((claimed_by is null) = (claimed_at is null))
);

create table if not exists research.participants (
  id               uuid        primary key default gen_random_uuid(),
  study_id         uuid        not null references research.studies(id),
  roster_id        uuid        not null references research.roster(id),
  -- A plain value, deliberately. See rule 3 above.
  user_id          uuid        not null,
  participant_code text        not null,
  grp              text        not null check (char_length(grp) between 1 and 8),
  full_name        text,
  email            text,
  enrolled_at      timestamptz not null default now(),
  -- Each participant's own window. Researchers may extend it, so it can change.
  window_ends_at   timestamptz not null,
  status           text        not null default 'active'
                               check (status in ('active', 'completed', 'withdrawn')),
  withdrawn_at     timestamptz,
  -- The one-tap confirmation that they completed the researchers' consent form
  -- and are 18 or over. The consent itself lives with the researchers.
  acknowledged_at  timestamptz not null default now(),
  -- Filled in by later phases.
  platform         text,
  push_status      text,
  install_state    text,
  constraint participants_code unique (study_id, participant_code),
  constraint participants_user unique (study_id, user_id),
  constraint participants_roster unique (roster_id),
  constraint participants_withdrawn check ((status = 'withdrawn') = (withdrawn_at is not null))
);
create index if not exists participants_user on research.participants (user_id);

-- Failed code guesses only. A shared code is guessable, so this is the limit.
create table if not exists research.redeem_attempts (
  id      bigint      generated always as identity primary key,
  user_id uuid        not null,
  at      timestamptz not null default now()
);
create index if not exists redeem_attempts_user on research.redeem_attempts (user_id, at desc);

-- Dashboard accounts. Invite flow arrives with the dashboard.
create table if not exists research.researchers (
  user_id    uuid        primary key,
  email      text        not null,
  role       text        not null default 'researcher' check (role in ('researcher', 'owner')),
  is_active  boolean     not null default true,
  invited_at timestamptz not null default now()
);

-- ── Integrity ─────────────────────────────────────────────────────────────────

-- Who, which group and when they confirmed are fixed at enrolment. Status can
-- move from active to completed or withdrawn and then stays there.
create or replace function research.participants_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.study_id         is distinct from old.study_id
     or new.roster_id        is distinct from old.roster_id
     or new.user_id          is distinct from old.user_id
     or new.participant_code is distinct from old.participant_code
     or new.grp              is distinct from old.grp
     or new.enrolled_at      is distinct from old.enrolled_at
     or new.acknowledged_at  is distinct from old.acknowledged_at then
    raise exception 'participant_fixed_at_enrolment';
  end if;
  if old.status <> 'active' and new.status is distinct from old.status then
    raise exception 'participant_status_final';
  end if;
  return new;
end;
$$;

drop trigger if exists participants_guard on research.participants;
create trigger participants_guard
  before update on research.participants
  for each row execute function research.participants_guard();

-- Once a student has enrolled against a list row, the row cannot move groups,
-- change who it matches or be released.
create or replace function research.roster_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.claimed_by is not null then
    if new.grp is distinct from old.grp
       or new.match_key is distinct from old.match_key
       or new.study_id  is distinct from old.study_id
       or new.claimed_by is distinct from old.claimed_by
       or new.claimed_at is distinct from old.claimed_at then
      raise exception 'roster_entry_claimed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists roster_guard on research.roster;
create trigger roster_guard
  before update on research.roster
  for each row execute function research.roster_guard();

-- ── Who may read ──────────────────────────────────────────────────────────────

-- Both helpers require a multi-factor session. A researcher who signed in with a
-- password alone sees nothing.
create or replace function research.is_researcher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from research.researchers r
       where r.user_id = auth.uid() and r.is_active
     );
$$;

create or replace function research.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from research.researchers r
       where r.user_id = auth.uid() and r.is_active and r.role = 'owner'
     );
$$;

create or replace function research.study_is_real(p_study uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from research.studies s where s.id = p_study and not s.is_test);
$$;

revoke all on function research.is_researcher()          from public, anon;
revoke all on function research.is_owner()               from public, anon;
revoke all on function research.study_is_real(uuid)      from public, anon;
grant execute on function research.is_researcher()       to authenticated, service_role;
grant execute on function research.is_owner()            to authenticated, service_role;
grant execute on function research.study_is_real(uuid)   to authenticated, service_role;

alter table research.studies         enable row level security;
alter table research.roster          enable row level security;
alter table research.participants    enable row level security;
alter table research.redeem_attempts enable row level security;
alter table research.researchers     enable row level security;

drop policy if exists studies_researcher_read on research.studies;
create policy studies_researcher_read on research.studies
  for select to authenticated
  using (research.is_researcher() and not is_test);

drop policy if exists roster_researcher_read on research.roster;
create policy roster_researcher_read on research.roster
  for select to authenticated
  using (research.is_researcher() and research.study_is_real(study_id));

drop policy if exists participants_researcher_read on research.participants;
create policy participants_researcher_read on research.participants
  for select to authenticated
  using (research.is_researcher() and research.study_is_real(study_id));

drop policy if exists researchers_read on research.researchers;
create policy researchers_read on research.researchers
  for select to authenticated
  using (user_id = auth.uid() or research.is_owner());

-- redeem_attempts has RLS on and no policy. Nobody reads it but the functions.

revoke all on all tables in schema research from public, anon, authenticated;
-- code_hash is left out on purpose. A researcher has no use for it.
grant select (id, name, groups, match_on, cap, is_open, is_test, window_days, starts_at,
              ends_at, created_at)
  on research.studies to authenticated;
grant select on research.roster, research.participants, research.researchers
  to authenticated;

-- ── Owner tools ───────────────────────────────────────────────────────────────
-- Run from the SQL editor. Not callable by any client.

create or replace function research.normalise_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function research.hash_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(research.normalise_code(p_code), 'UTF8')), 'hex');
$$;

-- Creates a closed study. Open it with:
--   update research.studies set is_open = true where id = '<id>';
create or replace function research.create_study(
  p_name        text,
  p_code        text,
  p_cap         integer,
  p_groups      text[]  default array['S', 'L'],
  p_window_days integer default 21,
  p_is_test     boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if char_length(research.normalise_code(p_code)) < 6 then
    raise exception 'code_too_short';
  end if;
  insert into research.studies (name, code_hash, cap, groups, window_days, is_test)
  values (p_name, research.hash_code(p_code), p_cap, p_groups, p_window_days, p_is_test)
  returning id into v_id;
  return v_id;
end;
$$;

-- Loads the researchers' list. p_rows is a JSON array of
--   {"email": "...", "group": "S", "name": "..."}   (name is optional)
-- Safe to run again with a longer list: new people are added, people not yet
-- enrolled are updated, and nobody who has enrolled is touched. A listed group
-- that disagrees with an enrolled person's group stops the whole load, because
-- that is a disagreement with the researchers that a person should look at.
-- Returns how many were added, updated and skipped.
create or replace function research.add_roster(p_study uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_study research.studies%rowtype;
  v_row   jsonb;
  v_key   text;
  v_grp   text;
  v_name  text;
  v_have  research.roster%rowtype;
  v_added integer := 0;
  v_upd   integer := 0;
  v_skip  integer := 0;
begin
  select * into v_study from research.studies s where s.id = p_study;
  if not found then raise exception 'unknown_study'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'rows_must_be_an_array'; end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_key  := lower(btrim(coalesce(v_row ->> 'email', '')));
    v_grp  := btrim(coalesce(v_row ->> 'group', ''));
    v_name := nullif(btrim(coalesce(v_row ->> 'name', '')), '');

    if v_key !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email: %', v_key; end if;
    if not (v_grp = any (v_study.groups)) then raise exception 'unknown_group: % for %', v_grp, v_key; end if;

    select * into v_have from research.roster r where r.study_id = p_study and r.match_key = v_key;
    if not found then
      insert into research.roster (study_id, match_key, grp, full_name) values (p_study, v_key, v_grp, v_name);
      v_added := v_added + 1;
    elsif v_have.claimed_by is not null then
      if v_have.grp <> v_grp then raise exception 'claimed_group_differs: %', v_key; end if;
      v_skip := v_skip + 1;
    else
      update research.roster r set grp = v_grp, full_name = v_name where r.id = v_have.id;
      v_upd := v_upd + 1;
    end if;
  end loop;

  return jsonb_build_object('added', v_added, 'updated', v_upd, 'skipped_enrolled', v_skip);
end;
$$;

-- Closes every window that has run out. The scheduled sender calls this in
-- phase 4. Rows are kept.
create or replace function research.close_expired_windows()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update research.participants p
  set status = 'completed'
  where p.status = 'active' and p.window_ends_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function research.normalise_code(text) from public, anon, authenticated;
revoke all on function research.hash_code(text) from public, anon, authenticated;
revoke all on function research.create_study(text, text, integer, text[], integer, boolean)
  from public, anon, authenticated;
revoke all on function research.add_roster(uuid, jsonb) from public, anon, authenticated;
revoke all on function research.close_expired_windows() from public, anon, authenticated;
grant execute on function research.create_study(text, text, integer, text[], integer, boolean)
  to service_role;
grant execute on function research.add_roster(uuid, jsonb) to service_role;
grant execute on function research.close_expired_windows() to service_role;

-- ── Internals for the student functions ───────────────────────────────────────

-- False once a student has made 5 wrong guesses in the past hour.
create or replace function research.attempt_allowed(p_uid uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from research.redeem_attempts a where a.at < now() - interval '1 hour';
  return (select count(*) from research.redeem_attempts a where a.user_id = p_uid) < 5;
end;
$$;

-- The study a code opens, or null. Every reason a code can fail returns null,
-- so the caller cannot tell a wrong code from a closed or full study.
create or replace function research.resolve_code(p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from research.studies s
  where s.code_hash = research.hash_code(p_code)
    and s.is_open
    and (s.starts_at is null or s.starts_at <= now())
    and (s.ends_at   is null or s.ends_at   >  now())
    and (select count(*) from research.participants p where p.study_id = s.id) < s.cap;
$$;

-- What identifies this student for matching. Branch here to add a match kind.
create or replace function research.account_key(p_study uuid, p_uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(btrim(u.email))
  from research.studies s, auth.users u
  where s.id = p_study and u.id = p_uid and s.match_on = 'email';
$$;

-- The list row for this student, or null. A row already taken by another
-- account does not match.
create or replace function research.find_roster(p_study uuid, p_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from research.roster r
  where r.study_id = p_study
    and r.match_key = research.account_key(p_study, p_uid)
    and (r.claimed_by is null or r.claimed_by = p_uid);
$$;

revoke all on function research.attempt_allowed(uuid) from public, anon, authenticated;
revoke all on function research.resolve_code(text) from public, anon, authenticated;
revoke all on function research.account_key(uuid, uuid) from public, anon, authenticated;
revoke all on function research.find_roster(uuid, uuid) from public, anon, authenticated;

-- ── Student functions ─────────────────────────────────────────────────────────
-- They report failure as a row with a status and not as an exception. An
-- exception rolls back the whole call, including the attempt recorded above it,
-- so a wrong guess would never count against the limit. Same pattern as
-- duo_redeem in 043.

-- Step 1. Check a code. Nothing is recorded about the student, except a wrong
-- guess.
create or replace function public.research_check_code(p_code text, p_platform text default null)
returns table(status text, study_name text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_name  text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  if p_platform is distinct from 'ios' then
    return query select 'ios_only'::text, null::text;
    return;
  end if;

  if not research.attempt_allowed(v_uid) then
    return query select 'too_many_attempts'::text, null::text;
    return;
  end if;

  v_id := research.resolve_code(p_code);
  if v_id is null then
    insert into research.redeem_attempts (user_id) values (v_uid);
    return query select 'invalid_code'::text, null::text;
    return;
  end if;

  -- The right code, but this account is not on the list. Not a wrong guess.
  if research.find_roster(v_id, v_uid) is null then
    return query select 'not_on_list'::text, null::text;
    return;
  end if;

  if exists (select 1 from research.participants p where p.study_id = v_id and p.user_id = v_uid) then
    return query select 'already_enrolled'::text, null::text;
    return;
  end if;

  select s.name into v_name from research.studies s where s.id = v_id;
  return query select 'ok'::text, v_name;
end;
$$;

-- Step 2. Enrol, after the student has tapped the acknowledgement: they completed
-- the researchers' consent form and are 18 or over. The group comes from the
-- researchers' list and is never returned to the app.
create or replace function public.research_enroll(p_code text, p_acknowledged boolean, p_platform text default null)
returns table(status text, participant_code text, window_ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid    uuid := auth.uid();
  v_id     uuid;
  v_study  research.studies%rowtype;
  v_roster research.roster%rowtype;
  v_rid    uuid;
  v_now    timestamptz := now();
  v_n      integer;
  v_code   text;
  v_email  text;
  v_ends   timestamptz;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  if p_platform is distinct from 'ios' then
    return query select 'ios_only'::text, null::text, null::timestamptz;
    return;
  end if;

  if not research.attempt_allowed(v_uid) then
    return query select 'too_many_attempts'::text, null::text, null::timestamptz;
    return;
  end if;

  v_id := research.resolve_code(p_code);
  if v_id is null then
    insert into research.redeem_attempts (user_id) values (v_uid);
    return query select 'invalid_code'::text, null::text, null::timestamptz;
    return;
  end if;

  if research.find_roster(v_id, v_uid) is null then
    return query select 'not_on_list'::text, null::text, null::timestamptz;
    return;
  end if;

  -- One enrolment at a time per study, so the cap and the participant numbers
  -- are decided against a stable count.
  select * into v_study from research.studies s where s.id = v_id for update;

  if exists (select 1 from research.participants p where p.study_id = v_id and p.user_id = v_uid) then
    return query select 'already_enrolled'::text, null::text, null::timestamptz;
    return;
  end if;

  select count(*) into v_n from research.participants p where p.study_id = v_id;
  if v_n >= v_study.cap then
    return query select 'invalid_code'::text, null::text, null::timestamptz;
    return;
  end if;

  if p_acknowledged is not true then
    return query select 'acknowledgement_required'::text, null::text, null::timestamptz;
    return;
  end if;

  -- Re-read the list row under the lock. Another account may have taken it.
  v_rid := research.find_roster(v_id, v_uid);
  if v_rid is null then
    return query select 'not_on_list'::text, null::text, null::timestamptz;
    return;
  end if;
  select * into v_roster from research.roster r where r.id = v_rid for update;

  select u.email into v_email from auth.users u where u.id = v_uid;

  v_code := 'P-' || lpad((v_n + 1)::text, 3, '0');
  v_ends := v_now + make_interval(days => v_study.window_days);

  insert into research.participants
    (study_id, roster_id, user_id, participant_code, grp, full_name, email,
     enrolled_at, window_ends_at, acknowledged_at, platform)
  values
    (v_id, v_roster.id, v_uid, v_code, v_roster.grp, v_roster.full_name, v_email,
     v_now, v_ends, v_now, p_platform);

  update research.roster r set claimed_by = v_uid, claimed_at = v_now where r.id = v_roster.id;
  update public.profiles set research_cohort = true where id = v_uid;

  return query select 'ok'::text, v_code, v_ends;
end;
$$;

-- Where the student stands. A window that has run out reads as completed even
-- before the scheduled job has closed it.
create or replace function public.research_my_status()
returns table(enrolled boolean, status text, participant_code text,
              window_ends_at timestamptz, days_left integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_p   research.participants%rowtype;
  v_st  text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select * into v_p from research.participants p
  where p.user_id = v_uid
  order by p.enrolled_at desc
  limit 1;

  if not found then
    return query select false, null::text, null::text, null::timestamptz, 0;
    return;
  end if;

  v_st := case when v_p.status = 'active' and v_p.window_ends_at <= now()
               then 'completed' else v_p.status end;

  return query select true, v_st, v_p.participant_code, v_p.window_ends_at,
    case when v_st = 'active'
         then greatest(0, ceil(extract(epoch from (v_p.window_ends_at - now())) / 86400))::integer
         else 0 end;
end;
$$;

-- Leaving the study. Collection and research reminders stop and regular
-- reminders return. Every row is kept. What else happens is for later.
create or replace function public.research_leave()
returns table(status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  update research.participants p
  set status = 'withdrawn', withdrawn_at = now()
  where p.user_id = v_uid and p.status = 'active' and p.window_ends_at > now();

  return query select s.status from public.research_my_status() s;
end;
$$;

-- These signatures replace the ones from before the platform argument. Nothing
-- has been deployed, but drop them anyway so a stale copy can never linger.
drop function if exists public.research_check_code(text);
drop function if exists public.research_enroll(text, boolean);

revoke all on function public.research_check_code(text, text) from public, anon;
revoke all on function public.research_enroll(text, boolean, text) from public, anon;
revoke all on function public.research_my_status() from public, anon;
revoke all on function public.research_leave() from public, anon;
grant execute on function public.research_check_code(text, text) to authenticated;
grant execute on function public.research_enroll(text, boolean, text) to authenticated;
grant execute on function public.research_my_status() to authenticated;
grant execute on function public.research_leave() to authenticated;
