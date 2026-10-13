-- Research dashboard, phase 6: researchers change the study from the dashboard.
--
-- Design: RESEARCH_DASHBOARD_SPEC.md, sections 6 and 6b. Builds on 054 to 057.
--
-- A researcher cannot write to any research table. Every change goes through one of
-- the functions below. Each one:
--
--   1. refuses anyone who is not an active researcher on a multi-factor session,
--      by raising, so a failure is never mistaken for a success;
--   2. refuses the App Review test study, which researchers cannot see;
--   3. checks its inputs, so a bad value is an error here and not a surprise during
--      the study;
--   4. writes ONE audit entry saying who changed what, from what, to what. A change
--      that changes nothing writes nothing. The study code is never written down,
--      only the fact that it changed.
--
-- A follow-up question depends on an earlier one. So that a change never leaves a
-- follow-up pointing at a question that is no longer asked (where it would simply
-- never appear), changing a question MOVES its follow-ups to the new version, in the
-- same transaction, and retiring a question retires its follow-ups with it. A change
-- the follow-ups cannot survive, such as a different kind of answer, is refused.
--
-- What cannot be changed here, on purpose: a question's wording (a change is a new
-- question that replaces the old one, so earlier answers keep the words they
-- answered), a participant's group, and the researchers' list.
--
-- Safe to run more than once.

-- The audit log gains the action these functions write.
alter table research.audit_log drop constraint if exists audit_log_action_check;
alter table research.audit_log
  add constraint audit_log_action_check check (action in ('export', 'sign_in', 'view_identities', 'setup_change'));

-- ── Internals ─────────────────────────────────────────────────────────────────

create or replace function research.require_researcher()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not research.is_researcher() then raise exception 'not_authorised'; end if;
  return auth.uid();
end;
$$;

create or replace function research.write_audit(p_action text, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  insert into research.audit_log (user_id, email, action, detail)
  select v_uid, r.email, p_action, p_detail from research.researchers r where r.user_id = v_uid;
end;
$$;

-- A study the researcher is allowed to change: real, and it exists.
create or replace function research.writable_study(p_study uuid)
returns research.studies
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s research.studies%rowtype;
begin
  select * into v_s from research.studies s where s.id = p_study and not s.is_test;
  if not found then raise exception 'unknown_study'; end if;
  return v_s;
end;
$$;

revoke all on function research.require_researcher() from public, anon, authenticated;
revoke all on function research.write_audit(text, jsonb) from public, anon, authenticated;
revoke all on function research.writable_study(uuid) from public, anon, authenticated;

-- ── The study ─────────────────────────────────────────────────────────────────

-- p_changes may hold: cap, is_open, window_days, starts_at, ends_at, survey_intro.
-- Anything else is refused. window_days applies to people who enrol afterwards:
-- everyone already in keeps the end date they were given. Returns the new values
-- of what was changed.
create or replace function public.research_set_study(p_study uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    research.studies%rowtype;
  v_new    research.studies%rowtype;
  v_key    text;
  v_val    jsonb;
  v_n      integer;
  v_diff   jsonb := '{}'::jsonb;
  v_result jsonb := '{}'::jsonb;
begin
  perform research.require_researcher();
  v_old := research.writable_study(p_study);
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'bad_changes'; end if;
  v_new := v_old;

  for v_key in select jsonb_object_keys(p_changes) loop
    v_val := p_changes -> v_key;
    case v_key
      when 'cap' then
        if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric) then raise exception 'bad_value: cap'; end if;
        v_n := (v_val #>> '{}')::integer;
        if v_n < 1 or v_n > 1000 then raise exception 'bad_value: cap'; end if;
        if v_n < (select count(*) from research.participants p where p.study_id = p_study) then raise exception 'cap_below_enrolled'; end if;
        v_new.cap := v_n;
      when 'is_open' then
        if jsonb_typeof(v_val) <> 'boolean' then raise exception 'bad_value: is_open'; end if;
        v_new.is_open := (v_val #>> '{}')::boolean;
      when 'window_days' then
        if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric) then raise exception 'bad_value: window_days'; end if;
        v_n := (v_val #>> '{}')::integer;
        if v_n < 1 or v_n > 120 then raise exception 'bad_value: window_days'; end if;
        v_new.window_days := v_n;
      when 'starts_at' then
        v_new.starts_at := case when jsonb_typeof(v_val) = 'null' then null else (v_val #>> '{}')::timestamptz end;
      when 'ends_at' then
        v_new.ends_at := case when jsonb_typeof(v_val) = 'null' then null else (v_val #>> '{}')::timestamptz end;
      when 'survey_intro' then
        if jsonb_typeof(v_val) not in ('string', 'null') then raise exception 'bad_value: survey_intro'; end if;
        v_new.survey_intro := nullif(btrim(coalesce(v_val #>> '{}', '')), '');
        if char_length(coalesce(v_new.survey_intro, '')) > 600 then raise exception 'bad_value: survey_intro'; end if;
      else
        raise exception 'unknown_setting: %', v_key;
    end case;
  end loop;

  if v_new.ends_at is not null and v_new.starts_at is not null and v_new.ends_at <= v_new.starts_at then
    raise exception 'bad_value: ends_at';
  end if;

  if v_new.cap is distinct from v_old.cap then v_diff := v_diff || jsonb_build_object('cap', jsonb_build_object('from', v_old.cap, 'to', v_new.cap)); end if;
  if v_new.is_open is distinct from v_old.is_open then v_diff := v_diff || jsonb_build_object('is_open', jsonb_build_object('from', v_old.is_open, 'to', v_new.is_open)); end if;
  if v_new.window_days is distinct from v_old.window_days then v_diff := v_diff || jsonb_build_object('window_days', jsonb_build_object('from', v_old.window_days, 'to', v_new.window_days)); end if;
  if v_new.starts_at is distinct from v_old.starts_at then v_diff := v_diff || jsonb_build_object('starts_at', jsonb_build_object('from', v_old.starts_at, 'to', v_new.starts_at)); end if;
  if v_new.ends_at is distinct from v_old.ends_at then v_diff := v_diff || jsonb_build_object('ends_at', jsonb_build_object('from', v_old.ends_at, 'to', v_new.ends_at)); end if;
  if v_new.survey_intro is distinct from v_old.survey_intro then v_diff := v_diff || jsonb_build_object('survey_intro', jsonb_build_object('changed', true)); end if;

  if v_diff = '{}'::jsonb then return '{}'::jsonb; end if;

  update research.studies s
  set cap = v_new.cap, is_open = v_new.is_open, window_days = v_new.window_days,
      starts_at = v_new.starts_at, ends_at = v_new.ends_at, survey_intro = v_new.survey_intro
  where s.id = p_study;

  perform research.write_audit('setup_change', jsonb_build_object('what', 'study', 'study', p_study, 'changes', v_diff));
  return v_diff;
end;
$$;

-- Changes the code students type to join. The old one stops working at once and
-- people already enrolled are unaffected. The code itself is never stored in the
-- clear and never written to the audit log.
create or replace function public.research_set_study_code(p_study uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform research.require_researcher();
  perform research.writable_study(p_study);
  if char_length(research.normalise_code(p_code)) < 6 then raise exception 'code_too_short'; end if;
  begin
    update research.studies s set code_hash = research.hash_code(p_code) where s.id = p_study;
  exception when unique_violation then
    raise exception 'code_in_use';
  end;
  perform research.write_audit('setup_change', jsonb_build_object('what', 'code', 'study', p_study));
  return true;
end;
$$;

-- ── Reminder and survey times ─────────────────────────────────────────────────

-- p_changes may hold: send_time ("HH:MM"), days (ISO weekdays 1 to 7), late_minutes
-- (1 to 1440), title, body, is_active. The group and the kind are fixed. To change
-- those, add a new one and switch the old one off.
create or replace function public.research_save_schedule(p_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old   research.reminder_schedules%rowtype;
  v_new   research.reminder_schedules%rowtype;
  v_key   text;
  v_val   jsonb;
  v_n     integer;
  v_diff  jsonb := '{}'::jsonb;
begin
  perform research.require_researcher();
  select * into v_old from research.reminder_schedules s where s.id = p_id;
  if not found then raise exception 'unknown_schedule'; end if;
  perform research.writable_study(v_old.study_id);
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'bad_changes'; end if;
  v_new := v_old;

  for v_key in select jsonb_object_keys(p_changes) loop
    v_val := p_changes -> v_key;
    case v_key
      when 'send_time' then
        if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad_value: send_time'; end if;
        v_new.send_time := (v_val #>> '{}')::time;
      when 'days' then
        if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) not between 1 and 7 then raise exception 'bad_value: days'; end if;
        if exists (select 1 from jsonb_array_elements(v_val) e where jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric not between 1 and 7 or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric)) then
          raise exception 'bad_value: days';
        end if;
        select array_agg(distinct (e #>> '{}')::integer order by (e #>> '{}')::integer) into v_new.days from jsonb_array_elements(v_val) e;
      when 'late_minutes' then
        if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric) then raise exception 'bad_value: late_minutes'; end if;
        v_n := (v_val #>> '{}')::integer;
        if v_n < 1 or v_n > 1440 then raise exception 'bad_value: late_minutes'; end if;
        v_new.late_minutes := v_n;
      when 'title' then
        if jsonb_typeof(v_val) <> 'string' or char_length(btrim(v_val #>> '{}')) not between 1 and 80 then raise exception 'bad_value: title'; end if;
        v_new.title := btrim(v_val #>> '{}');
      when 'body' then
        if jsonb_typeof(v_val) <> 'string' or char_length(v_val #>> '{}') > 200 then raise exception 'bad_value: body'; end if;
        v_new.body := btrim(v_val #>> '{}');
      when 'is_active' then
        if jsonb_typeof(v_val) <> 'boolean' then raise exception 'bad_value: is_active'; end if;
        v_new.is_active := (v_val #>> '{}')::boolean;
      else
        raise exception 'unknown_setting: %', v_key;
    end case;
  end loop;

  if v_new.send_time is distinct from v_old.send_time then v_diff := v_diff || jsonb_build_object('send_time', jsonb_build_object('from', v_old.send_time::text, 'to', v_new.send_time::text)); end if;
  if v_new.days is distinct from v_old.days then v_diff := v_diff || jsonb_build_object('days', jsonb_build_object('from', to_jsonb(v_old.days), 'to', to_jsonb(v_new.days))); end if;
  if v_new.late_minutes is distinct from v_old.late_minutes then v_diff := v_diff || jsonb_build_object('late_minutes', jsonb_build_object('from', v_old.late_minutes, 'to', v_new.late_minutes)); end if;
  if v_new.title is distinct from v_old.title then v_diff := v_diff || jsonb_build_object('title', jsonb_build_object('from', v_old.title, 'to', v_new.title)); end if;
  if v_new.body is distinct from v_old.body then v_diff := v_diff || jsonb_build_object('body', jsonb_build_object('changed', true)); end if;
  if v_new.is_active is distinct from v_old.is_active then v_diff := v_diff || jsonb_build_object('is_active', jsonb_build_object('from', v_old.is_active, 'to', v_new.is_active)); end if;

  if v_diff = '{}'::jsonb then return '{}'::jsonb; end if;

  update research.reminder_schedules s
  set send_time = v_new.send_time, days = v_new.days, late_minutes = v_new.late_minutes,
      title = v_new.title, body = v_new.body, is_active = v_new.is_active
  where s.id = p_id;

  perform research.write_audit('setup_change', jsonb_build_object('what', 'schedule', 'schedule', p_id, 'kind', v_old.kind, 'group', v_old.grp, 'changes', v_diff));
  return v_diff;
end;
$$;

create or replace function public.research_add_schedule(
  p_study uuid, p_grp text, p_kind text, p_time text, p_title text,
  p_body text default '', p_days integer[] default array[1, 2, 3, 4, 5, 6, 7], p_late integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform research.require_researcher();
  perform research.writable_study(p_study);
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad_value: send_time'; end if;
  v_id := research.add_schedule(p_study, nullif(btrim(coalesce(p_grp, '')), ''), p_kind, p_time::time, btrim(coalesce(p_title, '')),
                                btrim(coalesce(p_body, '')), p_days, p_late);
  perform research.write_audit('setup_change', jsonb_build_object('what', 'schedule_added', 'schedule', v_id, 'kind', p_kind, 'group', p_grp, 'time', p_time));
  return v_id;
end;
$$;

-- ── Survey questions ──────────────────────────────────────────────────────────

-- Moves every active follow-up of p_old to p_new, recursively, by adding a copy that
-- follows the new question and retiring the old one. A follow-up's own wording,
-- groups and place stay as they were. Answers to the old copy stay with it.
-- Refuses when the new question can no longer be what the condition was about.
create or replace function research.move_follow_ups(
  p_study uuid, p_old uuid, p_new uuid, p_old_format text, p_new_format text, p_new_options jsonb, p_depth integer default 0
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  f      research.questions%rowtype;
  v_vals jsonb;
  v_new  uuid;
  v_n    integer := 0;
begin
  if p_depth > 8 then raise exception 'follow_ups_too_deep'; end if;
  for f in select * from research.questions q
           where q.study_id = p_study and q.is_active and q.show_if ->> 'question' = p_old::text
           order by q.position, q.created_at loop
    v_vals := coalesce(f.show_if -> 'any_of', f.show_if -> 'none_of');
    -- The condition is about answers to the old question. It only carries over if the
    -- new question gives the same kind of answer and still offers every answer the
    -- condition names.
    if p_old_format is distinct from p_new_format
       or (p_new_format = 'multiple_choice' and not (p_new_options @> v_vals)) then
      raise exception 'follow_ups_would_break';
    end if;
    v_new := research.add_question(p_study, f.text, f.format, f.options, f.grps, f.position, f.id,
                                   jsonb_set(f.show_if, '{question}', to_jsonb(p_new::text)));
    v_n := v_n + 1 + research.move_follow_ups(p_study, f.id, v_new, f.format, f.format, f.options, p_depth + 1);
  end loop;
  return v_n;
end;
$$;

revoke all on function research.move_follow_ups(uuid, uuid, uuid, text, text, jsonb, integer) from public, anon, authenticated;

-- Adds a question. Pass p_replaces to change one: the old question stays, retired,
-- and its answers keep pointing at it. Its follow-ups move to the new question.
-- Returns the new question's id.
create or replace function public.research_add_question(
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
  v_id    uuid;
  v_old   research.questions%rowtype;
  v_moved integer := 0;
begin
  perform research.require_researcher();
  perform research.writable_study(p_study);
  if p_position is null or p_position < 0 or p_position > 1000 then raise exception 'bad_value: position'; end if;
  if p_replaces is not null then select * into v_old from research.questions q where q.id = p_replaces and q.study_id = p_study; end if;

  v_id := research.add_question(p_study, btrim(coalesce(p_text, '')), p_format, coalesce(p_options, '[]'::jsonb),
                                coalesce(p_grps, '{}'), p_position, p_replaces, p_show_if);
  if p_replaces is not null then
    v_moved := research.move_follow_ups(p_study, p_replaces, v_id, v_old.format, p_format, coalesce(p_options, '[]'::jsonb));
  end if;

  perform research.write_audit('setup_change', jsonb_build_object(
    'what', case when p_replaces is null then 'question_added' else 'question_replaced' end,
    'question', v_id, 'replaces', p_replaces, 'format', p_format, 'groups', to_jsonb(coalesce(p_grps, '{}'::text[])),
    'follow_ups_moved', v_moved));
  return v_id;
end;
$$;

-- Retires or restores a question, and moves it. A retired question is no longer
-- asked, and neither are its follow-ups, which are retired with it. Its earlier
-- answers stay. A follow-up cannot be brought back while the question it follows is
-- retired, because it would never be shown.
create or replace function public.research_set_question(p_id uuid, p_active boolean default null, p_position integer default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q    research.questions%rowtype;
  v_diff jsonb := '{}'::jsonb;
  v_also uuid[] := '{}';
begin
  perform research.require_researcher();
  select * into v_q from research.questions q where q.id = p_id;
  if not found then raise exception 'unknown_question'; end if;
  perform research.writable_study(v_q.study_id);
  if p_position is not null and (p_position < 0 or p_position > 1000) then raise exception 'bad_value: position'; end if;

  if p_active is not null and p_active is distinct from v_q.is_active then
    if p_active and v_q.show_if is not null
       and not exists (select 1 from research.questions par where par.id::text = v_q.show_if ->> 'question' and par.is_active) then
      raise exception 'parent_is_retired';
    end if;
    v_diff := v_diff || jsonb_build_object('is_active', jsonb_build_object('from', v_q.is_active, 'to', p_active));
  end if;
  if p_position is not null and p_position is distinct from v_q.position then
    v_diff := v_diff || jsonb_build_object('position', jsonb_build_object('from', v_q.position, 'to', p_position));
  end if;
  if v_diff = '{}'::jsonb then return false; end if;

  if p_active is false and v_q.is_active then
    with recursive down as (
      select q.id from research.questions q where q.study_id = v_q.study_id and q.is_active and q.show_if ->> 'question' = p_id::text
      union
      select q.id from research.questions q join down d on q.show_if ->> 'question' = d.id::text where q.study_id = v_q.study_id and q.is_active
    )
    select coalesce(array_agg(id), '{}') into v_also from down;
    update research.questions q set is_active = false where q.id = any (v_also);
  end if;

  update research.questions q set is_active = coalesce(p_active, q.is_active), position = coalesce(p_position, q.position) where q.id = p_id;
  perform research.write_audit('setup_change', jsonb_build_object('what', 'question', 'question', p_id, 'changes', v_diff,
                                                                  'also_retired', to_jsonb(v_also)));
  return true;
end;
$$;

revoke all on function public.research_set_study(uuid, jsonb) from public, anon;
revoke all on function public.research_set_study_code(uuid, text) from public, anon;
revoke all on function public.research_save_schedule(uuid, jsonb) from public, anon;
revoke all on function public.research_add_schedule(uuid, text, text, text, text, text, integer[], integer) from public, anon;
revoke all on function public.research_add_question(uuid, text, text, jsonb, text[], integer, uuid, jsonb) from public, anon;
revoke all on function public.research_set_question(uuid, boolean, integer) from public, anon;
grant execute on function public.research_set_study(uuid, jsonb) to authenticated;
grant execute on function public.research_set_study_code(uuid, text) to authenticated;
grant execute on function public.research_save_schedule(uuid, jsonb) to authenticated;
grant execute on function public.research_add_schedule(uuid, text, text, text, text, text, integer[], integer) to authenticated;
grant execute on function public.research_add_question(uuid, text, text, jsonb, text[], integer, uuid, jsonb) to authenticated;
grant execute on function public.research_set_question(uuid, boolean, integer) to authenticated;

-- ── What the page reads ───────────────────────────────────────────────────────

-- How many answers each question has, so the page can say what a change would
-- touch before anyone makes it.
create or replace view research.question_usage with (security_invoker = true) as
select r.question_id, count(*)::integer as answers
from research.responses r
group by r.question_id;

revoke all on research.question_usage from public, anon, authenticated;
grant select on research.question_usage to authenticated;
