-- The study as the researchers now run it.
--
--   1. One group. Everyone takes the snack, so there is nothing to randomise.
--   2. Two codes. The join code (from the researchers' first survey) enrols a
--      student. A second code, at the snack pickup station and also as a QR code,
--      STARTS their week. Reminders and the daily survey begin only then, and the
--      window counts calendar days from the day they start, so "day 3 of 7" is
--      plain to read and the week ends at midnight on day 7.
--   3. The daily survey has a lunch page and a dinner page. A question belongs to a
--      page (questions.page). The survey says which day of the study it is.
--   4. A final survey outside the app: studies.final_survey_url, shown as a button
--      from the last day, and a push that day (a reminder kind of its own).
--   5. Android. The study runs in the iOS app and in the web app on Android.
--
-- Supersedes functions from 054 to 063. Safe to run more than once.

-- ── Platform ──────────────────────────────────────────────────────────────────

create or replace function research.platform_ok(p_platform text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select coalesce(p_platform in ('ios', 'android'), false); $$;

-- ── Tables ────────────────────────────────────────────────────────────────────

alter table research.studies add column if not exists activation_code_hash text;
alter table research.studies add column if not exists final_survey_url text
  check (final_survey_url is null or (final_survey_url ~ '^https://[^\s]+$' and char_length(final_survey_url) <= 500));
grant select (final_survey_url) on research.studies to authenticated;
alter table research.studies alter column window_days set default 7;

alter table research.participants add column if not exists activated_at timestamptz;
alter table research.participants alter column window_ends_at drop not null;
-- People enrolled before this change were enrolled, and started, at once.
update research.participants set activated_at = enrolled_at where activated_at is null and window_ends_at is not null;

alter table research.questions add column if not exists page text check (page is null or page in ('lunch', 'dinner'));

alter table research.reminder_schedules drop constraint if exists reminder_schedules_kind_check;
alter table research.reminder_schedules add constraint reminder_schedules_kind_check check (kind in ('reminder', 'survey', 'final'));
alter table research.prompts drop constraint if exists prompts_kind_check;
alter table research.prompts add constraint prompts_kind_check check (kind in ('reminder', 'survey', 'final'));

-- One group: studies that have not put anyone in group L move to S alone, and what
-- was set up for L is switched off.
update research.studies s set groups = array['S']
where s.groups <> array['S'] and 'S' = any (s.groups)
  and not exists (select 1 from research.participants p where p.study_id = s.id and p.grp <> 'S');
update research.reminder_schedules r set is_active = false
where r.grp is not null and r.grp <> 'S'
  and exists (select 1 from research.studies s where s.id = r.study_id and s.groups = array['S']);
update research.questions q set is_active = false
where cardinality(q.grps) > 0 and not ('S' = any (q.grps))
  and exists (select 1 from research.studies s where s.id = q.study_id and s.groups = array['S']);
update research.studies set window_days = 7
where window_days = 21 and not exists (select 1 from research.participants p where p.study_id = studies.id);

-- A participant's start is set once, by activation, and never moves.
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
  if old.activated_at is not null and new.activated_at is distinct from old.activated_at then
    raise exception 'participant_start_is_fixed';
  end if;
  if old.status <> 'active' and new.status is distinct from old.status then
    raise exception 'participant_status_final';
  end if;
  return new;
end;
$$;

-- A replacement question keeps the page, as it keeps the column name and codes.
create or replace function research.questions_inherit_meta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old research.questions%rowtype;
begin
  if new.replaces is not null then
    select * into v_old from research.questions q where q.id = new.replaces;
    if found then
      new.column_key := coalesce(new.column_key, v_old.column_key);
      new.page := coalesce(new.page, v_old.page);
      if new.codes is null and v_old.format = new.format
         and jsonb_array_length(coalesce(v_old.options, '[]'::jsonb)) = jsonb_array_length(coalesce(new.options, '[]'::jsonb)) then
        new.codes := v_old.codes;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function research.set_question_page(p_id uuid, p_page text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_page is not null and p_page not in ('lunch', 'dinner') then raise exception 'bad_value: page'; end if;
  update research.questions q set page = p_page where q.id = p_id;
  if not found then raise exception 'unknown_question'; end if;
end;
$$;
revoke all on function research.set_question_page(uuid, text) from public, anon, authenticated;
grant execute on function research.set_question_page(uuid, text) to service_role;

create or replace function public.research_set_question_page(p_id uuid, p_page text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q research.questions%rowtype;
begin
  perform research.require_researcher();
  select * into v_q from research.questions q where q.id = p_id;
  if not found then raise exception 'unknown_question'; end if;
  perform research.writable_study(v_q.study_id);
  perform research.set_question_page(p_id, nullif(btrim(coalesce(p_page, '')), ''));
  perform research.write_audit('setup_change', jsonb_build_object('what', 'question_page', 'question', p_id,
    'from', v_q.page, 'to', nullif(btrim(coalesce(p_page, '')), '')));
  return true;
end;
$$;
revoke all on function public.research_set_question_page(uuid, text) from public, anon;
grant execute on function public.research_set_question_page(uuid, text) to authenticated;

-- ── Platform gates on the student functions ───────────────────────────────────

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

  if not research.platform_ok(p_platform) then
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

  if exists (select 1 from research.participants p where p.study_id = v_id and p.user_id = v_uid) then
    return query select 'already_enrolled'::text, null::text;
    return;
  end if;

  select s.name into v_name from research.studies s where s.id = v_id;
  return query select 'ok'::text, v_name;
end;
$$;

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
  v_now    timestamptz := now();
  v_n      integer;
  v_code   text;
  v_email  text;
  v_ends   timestamptz;
  v_grp    text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  if not research.platform_ok(p_platform) then
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

  select u.email into v_email from auth.users u where u.id = v_uid;

  -- Bento assigns the group. People arrive in order and each pair gets one of
  -- each, which is the same as giving the next person whichever group has fewer
  -- people so far, and choosing at random when the two are level. The first of a
  -- pair is therefore a coin flip, the second takes the other group, and an odd
  -- person out is a coin flip against groups that are already even. The count is
  -- taken under the study lock, so two people enrolling at once cannot both see
  -- the same count. Nothing is stored or shown about pairs.
  select g.grp into v_grp
  from unnest(v_study.groups) as g(grp)
  order by (select count(*) from research.participants p where p.study_id = v_id and p.grp = g.grp),
           random()
  limit 1;

  v_code := 'P-' || lpad((v_n + 1)::text, 3, '0');
  v_ends := null;   -- the week starts when the student enters the start code

  insert into research.participants
    (study_id, user_id, participant_code, grp, email,
     enrolled_at, window_ends_at, acknowledged_at, platform)
  values
    (v_id, v_uid, v_code, v_grp, v_email,
     v_now, v_ends, v_now, p_platform);

  update public.profiles set research_cohort = true where id = v_uid;

  return query select 'ok'::text, v_code, v_ends;
end;
$$;

create or replace function public.research_log_event(p_kind text, p_platform text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pid uuid;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not research.platform_ok(p_platform) or p_kind is distinct from 'app_open' then return false; end if;

  v_pid := research.active_participant_id(v_uid);
  if v_pid is null then return false; end if;

  if exists (select 1 from research.events e
             where e.participant_id = v_pid and e.kind = 'app_open' and e.at > now() - interval '20 minutes') then
    return false;
  end if;

  insert into research.events (participant_id, kind) values (v_pid, 'app_open');
  return true;
end;
$$;

create or replace function public.research_submit_survey(p_for_date date, p_answers jsonb, p_platform text default null)
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
  if not research.platform_ok(p_platform) then
    return query select 'ios_only'::text;
    return;
  end if;
  return query select research.submit_survey(v_uid, p_for_date, p_answers, now());
end;
$$;


-- ── The start code ────────────────────────────────────────────────────────────

-- Sets or changes the code at the snack pickup station. Run from the SQL editor, or
-- from the dashboard's Setup page. The code is stored only as a hash.
create or replace function research.set_activation_code(p_study uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(research.normalise_code(p_code)) < 6 then raise exception 'code_too_short'; end if;
  update research.studies s set activation_code_hash = research.hash_code(p_code) where s.id = p_study;
  if not found then raise exception 'unknown_study'; end if;
end;
$$;
revoke all on function research.set_activation_code(uuid, text) from public, anon, authenticated;
grant execute on function research.set_activation_code(uuid, text) to service_role;

create or replace function public.research_set_activation_code(p_study uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform research.require_researcher();
  perform research.writable_study(p_study);
  perform research.set_activation_code(p_study, p_code);
  perform research.write_audit('setup_change', jsonb_build_object('what', 'activation_code', 'study', p_study));
  return true;
end;
$$;
revoke all on function public.research_set_activation_code(uuid, text) from public, anon;
grant execute on function public.research_set_activation_code(uuid, text) to authenticated;

-- The link to the final survey outside the app. Blank clears it.
create or replace function public.research_set_final_survey_url(p_study uuid, p_url text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  perform research.require_researcher();
  perform research.writable_study(p_study);
  if v_url is not null and (v_url !~ '^https://[^\s]+$' or char_length(v_url) > 500) then raise exception 'bad_value: link'; end if;
  update research.studies s set final_survey_url = v_url where s.id = p_study;
  perform research.write_audit('setup_change', jsonb_build_object('what', 'final_survey_url', 'study', p_study, 'set', v_url is not null));
  return true;
end;
$$;
revoke all on function public.research_set_final_survey_url(uuid, text) from public, anon;
grant execute on function public.research_set_final_survey_url(uuid, text) to authenticated;

-- Starts the student's week. Statuses: ok, invalid_code, not_enrolled,
-- already_started, too_many_attempts, ios_only (an unsupported platform).
create or replace function public.research_activate(p_code text, p_platform text default null)
returns table(status text, window_ends_at timestamptz, day_number integer, total_days integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_p     research.participants%rowtype;
  v_st    research.studies%rowtype;
  v_today date;
  v_ends  timestamptz;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not research.platform_ok(p_platform) then
    return query select 'ios_only'::text, null::timestamptz, null::integer, null::integer;
    return;
  end if;

  select * into v_p from research.participants p
  where p.user_id = v_uid and p.status = 'active'
  order by p.enrolled_at desc limit 1;
  if not found then
    return query select 'not_enrolled'::text, null::timestamptz, null::integer, null::integer;
    return;
  end if;

  if v_p.activated_at is not null then
    return query select 'already_started'::text, v_p.window_ends_at, null::integer, null::integer;
    return;
  end if;

  if not research.attempt_allowed(v_uid) then
    return query select 'too_many_attempts'::text, null::timestamptz, null::integer, null::integer;
    return;
  end if;

  select * into v_st from research.studies s where s.id = v_p.study_id for update;
  if v_st.activation_code_hash is null or v_st.activation_code_hash is distinct from research.hash_code(p_code) then
    insert into research.redeem_attempts (user_id) values (v_uid);
    return query select 'invalid_code'::text, null::timestamptz, null::integer, null::integer;
    return;
  end if;

  v_today := (now() at time zone v_st.timezone)::date;
  v_ends  := ((v_today + v_st.window_days)::timestamp) at time zone v_st.timezone;
  update research.participants p set activated_at = now(), window_ends_at = v_ends where p.id = v_p.id;

  return query select 'ok'::text, v_ends, 1, v_st.window_days;
end;
$$;
revoke all on function public.research_activate(text, text) from public, anon;
grant execute on function public.research_activate(text, text) to authenticated;


-- ── Where the student stands ──────────────────────────────────────────────────

drop function if exists public.research_my_status();
create function public.research_my_status()
returns table(enrolled boolean, status text, participant_code text,
              window_ends_at timestamptz, days_left integer,
              activated boolean, day_number integer, total_days integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_p     research.participants%rowtype;
  v_tz    text;
  v_st    text;
  v_day   integer;
  v_total integer;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select * into v_p from research.participants p
  where p.user_id = v_uid
  order by p.enrolled_at desc
  limit 1;

  if not found then
    return query select false, null::text, null::text, null::timestamptz, 0, false, null::integer, null::integer;
    return;
  end if;

  select s.timezone into v_tz from research.studies s where s.id = v_p.study_id;
  v_st := case when v_p.status = 'active' and v_p.window_ends_at <= now()
               then 'completed' else v_p.status end;

  if v_p.activated_at is not null then
    v_total := (((v_p.window_ends_at - interval '1 second') at time zone v_tz)::date - (v_p.activated_at at time zone v_tz)::date) + 1;
    v_day := least(v_total, greatest(1, ((now() at time zone v_tz)::date - (v_p.activated_at at time zone v_tz)::date) + 1));
  end if;

  return query select true, v_st, v_p.participant_code, v_p.window_ends_at,
    case when v_st = 'active' and v_p.window_ends_at is not null
         then greatest(0, ceil(extract(epoch from (v_p.window_ends_at - now())) / 86400))::integer
         else 0 end,
    v_p.activated_at is not null, v_day, v_total;
end;
$$;
revoke all on function public.research_my_status() from public, anon;
grant execute on function public.research_my_status() to authenticated;


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
  where p.user_id = v_uid and p.status = 'active' and (p.window_ends_at is null or p.window_ends_at > now());

  return query select s.status from public.research_my_status() s;
end;
$$;


-- The link to the final survey, from the last day. Nothing before then, so the
-- button cannot appear early.
create or replace function public.research_final_survey()
returns table(available boolean, url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_p   research.participants%rowtype;
  v_st  research.studies%rowtype;
  v_last date;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into v_p from research.participants p where p.user_id = v_uid order by p.enrolled_at desc limit 1;
  if not found or v_p.activated_at is null or v_p.status = 'withdrawn' then
    return query select false, null::text; return;
  end if;
  select * into v_st from research.studies s where s.id = v_p.study_id;
  if v_st.final_survey_url is null then return query select false, null::text; return; end if;
  v_last := ((v_p.window_ends_at - interval '1 second') at time zone v_st.timezone)::date;
  if (now() at time zone v_st.timezone)::date >= v_last then
    return query select true, v_st.final_survey_url;
  else
    return query select false, null::text;
  end if;
end;
$$;
revoke all on function public.research_final_survey() from public, anon;
grant execute on function public.research_final_survey() to authenticated;


-- ── Sending ───────────────────────────────────────────────────────────────────

create or replace function research.claim_due_prompts(p_now timestamptz default now(), p_limit integer default 1000)
returns table(prompt_id uuid, user_id uuid, kind text, title text, body text, grp text, schedule_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with due as (
    select p.id as participant_id, p.user_id as uid, s.id as sid, s.kind as k, s.title as t, s.body as b,
           p.grp as g, (p_now at time zone st.timezone)::date as ld
    from research.participants p
    join research.studies st on st.id = p.study_id
    join research.reminder_schedules s
      on s.study_id = p.study_id and s.is_active and (s.grp is null or s.grp = p.grp)
    where p.status = 'active'
      and p.window_ends_at > p_now
      -- The final-survey push goes out once, on the last day.
      and (s.kind <> 'final' or (p_now at time zone st.timezone)::date = ((p.window_ends_at - interval '1 second') at time zone st.timezone)::date)
      and extract(isodow from (p_now at time zone st.timezone))::integer = any (s.days)
      -- Inside the window: from send_time until send_time + late_minutes.
      and (p_now at time zone st.timezone) >= ((p_now at time zone st.timezone)::date + s.send_time)
      and (p_now at time zone st.timezone) <  ((p_now at time zone st.timezone)::date + s.send_time) + make_interval(mins => s.late_minutes)
      -- Nothing for a time that had already passed when the student enrolled.
      and ((p_now at time zone st.timezone)::date + s.send_time) >= (p.activated_at at time zone st.timezone)
      -- Already claimed today. This has to come before the limit: otherwise a
      -- backlog bigger than the limit picks the same first rows every time and
      -- never gets past them. The unique key below is what keeps two senders
      -- running at once from both getting a row.
      and not exists (
        select 1 from research.prompts x
        where x.participant_id = p.id and x.schedule_id = s.id
          and x.local_date = (p_now at time zone st.timezone)::date)
    order by p.activated_at, s.id
    limit p_limit
  ), claimed as (
    insert into research.prompts (participant_id, schedule_id, kind, local_date)
    select participant_id, sid, k, ld from due
    on conflict (participant_id, schedule_id, local_date) do nothing
    returning id, participant_id, schedule_id
  )
  select c.id, d.uid, d.k, d.t, d.b, d.g, d.sid
  from claimed c
  join due d on d.participant_id = c.participant_id and d.sid = c.schedule_id;
end;
$$;

create or replace function research.add_schedule(
  p_study uuid, p_grp text, p_kind text, p_time time, p_title text,
  p_body text default '', p_days integer[] default array[1, 2, 3, 4, 5, 6, 7], p_late integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_study research.studies%rowtype;
  v_id    uuid;
begin
  select * into v_study from research.studies s where s.id = p_study;
  if not found then raise exception 'unknown_study'; end if;
  if p_grp is not null and not (p_grp = any (v_study.groups)) then raise exception 'unknown_group: %', p_grp; end if;
  if p_kind not in ('reminder', 'survey', 'final') then raise exception 'bad_kind: %', p_kind; end if;

  insert into research.reminder_schedules (study_id, grp, kind, send_time, days, late_minutes, title, body)
  values (p_study, p_grp, p_kind, p_time, p_days, coalesce(p_late, case p_kind when 'survey' then 180 when 'final' then 180 else 30 end), p_title, p_body)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function research.surveys_due(p_participant uuid, p_now timestamptz default now())
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_p     research.participants%rowtype;
  v_s     research.reminder_schedules%rowtype;
  v_tz    text;
  v_until timestamp;
  v_n     integer;
begin
  select * into v_p from research.participants p where p.id = p_participant;
  if not found or v_p.activated_at is null then return 0; end if;
  select st.timezone into v_tz from research.studies st where st.id = v_p.study_id;
  select * into v_s from research.reminder_schedules s
  where s.study_id = v_p.study_id and s.kind = 'survey' and s.is_active and (s.grp is null or s.grp = v_p.grp)
  order by (s.grp is null), s.created_at limit 1;
  if not found then return 0; end if;

  v_until := least(p_now, v_p.window_ends_at, coalesce(v_p.withdrawn_at, 'infinity'::timestamptz)) at time zone v_tz;

  select count(*)::integer into v_n
  from generate_series((v_p.activated_at at time zone v_tz)::date, v_until::date, interval '1 day') g(d)
  where extract(isodow from g.d)::integer = any (v_s.days)
    and (g.d::date + v_s.send_time) >= (v_p.activated_at at time zone v_tz)
    and (g.d::date + v_s.send_time) <= v_until
    and (g.d::date + v_s.send_time) < (v_p.window_ends_at at time zone v_tz);
  return v_n;
end;
$$;

drop function if exists research.pending_survey(uuid, timestamptz);
create or replace function research.pending_survey(p_user uuid, p_now timestamptz default now())
returns table(for_date date, late boolean, questions jsonb, next_due_at timestamptz, intro text, day_number integer, total_days integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_p     research.participants%rowtype;
  v_s     research.reminder_schedules%rowtype;
  v_tz    text;
  v_local timestamp;
  v_today date;
  v_d     date;
  v_due   timestamp;
  v_today_due    timestamp;
  v_today_closed boolean := false;
  v_end   timestamp;
  v_pick  date;
  v_next  timestamptz;
  v_q     jsonb;
begin
  select * into v_p from research.participants p
  where p.user_id = p_user and p.status = 'active' and p.window_ends_at > p_now
  order by p.enrolled_at desc limit 1;
  if not found then return; end if;

  select st.timezone into v_tz from research.studies st where st.id = v_p.study_id;

  -- A schedule for this student's own group wins over one for everyone.
  select * into v_s from research.reminder_schedules s
  where s.study_id = v_p.study_id and s.kind = 'survey' and s.is_active and (s.grp is null or s.grp = v_p.grp)
  order by (s.grp is null), s.created_at limit 1;
  if not found then return; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'format', q.format, 'options', q.options, 'show_if', q.show_if, 'page', q.page)
                            order by q.position, q.created_at, q.id), '[]'::jsonb)
  into v_q
  from research.questions q
  where q.study_id = v_p.study_id and q.is_active and (cardinality(q.grps) = 0 or v_p.grp = any (q.grps));
  if jsonb_array_length(v_q) = 0 then return; end if;

  v_local := p_now at time zone v_tz;
  v_today := v_local::date;
  v_end   := v_p.window_ends_at at time zone v_tz;

  -- Today first. Once today's survey is due it is the one to answer, and yesterday's
  -- missed one lapses: it is offered only through the morning and afternoon after,
  -- until today's comes due.
  v_today_due := v_today + v_s.send_time;
  if extract(isodow from v_today)::integer = any (v_s.days)
     and v_today_due >= (v_p.activated_at at time zone v_tz)
     and v_today_due < v_end then
    if exists (select 1 from research.survey_days d where d.participant_id = v_p.id and d.for_date = v_today) then
      v_today_closed := true;                      -- answered, and nothing older is offered after it
    elsif v_today_due <= v_local then
      v_pick := v_today;
    else
      v_next := v_today_due at time zone v_tz;     -- not due yet
    end if;
  end if;

  if v_pick is null and not v_today_closed then
    v_d := v_today - 1;
    v_due := v_d + v_s.send_time;
    if extract(isodow from v_d)::integer = any (v_s.days)
       and v_due >= (v_p.activated_at at time zone v_tz)
       and v_due < v_end
       and not exists (select 1 from research.survey_days d where d.participant_id = v_p.id and d.for_date = v_d) then
      v_pick := v_d;
    end if;
  end if;

  return query select v_pick, coalesce(v_pick < v_today, false), case when v_pick is not null then v_q end, v_next,
    (select st.survey_intro from research.studies st where st.id = v_p.study_id),
    case when v_pick is not null then (v_pick - (v_p.activated_at at time zone v_tz)::date + 1) end,
    (v_end::date - (v_p.activated_at at time zone v_tz)::date);
end;
$$;


drop function if exists public.research_pending_survey(text);
create function public.research_pending_survey(p_platform text default null)
returns table(status text, for_date date, late boolean, questions jsonb, next_due_at timestamptz, intro text,
              day_number integer, total_days integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_row record;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not research.platform_ok(p_platform) then
    return query select 'ios_only'::text, null::date, null::boolean, null::jsonb, null::timestamptz, null::text, null::integer, null::integer;
    return;
  end if;

  select * into v_row from research.pending_survey(v_uid, now());
  if not found then
    return query select 'none'::text, null::date, null::boolean, null::jsonb, null::timestamptz, null::text, null::integer, null::integer;
  elsif v_row.for_date is null then
    return query select 'none'::text, null::date, null::boolean, null::jsonb, v_row.next_due_at, null::text, null::integer, v_row.total_days;
  else
    return query select 'pending'::text, v_row.for_date, v_row.late, v_row.questions, v_row.next_due_at, v_row.intro, v_row.day_number, v_row.total_days;
  end if;
end;
$$;
revoke all on function public.research_pending_survey(text) from public, anon;
grant execute on function public.research_pending_survey(text) to authenticated;

-- ── Reachability: the web app on Android is reached through web push ──────────

create or replace function research.refresh_push_status()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  with calc as (
    select p.id,
           case when exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
                     and coalesce(pr.push_enabled, false)
                then 'on' else 'off' end as st
    from research.participants p
    left join public.profiles pr on pr.id = p.user_id
    where p.status = 'active'
  )
  update research.participants p set push_status = c.st
  from calc c where c.id = p.id and p.push_status is distinct from c.st;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ── Defaults ──────────────────────────────────────────────────────────────────

-- One reminder for everyone, 30 minutes before lunch and before dinner, and the
-- final-survey push on the last day. The times are placeholders for the real hall
-- times and the Setup page changes them at any time.
drop function if exists research.seed_default_reminders(uuid, time);
create or replace function research.seed_default_reminders(p_study uuid, p_dinner time default '16:30', p_final time default '12:00')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from research.reminder_schedules s where s.study_id = p_study and s.kind = 'reminder' and s.is_active) then
    return 0;
  end if;
  perform research.add_schedule(p_study, null, 'reminder', '10:30', 'Snack time',
    'Eat your snack 30 minutes before you eat at the dining hall.');
  perform research.add_schedule(p_study, null, 'reminder', p_dinner, 'Snack time',
    'Eat your snack 30 minutes before you eat at the dining hall.');
  perform research.add_schedule(p_study, null, 'final', p_final, 'Last day of the study',
    'Open Bento to finish the study with the final survey.');
  return 3;
end;
$$;
revoke all on function research.seed_default_reminders(uuid, time, time) from public, anon, authenticated;
grant execute on function research.seed_default_reminders(uuid, time, time) to service_role;

-- The daily survey with a lunch page and a dinner page. The same questions on both,
-- from the researchers' October draft without the loop-and-plan question, because
-- everyone now takes the snack. DRAFT: replace with the researchers' final list.
-- Nothing is added if the study already has active questions, so retire the old
-- ones first. Follow-ups hang off the hall question, so someone who ate no meal in
-- a hall is not asked about it, as in the May data.
create or replace function research.seed_daily_survey_pages(p_study uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meal  text;
  v_base  integer;
  v_hall  uuid;
  v_snack uuid;
  v_id    uuid;
  v_n     integer := 0;
  v_gate  jsonb;
  v_scale jsonb := '["Not at all", "Completely"]'::jsonb;
  v_plate jsonb := '["Little or None", "1/4 plate", "1/2 plate", "3/4 plate", "1 plate", "1+ plate"]'::jsonb;
begin
  if not exists (select 1 from research.studies s where s.id = p_study) then raise exception 'unknown_study'; end if;
  if exists (select 1 from research.questions q where q.study_id = p_study and q.is_active) then return 0; end if;

  update research.studies set survey_intro =
    'This is a 1-minute survey about your meal experiences today at Usdan and Sherman all-you-care-to-eat (AYCTE) dining halls. Please answer honestly and accurately, as best you can.'
  where id = p_study and survey_intro is null;

  foreach v_meal in array array['lunch', 'dinner'] loop
    v_base := case v_meal when 'lunch' then 10 else 50 end;

    v_hall := research.add_question(p_study,
      format('Did you eat %s in Usdan or Sherman all-you-care-to-eat (AYCTE) dining hall today?', v_meal),
      'multiple_choice', '["Yes - in Usdan", "Yes - in Sherman", "No"]'::jsonb, '{}', v_base);
    perform research.tag_question(v_hall, v_meal || 'YN', '[1, 2, 0]'::jsonb);
    perform research.set_question_page(v_hall, v_meal);
    v_gate := jsonb_build_object('question', v_hall, 'none_of', jsonb_build_array('No'));

    v_snack := research.add_question(p_study, format('Did you eat the snack given to you before %s today?', v_meal),
      'yes_no', '[]'::jsonb, '{}', v_base + 1, null, v_gate);
    perform research.tag_question(v_snack, v_meal || '_snack');
    perform research.set_question_page(v_snack, v_meal);

    v_id := research.add_question(p_study, format('How long before %s did you eat the snack?', v_meal),
      'multiple_choice', jsonb_build_array('0-20 min before ' || v_meal, '21-60 min before ' || v_meal, 'More than 1 hour before ' || v_meal),
      '{}', v_base + 2, null, jsonb_build_object('question', v_snack, 'any_of', jsonb_build_array(true)));
    perform research.tag_question(v_id, v_meal || '_snack_time');
    perform research.set_question_page(v_id, v_meal);

    v_id := research.add_question(p_study, format('To what extent were your %s choices today consistent with your eating goals?', v_meal),
      'rating', v_scale, '{}', v_base + 3, null, v_gate);
    perform research.tag_question(v_id, v_meal || '_goals');
    perform research.set_question_page(v_id, v_meal);

    v_id := research.add_question(p_study,
      'How much food was left at the end of your meal? Imagine you put all your leftover food on a single plate (think of the most common size plate), estimate about how much of the plate it would cover.',
      'multiple_choice', v_plate, '{}', v_base + 4, null, v_gate);
    perform research.tag_question(v_id, v_meal || '_waste');
    perform research.set_question_page(v_id, v_meal);
    v_n := v_n + 5;
  end loop;
  return v_n;
end;
$$;
revoke all on function research.seed_daily_survey_pages(uuid) from public, anon, authenticated;
grant execute on function research.seed_daily_survey_pages(uuid) to service_role;

-- ── The dashboard ─────────────────────────────────────────────────────────────

drop view if exists research.grid_participants;
create view research.grid_participants with (security_invoker = true) as
select p.id::text as row_id, p.participant_code, p.grp, p.status,
       coalesce(p.full_name, r.full_name) as full_name, p.email,
       (r.id is not null) as on_list,
       p.enrolled_at, p.activated_at, p.window_ends_at, p.withdrawn_at, p.acknowledged_at, p.platform, p.push_status, p.install_state
from research.participants p
left join research.roster r on r.study_id = p.study_id and r.match_key = lower(btrim(p.email));
revoke all on research.grid_participants from public, anon, authenticated;
grant select on research.grid_participants to authenticated;
