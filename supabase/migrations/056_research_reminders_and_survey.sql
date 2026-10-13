-- Research study, phase 4: the study reminders and the end-of-day survey.
--
-- Design: RESEARCH_DASHBOARD_SPEC.md, sections 4 and 5. Builds on 054 and 055.
--
-- Rules that shape this file.
--
-- 1. Reminders and the survey time are data, not code. research.reminder_schedules
--    holds, per group, a send time, the days, the words and a late window. The
--    researchers can edit it. A new group or a new time needs no deploy.
--
-- 2. A prompt goes out once. research.claim_due_prompts decides who is due and
--    records the claim in the same statement, under a unique key on (participant,
--    schedule, local date). Two senders running at once, or the same one twice,
--    cannot both get a row. The sender then reports how each one went.
--
-- 3. A stale reminder is worse than none. A prompt is claimed only inside its late
--    window (30 minutes by default), so a snack reminder that the scheduler
--    delivers after lunch opens is dropped, not sent.
--
-- 4. The survey does not depend on the push. research.pending_survey says what is
--    waiting from the schedule alone, so a student with notifications off still
--    gets it the next time the app opens. That is what keeps the response rate
--    honest. A survey missed one day is offered once more the next day, marked
--    late, until that day's own survey comes due. Then it lapses.
--
-- 5. Questions are versioned by never editing them. Changing a question adds a new
--    one and retires the old. Every answer points at the exact question row it
--    answered, so a column in the grid is never two different questions.
--
-- 6. Questions can be for one group or both. A question with no group is for
--    everyone.
--
-- 6a. A question can be a follow-up that only appears after a particular answer to
--    an earlier one (show_if). A follow-up that is not shown is not answered, and
--    an answer to one that was not shown is refused, so the data never contains an
--    answer to a question the student did not see.
--
-- 6b. A rating question may carry labels for its two ends ("Not at all" and
--    "Completely"). The study may carry a short introduction to its survey.
--
-- 7. While a student is an active participant, no other push reaches them. The
--    existing senders ask research.active_user_ids (through a service-only
--    function) and skip those students.
--
-- Safe to run more than once.

-- ── Tables ────────────────────────────────────────────────────────────────────

-- The line above the questions. Null falls back to the app's own wording.
alter table research.studies
  add column if not exists survey_intro text check (survey_intro is null or char_length(survey_intro) <= 600);
grant select (survey_intro) on research.studies to authenticated;

create table if not exists research.reminder_schedules (
  id           uuid        primary key default gen_random_uuid(),
  study_id     uuid        not null references research.studies(id),
  -- Null is every group.
  grp          text,
  kind         text        not null check (kind in ('reminder', 'survey')),
  -- Local time in the study's timezone.
  send_time    time        not null,
  -- ISO weekdays, 1 is Monday and 7 is Sunday.
  days         integer[]   not null default array[1, 2, 3, 4, 5, 6, 7]
                           check (cardinality(days) between 1 and 7 and days <@ array[1, 2, 3, 4, 5, 6, 7]),
  -- How long after send_time a push may still go out. Past this it is dropped.
  late_minutes integer     not null default 30 check (late_minutes between 1 and 1440),
  title        text        not null check (char_length(btrim(title)) between 1 and 80),
  body         text        not null default '' check (char_length(body) <= 200),
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists reminder_schedules_study on research.reminder_schedules (study_id) where is_active;

create table if not exists research.questions (
  id          uuid        primary key default gen_random_uuid(),
  study_id    uuid        not null references research.studies(id),
  -- Empty is every group.
  grps        text[]      not null default '{}',
  position    integer     not null default 0,
  text        text        not null check (char_length(btrim(text)) between 1 and 300),
  format      text        not null check (format in ('multiple_choice', 'short_answer', 'rating', 'yes_no')),
  options     jsonb       not null default '[]'::jsonb,
  is_active   boolean     not null default true,
  -- The question this one replaced.
  replaces    uuid        references research.questions(id),
  -- Show this question only after a particular answer to an earlier one:
  --   {"question": "<id>", "any_of": [..]}   when that answer is one of these
  --   {"question": "<id>", "none_of": [..]}  when it is anything but these
  show_if     jsonb,
  created_at  timestamptz not null default now(),
  constraint questions_options check (
    (format = 'multiple_choice' and jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8)
    or format <> 'multiple_choice'),
  -- A rating's options, when given, are the labels for 1 and for 5.
  constraint questions_rating_labels check (
    format <> 'rating' or options = '[]'::jsonb
    or (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 2)),
  constraint questions_show_if check (
    show_if is null or (
      jsonb_typeof(show_if) = 'object' and show_if ? 'question'
      and ((show_if ? 'any_of' and jsonb_typeof(show_if -> 'any_of') = 'array' and not (show_if ? 'none_of'))
        or (show_if ? 'none_of' and jsonb_typeof(show_if -> 'none_of') = 'array' and not (show_if ? 'any_of')))))
);
create index if not exists questions_study on research.questions (study_id) where is_active;

-- Only whether a question is in use and where it sits can change. What it asks
-- cannot, because answers already point at it.
create or replace function research.questions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.study_id is distinct from old.study_id
     or new.text    is distinct from old.text
     or new.format  is distinct from old.format
     or new.options is distinct from old.options
     or new.grps    is distinct from old.grps
     or new.show_if is distinct from old.show_if
     or new.replaces is distinct from old.replaces then
    raise exception 'questions_are_never_edited';
  end if;
  return new;
end;
$$;

drop trigger if exists questions_guard on research.questions;
create trigger questions_guard
  before update on research.questions
  for each row execute function research.questions_guard();

create table if not exists research.prompts (
  id             uuid        primary key default gen_random_uuid(),
  participant_id uuid        not null references research.participants(id),
  schedule_id    uuid        not null references research.reminder_schedules(id),
  kind           text        not null check (kind in ('reminder', 'survey')),
  local_date     date        not null,
  claimed_at     timestamptz not null default now(),
  -- claimed: decided but not yet reported. no_device: the student has no push
  -- registration, so nothing could be sent.
  status         text        not null default 'claimed' check (status in ('claimed', 'sent', 'failed', 'no_device')),
  sent_at        timestamptz,
  error          text,
  constraint prompts_once unique (participant_id, schedule_id, local_date)
);
create index if not exists prompts_participant on research.prompts (participant_id, local_date);

-- One row per participant per day they answered.
create table if not exists research.survey_days (
  id             uuid        primary key default gen_random_uuid(),
  participant_id uuid        not null references research.participants(id),
  for_date       date        not null,
  submitted_at   timestamptz not null default now(),
  -- Answered on a later day than it was for.
  late           boolean     not null default false,
  constraint survey_days_once unique (participant_id, for_date)
);

create table if not exists research.responses (
  id             uuid        primary key default gen_random_uuid(),
  survey_day_id  uuid        not null references research.survey_days(id),
  participant_id uuid        not null references research.participants(id),
  question_id    uuid        not null references research.questions(id),
  -- A boolean, a number, or a string, whatever the question asks for.
  answer         jsonb       not null,
  constraint responses_once unique (survey_day_id, question_id)
);
create index if not exists responses_participant on research.responses (participant_id);

-- ── Owner tools ───────────────────────────────────────────────────────────────
-- Run from the SQL editor. Not callable by any client.

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
  if p_kind not in ('reminder', 'survey') then raise exception 'bad_kind: %', p_kind; end if;

  insert into research.reminder_schedules (study_id, grp, kind, send_time, days, late_minutes, title, body)
  values (p_study, p_grp, p_kind, p_time, p_days, coalesce(p_late, case p_kind when 'survey' then 180 else 30 end), p_title, p_body)
  returning id into v_id;
  return v_id;
end;
$$;

-- The two known reminders: 10:30 every day, 30 minutes before lunch service opens
-- (every lunch-equivalent service at Brandeis opens at 11:00). The WORDING IS A
-- DRAFT. Edit the rows when the researchers have settled it. Does nothing if the
-- study already has reminders.
create or replace function research.seed_default_reminders(p_study uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from research.reminder_schedules s where s.study_id = p_study and s.kind = 'reminder') then
    return 0;
  end if;
  perform research.add_schedule(p_study, 'S', 'reminder', '10:30', 'Snack time',
    'Lunch opens at 11. Eat your snack now.');
  perform research.add_schedule(p_study, 'L', 'reminder', '10:30', 'Loop, plan, then plate',
    'Walk the hall once and see what is offered. Decide what you want. Then fill your plate.');
  return 2;
end;
$$;

-- Adds a question. Pass p_replaces to retire an old one: the old row stays, marked
-- inactive, and the new one takes its place. Returns the new question's id.
create or replace function research.add_question(
  p_study uuid, p_text text, p_format text, p_options jsonb default '[]'::jsonb,
  p_grps text[] default '{}', p_position integer default 0, p_replaces uuid default null,
  p_show_if jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_study research.studies%rowtype;
  v_id    uuid;
  g       text;
begin
  select * into v_study from research.studies s where s.id = p_study;
  if not found then raise exception 'unknown_study'; end if;
  foreach g in array coalesce(p_grps, '{}') loop
    if not (g = any (v_study.groups)) then raise exception 'unknown_group: %', g; end if;
  end loop;
  if p_replaces is not null and not exists (select 1 from research.questions q where q.id = p_replaces and q.study_id = p_study) then
    raise exception 'unknown_question';
  end if;
  -- A follow-up must come after the question it depends on, in the same study.
  if p_show_if is not null and not exists (
       select 1 from research.questions q
       where q.id::text = p_show_if ->> 'question' and q.study_id = p_study and q.position < p_position) then
    raise exception 'show_if_needs_an_earlier_question';
  end if;

  insert into research.questions (study_id, grps, position, text, format, options, replaces, show_if)
  values (p_study, coalesce(p_grps, '{}'), p_position, p_text, p_format, coalesce(p_options, '[]'::jsonb), p_replaces, p_show_if)
  returning id into v_id;

  if p_replaces is not null then
    update research.questions q set is_active = false where q.id = p_replaces;
  end if;
  return v_id;
end;
$$;

revoke all on function research.add_schedule(uuid, text, text, time, text, text, integer[], integer) from public, anon, authenticated;
revoke all on function research.seed_default_reminders(uuid) from public, anon, authenticated;
revoke all on function research.add_question(uuid, text, text, jsonb, text[], integer, uuid, jsonb) from public, anon, authenticated;
grant execute on function research.add_schedule(uuid, text, text, time, text, text, integer[], integer) to service_role;
grant execute on function research.seed_default_reminders(uuid) to service_role;
grant execute on function research.add_question(uuid, text, text, jsonb, text[], integer, uuid, jsonb) to service_role;


-- Loads the researchers' daily survey (Dining_daily_survey_updated oct7 2026). Does
-- nothing if the study already has questions, so it cannot double up.
--
-- Lunch is the decided part. LOOP&PLAN is group L and PRELOAD is group S (the
-- snack group). The email question in their draft is left out: Bento already knows
-- who each participant is.
--
-- Dinner is NOT decided, so it is off. Pass p_include_dinner => true to add the
-- dinner block. The draft's dinner block repeats the lunch snack question, which
-- cannot apply to dinner, so only the questions that make sense are added.
--
-- Everyone is asked the lunch questions whether or not they ate in a hall, as the
-- draft says ("Everybody gets the following questions"). If a student who answers
-- No should skip the rest, give those questions a show_if on the first one.
--
-- You still add the survey schedule, because the send time is not decided:
--   select research.add_schedule('<id>', null, 'survey', '<HH:MM>', 'Today''s questions');
create or replace function research.seed_daily_survey(p_study uuid, p_include_dinner boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_where  uuid;
  v_snack  uuid;
  v_dwhere uuid;
  v_n      integer := 0;
  v_scale  jsonb := '["Not at all", "Completely"]'::jsonb;
  v_plate  jsonb := '["Little or None", "1/4 plate", "1/2 plate", "3/4 plate", "1 plate", "1+ plate"]'::jsonb;
begin
  if not exists (select 1 from research.studies s where s.id = p_study) then raise exception 'unknown_study'; end if;
  if exists (select 1 from research.questions q where q.study_id = p_study and q.is_active) then return 0; end if;

  update research.studies set survey_intro =
    'This is a 1-minute survey about your meal experiences today at Usdan and Sherman all-you-care-to-eat (AYCTE) dining halls. Please answer honestly and accurately, as best you can.'
  where id = p_study;

  v_where := research.add_question(p_study,
    'Did you eat lunch in Usdan or Sherman all-you-care-to-eat (AYCTE) dining hall today?',
    'multiple_choice', '["Yes - in Usdan", "Yes - in Sherman", "No"]'::jsonb, '{}', 10);

  -- Group L (LOOP&PLAN) only.
  perform research.add_question(p_study,
    'When having lunch at Usdan/Sherman, did you use the "loop and plan" strategy before getting food? (That is, did you first walk around to see all the food options and plan what you would take for your meal before beginning to get it?)',
    'rating', v_scale, array['L'], 20);

  -- Group S (PRELOAD) only, and the follow-up only if they ate the snack.
  v_snack := research.add_question(p_study, 'Did you eat the snack given to you before lunch today?',
    'yes_no', '[]'::jsonb, array['S'], 20);
  perform research.add_question(p_study, 'How long before lunch did you eat the snack?',
    'multiple_choice', '["0-20 min before lunch", "21-60 min before lunch", "More than 1 hour before lunch"]'::jsonb,
    array['S'], 21, null, jsonb_build_object('question', v_snack, 'any_of', jsonb_build_array(true)));

  -- Everyone.
  perform research.add_question(p_study,
    'To what extent were your lunch choices today consistent with your eating goals?', 'rating', v_scale, '{}', 30);
  perform research.add_question(p_study,
    'How much food was left at the end of your meal? Imagine you put all your leftover food on a single plate (think of the most common size plate), estimate about how much of the plate it would cover.',
    'multiple_choice', v_plate, '{}', 40);
  v_n := 6;

  if p_include_dinner then
    v_dwhere := research.add_question(p_study,
      'Did you eat dinner in Usdan or Sherman all-you-care-to-eat (AYCTE) dining hall today?',
      'multiple_choice', '["Yes - in Usdan", "Yes - in Sherman", "No"]'::jsonb, '{}', 50);
    perform research.add_question(p_study,
      'When having dinner at Usdan/Sherman, did you use the "loop and plan" strategy before getting food? (That is, did you first walk around to see all the food options and plan what you would take for your meal before beginning to get it?)',
      'rating', v_scale, array['L'], 60, null, jsonb_build_object('question', v_dwhere, 'none_of', jsonb_build_array('No')));
    perform research.add_question(p_study,
      'To what extent were your dinner choices today consistent with your eating goals?',
      'rating', v_scale, '{}', 70, null, jsonb_build_object('question', v_dwhere, 'none_of', jsonb_build_array('No')));
    perform research.add_question(p_study,
      'How much food was left at the end of your meal? Imagine you put all your leftover food on a single plate (think of the most common size plate), estimate about how much of the plate it would cover.',
      'multiple_choice', v_plate, '{}', 80, null, jsonb_build_object('question', v_dwhere, 'none_of', jsonb_build_array('No')));
    v_n := v_n + 4;
  end if;
  return v_n;
end;
$$;

revoke all on function research.seed_daily_survey(uuid, boolean) from public, anon, authenticated;
grant execute on function research.seed_daily_survey(uuid, boolean) to service_role;

-- ── Sending ───────────────────────────────────────────────────────────────────

-- Who is due a prompt at p_now, claimed in the same statement. Rows come back only
-- for prompts this call claimed, so a second call returns nothing.
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
      and extract(isodow from (p_now at time zone st.timezone))::integer = any (s.days)
      -- Inside the window: from send_time until send_time + late_minutes.
      and (p_now at time zone st.timezone) >= ((p_now at time zone st.timezone)::date + s.send_time)
      and (p_now at time zone st.timezone) <  ((p_now at time zone st.timezone)::date + s.send_time) + make_interval(mins => s.late_minutes)
      -- Nothing for a time that had already passed when the student enrolled.
      and ((p_now at time zone st.timezone)::date + s.send_time) >= (p.enrolled_at at time zone st.timezone)
      -- Already claimed today. This has to come before the limit: otherwise a
      -- backlog bigger than the limit picks the same first rows every time and
      -- never gets past them. The unique key below is what keeps two senders
      -- running at once from both getting a row.
      and not exists (
        select 1 from research.prompts x
        where x.participant_id = p.id and x.schedule_id = s.id
          and x.local_date = (p_now at time zone st.timezone)::date)
    order by p.enrolled_at, s.id
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

-- The sender reports back: [{"id": "...", "status": "sent" | "failed" | "no_device", "error": "..."}].
create or replace function research.mark_prompts(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update research.prompts pr
  set status = r.status,
      sent_at = case when r.status = 'sent' then now() end,
      error = left(r.error, 200)
  from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as r(id uuid, status text, error text)
  where pr.id = r.id and r.status in ('sent', 'failed', 'no_device');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Whether each active participant can be reached by push, for the researchers.
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
           case when exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id and s.apns_token is not null)
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

-- The students who must not get a regular push right now.
create or replace function research.active_user_ids(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.user_id
  from research.participants p
  where p.user_id = any (p_ids) and p.status = 'active' and p.window_ends_at > now();
$$;

revoke all on function research.claim_due_prompts(timestamptz, integer) from public, anon, authenticated;
revoke all on function research.mark_prompts(jsonb) from public, anon, authenticated;
revoke all on function research.refresh_push_status() from public, anon, authenticated;
revoke all on function research.active_user_ids(uuid[]) from public, anon, authenticated;
grant execute on function research.claim_due_prompts(timestamptz, integer) to service_role;
grant execute on function research.mark_prompts(jsonb) to service_role;
grant execute on function research.refresh_push_status() to service_role;
grant execute on function research.active_user_ids(uuid[]) to service_role;

-- The sender runs in a Vercel function that talks to PostgREST, which exposes
-- only the public schema. These are thin wrappers, service role only.
create or replace function public.research_claim_due_prompts(p_now timestamptz default now())
returns table(prompt_id uuid, user_id uuid, kind text, title text, body text, grp text, schedule_id uuid)
language sql
security definer
set search_path = ''
as $$
  select * from research.claim_due_prompts(p_now);
$$;

create or replace function public.research_mark_prompts(p_results jsonb)
returns integer
language sql
security definer
set search_path = ''
as $$
  select research.mark_prompts(p_results);
$$;

create or replace function public.research_housekeeping()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object('closed', research.close_expired_windows(), 'push_status_changed', research.refresh_push_status());
$$;

create or replace function public.research_active_user_ids(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select research.active_user_ids(p_ids);
$$;

revoke all on function public.research_claim_due_prompts(timestamptz) from public, anon, authenticated;
revoke all on function public.research_mark_prompts(jsonb) from public, anon, authenticated;
revoke all on function public.research_housekeeping() from public, anon, authenticated;
revoke all on function public.research_active_user_ids(uuid[]) from public, anon, authenticated;
grant execute on function public.research_claim_due_prompts(timestamptz) to service_role;
grant execute on function public.research_mark_prompts(jsonb) to service_role;
grant execute on function public.research_housekeeping() to service_role;
grant execute on function public.research_active_user_ids(uuid[]) to service_role;

-- ── The survey ────────────────────────────────────────────────────────────────

-- What this student has waiting at p_now, from the schedule alone. Returns no row
-- for someone who is not an active participant, or has no survey schedule, or
-- whose group has no questions. Otherwise one row:
--   for_date      the day to answer for, or null when nothing is waiting
--   late          true when for_date is before today
--   questions     the questions, or null when nothing is waiting
--   next_due_at   when today's survey becomes due, when it has not yet
create or replace function research.pending_survey(p_user uuid, p_now timestamptz default now())
returns table(for_date date, late boolean, questions jsonb, next_due_at timestamptz, intro text)
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

  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'format', q.format, 'options', q.options, 'show_if', q.show_if)
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
     and v_today_due >= (v_p.enrolled_at at time zone v_tz)
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
       and v_due >= (v_p.enrolled_at at time zone v_tz)
       and v_due < v_end
       and not exists (select 1 from research.survey_days d where d.participant_id = v_p.id and d.for_date = v_d) then
      v_pick := v_d;
    end if;
  end if;

  return query select v_pick, coalesce(v_pick < v_today, false), case when v_pick is not null then v_q end, v_next,
    (select st.survey_intro from research.studies st where st.id = v_p.study_id);
end;
$$;

-- Records an answer set. Returns 'ok', 'not_pending' (nothing waiting for that
-- day, or already answered) or 'invalid_answers'. p_answers is a JSON object keyed
-- by question id. Every question for the student's group needs exactly one answer.
create or replace function research.submit_survey(
  p_user uuid, p_for_date date, p_answers jsonb, p_now timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid   uuid;
  v_tz    text;
  v_pend  record;
  v_q     jsonb;
  v_val   jsonb;
  v_day   uuid;
  v_si    jsonb;
  v_parent text;
  v_pval  jsonb;
  v_show  boolean;
  v_shown jsonb := '{}'::jsonb;
  v_expected integer := 0;
  v_ids   text[] := '{}';
begin
  select * into v_pend from research.pending_survey(p_user, p_now);
  if not found or v_pend.for_date is null or v_pend.for_date is distinct from p_for_date then return 'not_pending'; end if;

  if jsonb_typeof(p_answers) is distinct from 'object' then return 'invalid_answers'; end if;

  -- Questions come in order, and a follow-up always comes after the one it depends
  -- on, so one pass settles which are shown. A shown question needs a valid answer.
  -- A question that is not shown must have none.
  for v_q in select * from jsonb_array_elements(v_pend.questions) loop
    v_si := v_q -> 'show_if';
    if v_si is null or jsonb_typeof(v_si) = 'null' then
      v_show := true;
    else
      v_parent := v_si ->> 'question';
      v_pval := p_answers -> v_parent;
      if coalesce((v_shown ->> v_parent)::boolean, false) is not true or v_pval is null then
        v_show := false;
      elsif v_si ? 'any_of' then
        v_show := (v_si -> 'any_of') @> v_pval;
      else
        v_show := not ((v_si -> 'none_of') @> v_pval);
      end if;
    end if;
    v_shown := v_shown || jsonb_build_object(v_q ->> 'id', v_show);

    v_val := p_answers -> (v_q ->> 'id');
    if not v_show then
      if v_val is not null then return 'invalid_answers'; end if;
      continue;
    end if;
    v_expected := v_expected + 1;
    v_ids := v_ids || (v_q ->> 'id');

    if v_val is null then return 'invalid_answers'; end if;
    case v_q ->> 'format'
      when 'yes_no' then
        if jsonb_typeof(v_val) <> 'boolean' then return 'invalid_answers'; end if;
      when 'rating' then
        -- One check at a time: SQL does not promise to stop an "or" at the first
        -- true, and the cast below is only safe once the type is known.
        if jsonb_typeof(v_val) <> 'number' then return 'invalid_answers'; end if;
        if (v_val #>> '{}')::numeric not between 1 and 5 then return 'invalid_answers'; end if;
        if (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric) then return 'invalid_answers'; end if;
      when 'multiple_choice' then
        if jsonb_typeof(v_val) <> 'string' then return 'invalid_answers'; end if;
        if not ((v_q -> 'options') @> v_val) then return 'invalid_answers'; end if;
      when 'short_answer' then
        if jsonb_typeof(v_val) <> 'string' then return 'invalid_answers'; end if;
        if char_length(v_val #>> '{}') > 500 then return 'invalid_answers'; end if;
      else
        return 'invalid_answers';
    end case;
  end loop;

  -- Nothing beyond the shown questions: an answer to an unknown id is refused too.
  if (select count(*) from jsonb_object_keys(p_answers)) <> v_expected then return 'invalid_answers'; end if;

  select p.id into v_pid from research.participants p
  where p.user_id = p_user and p.status = 'active' and p.window_ends_at > p_now
  order by p.enrolled_at desc limit 1;
  select st.timezone into v_tz from research.studies st
  join research.participants p on p.study_id = st.id where p.id = v_pid;

  insert into research.survey_days (participant_id, for_date, submitted_at, late)
  values (v_pid, p_for_date, p_now, p_for_date < (p_now at time zone v_tz)::date)
  on conflict (participant_id, for_date) do nothing
  returning id into v_day;
  if v_day is null then return 'not_pending'; end if;

  insert into research.responses (survey_day_id, participant_id, question_id, answer)
  select v_day, v_pid, (q ->> 'id')::uuid, p_answers -> (q ->> 'id')
  from jsonb_array_elements(v_pend.questions) q
  where (q ->> 'id') = any (v_ids);

  return 'ok';
end;
$$;

revoke all on function research.pending_survey(uuid, timestamptz) from public, anon, authenticated;
revoke all on function research.submit_survey(uuid, date, jsonb, timestamptz) from public, anon, authenticated;

-- What the app calls. iOS only, like the rest of the student side.
create or replace function public.research_pending_survey(p_platform text default null)
returns table(status text, for_date date, late boolean, questions jsonb, next_due_at timestamptz, intro text)
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
  if p_platform is distinct from 'ios' then
    return query select 'ios_only'::text, null::date, null::boolean, null::jsonb, null::timestamptz, null::text;
    return;
  end if;

  select * into v_row from research.pending_survey(v_uid, now());
  if not found then
    return query select 'none'::text, null::date, null::boolean, null::jsonb, null::timestamptz, null::text;
  elsif v_row.for_date is null then
    return query select 'none'::text, null::date, null::boolean, null::jsonb, v_row.next_due_at, null::text;
  else
    return query select 'pending'::text, v_row.for_date, v_row.late, v_row.questions, v_row.next_due_at, v_row.intro;
  end if;
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
  if p_platform is distinct from 'ios' then
    return query select 'ios_only'::text;
    return;
  end if;
  return query select research.submit_survey(v_uid, p_for_date, p_answers, now());
end;
$$;

revoke all on function public.research_pending_survey(text) from public, anon;
revoke all on function public.research_submit_survey(date, jsonb, text) from public, anon;
grant execute on function public.research_pending_survey(text) to authenticated;
grant execute on function public.research_submit_survey(date, jsonb, text) to authenticated;

-- ── Who may read ──────────────────────────────────────────────────────────────

alter table research.reminder_schedules enable row level security;
alter table research.questions          enable row level security;
alter table research.prompts            enable row level security;
alter table research.survey_days        enable row level security;
alter table research.responses          enable row level security;

drop policy if exists schedules_researcher_read on research.reminder_schedules;
create policy schedules_researcher_read on research.reminder_schedules
  for select to authenticated
  using (research.is_researcher() and research.study_is_real(study_id));

drop policy if exists questions_researcher_read on research.questions;
create policy questions_researcher_read on research.questions
  for select to authenticated
  using (research.is_researcher() and research.study_is_real(study_id));

drop policy if exists prompts_researcher_read on research.prompts;
create policy prompts_researcher_read on research.prompts
  for select to authenticated
  using (research.is_researcher() and research.participant_is_real(participant_id));

drop policy if exists survey_days_researcher_read on research.survey_days;
create policy survey_days_researcher_read on research.survey_days
  for select to authenticated
  using (research.is_researcher() and research.participant_is_real(participant_id));

drop policy if exists responses_researcher_read on research.responses;
create policy responses_researcher_read on research.responses
  for select to authenticated
  using (research.is_researcher() and research.participant_is_real(participant_id));

revoke all on research.reminder_schedules, research.questions, research.prompts,
              research.survey_days, research.responses from public, anon, authenticated;
grant select on research.reminder_schedules, research.questions, research.prompts,
                research.survey_days, research.responses to authenticated;

-- How many survey days a participant has been asked to answer by p_now: every day
-- on their schedule whose time has passed, from enrolment to the end of their
-- window or the day they left.
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
  if not found then return 0; end if;
  select st.timezone into v_tz from research.studies st where st.id = v_p.study_id;
  select * into v_s from research.reminder_schedules s
  where s.study_id = v_p.study_id and s.kind = 'survey' and s.is_active and (s.grp is null or s.grp = v_p.grp)
  order by (s.grp is null), s.created_at limit 1;
  if not found then return 0; end if;

  v_until := least(p_now, v_p.window_ends_at, coalesce(v_p.withdrawn_at, 'infinity'::timestamptz)) at time zone v_tz;

  select count(*)::integer into v_n
  from generate_series((v_p.enrolled_at at time zone v_tz)::date, v_until::date, interval '1 day') g(d)
  where extract(isodow from g.d)::integer = any (v_s.days)
    and (g.d::date + v_s.send_time) >= (v_p.enrolled_at at time zone v_tz)
    and (g.d::date + v_s.send_time) <= v_until
    and (g.d::date + v_s.send_time) < (v_p.window_ends_at at time zone v_tz);
  return v_n;
end;
$$;

revoke all on function research.surveys_due(uuid, timestamptz) from public, anon;
grant execute on function research.surveys_due(uuid, timestamptz) to authenticated, service_role;

-- The compensation view: one row per participant, no food data. Response rate per
-- group is surveys_answered over surveys_due. Runs with the reader's rights.
create or replace view research.activity with (security_invoker = true) as
select
  p.id                                                              as participant_id,
  p.participant_code,
  p.grp,
  p.status,
  p.enrolled_at,
  greatest(0, research.local_date(p.study_id, least(now(), p.window_ends_at))
              - research.local_date(p.study_id, p.enrolled_at))     as days_enrolled,
  (select count(*) from research.prompts x where x.participant_id = p.id)::integer                          as prompts_claimed,
  (select count(*) from research.prompts x where x.participant_id = p.id and x.status = 'sent')::integer    as prompts_delivered,
  (select count(*) from research.prompts x where x.participant_id = p.id and x.status in ('failed', 'no_device'))::integer as prompts_undelivered,
  research.surveys_due(p.id, now())                                 as surveys_due,
  (select count(*) from research.survey_days d where d.participant_id = p.id)::integer                      as surveys_answered,
  (select count(*) from research.survey_days d where d.participant_id = p.id and d.late)::integer           as surveys_late,
  (select count(*) from research.meals m where m.participant_id = p.id and m.deleted_at is null)::integer   as plates_logged,
  (select count(*) from research.meals m where m.participant_id = p.id and m.deleted_at is null
     and m.consumption_reported_at is not null)::integer                                                    as consumption_reports,
  (select count(*) from research.events e where e.participant_id = p.id and e.kind = 'app_open')::integer   as app_opens,
  p.push_status
from research.participants p;

revoke all on research.activity from public, anon, authenticated;
grant select on research.activity to authenticated;
