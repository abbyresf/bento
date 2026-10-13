-- Research dashboard, phase 5: what the researcher site needs from the database.
--
-- Design: RESEARCH_DASHBOARD_SPEC.md, section 6. Builds on 054 to 056.
--
-- 1. An audit log. Every export and every sign-in to the dashboard is recorded,
--    with who and what. It is append-only: the rows cannot be changed or deleted.
--    Only an owner can read it. A researcher writes to it only through
--    research_log_action, which refuses anyone without a multi-factor session.
--
-- 2. research_whoami, so the site can tell "not signed in", "signed in but not a
--    researcher" and "a researcher who still has to pass multi-factor" apart.
--
-- 3. Flattened views so the grid does not have to join in the browser: every
--    answer with its question and participant, the researchers' list with who has
--    enrolled, and one grid_* view per sheet. All run with the reader's rights, so
--    the same policies apply.
--
-- 4. The research tables are added to Supabase Realtime, so the grid fills as data
--    arrives. Realtime obeys the row-level security already on them.
--
-- Safe to run more than once.

-- ── The audit log ─────────────────────────────────────────────────────────────

create table if not exists research.audit_log (
  id      bigint      generated always as identity primary key,
  at      timestamptz not null default now(),
  user_id uuid        not null,
  email   text,
  action  text        not null check (action in ('export', 'sign_in', 'view_identities')),
  -- Which sheet, which format, how many rows, whether filters were applied. Small
  -- by design: this is a record of what was done, not a copy of the data.
  detail  jsonb       not null default '{}'::jsonb check (pg_column_size(detail) < 4000)
);
create index if not exists audit_log_at on research.audit_log (at desc);

create or replace function research.audit_log_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log_is_append_only';
end;
$$;

drop trigger if exists audit_log_guard on research.audit_log;
create trigger audit_log_guard
  before update or delete on research.audit_log
  for each row execute function research.audit_log_guard();

alter table research.audit_log enable row level security;

drop policy if exists audit_owner_read on research.audit_log;
create policy audit_owner_read on research.audit_log
  for select to authenticated
  using (research.is_owner());

revoke all on research.audit_log from public, anon, authenticated;
grant select on research.audit_log to authenticated;

-- Records one action by the signed-in researcher. Returns false, and writes
-- nothing, for anyone who is not an active researcher on a multi-factor session,
-- so a stolen password alone cannot even leave a record.
create or replace function public.research_log_action(p_action text, p_detail jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if p_action not in ('export', 'sign_in', 'view_identities') then return false; end if;
  if not research.is_researcher() then return false; end if;
  if jsonb_typeof(coalesce(p_detail, '{}'::jsonb)) is distinct from 'object' then return false; end if;
  if pg_column_size(coalesce(p_detail, '{}'::jsonb)) >= 4000 then return false; end if;

  select r.email into v_email from research.researchers r where r.user_id = v_uid;
  insert into research.audit_log (user_id, email, action, detail)
  values (v_uid, v_email, p_action, coalesce(p_detail, '{}'::jsonb));
  return true;
end;
$$;

-- Who the signed-in user is to the research side. Safe to call before multi-factor,
-- which is the point: it says what step comes next. It reveals nothing beyond the
-- caller's own role.
create or replace function public.research_whoami()
returns table(is_researcher boolean, role text, aal text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_r   research.researchers%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into v_r from research.researchers r where r.user_id = v_uid and r.is_active;
  return query select found, case when found then v_r.role end,
                      coalesce(auth.jwt() ->> 'aal', ''), case when found then v_r.email end;
end;
$$;

revoke all on function public.research_log_action(text, jsonb) from public, anon;
revoke all on function public.research_whoami() from public, anon;
grant execute on function public.research_log_action(text, jsonb) to authenticated;
grant execute on function public.research_whoami() to authenticated;

-- ── Flattened views for the grid ──────────────────────────────────────────────

-- One row per answer, with the participant and the exact question it answered.
create or replace view research.responses_flat with (security_invoker = true) as
select
  p.participant_code,
  p.grp,
  d.for_date,
  d.late,
  d.submitted_at,
  q.position           as question_position,
  q.text               as question_text,
  q.format             as question_format,
  q.id                 as question_id,
  r.answer,
  -- The answer as plain text, so a spreadsheet shows Yes, 4 or "Little or None".
  case jsonb_typeof(r.answer)
    when 'boolean' then case when (r.answer #>> '{}') = 'true' then 'Yes' else 'No' end
    else r.answer #>> '{}'
  end                  as answer_text,
  r.participant_id
from research.responses r
join research.survey_days d on d.id = r.survey_day_id
join research.participants p on p.id = r.participant_id
join research.questions q on q.id = r.question_id;

-- The researchers' list with who has enrolled, so "who is on the list and has not
-- joined yet" is one filter.
create or replace view research.roster_status with (security_invoker = true) as
select
  r.id             as roster_id,
  r.study_id,
  r.match_key      as email,
  r.full_name,
  r.added_at,
  (r.claimed_by is not null)  as enrolled,
  r.claimed_at,
  p.participant_code,
  p.status         as participant_status
from research.roster r
left join research.participants p on p.roster_id = r.id;

revoke all on research.responses_flat, research.roster_status from public, anon, authenticated;
grant select on research.responses_flat, research.roster_status to authenticated;

-- ── Owner tools: who may use the dashboard ───────────────────────────────────
-- Run from the SQL editor. Not callable by any client.
--
-- Invite the person from Supabase, Authentication, Users, "Invite user" (they set
-- a password from the email), then run research.add_researcher with their address.
-- They cannot see anything until they have also set up an authenticator app, which
-- the dashboard walks them through at their first sign in.

create or replace function research.add_researcher(p_email text, p_role text default 'researcher')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if p_role not in ('researcher', 'owner') then raise exception 'bad_role: %', p_role; end if;
  select u.id into v_id from auth.users u where lower(u.email) = v_email;
  if v_id is null then raise exception 'no_such_user: invite % in Supabase Authentication first', v_email; end if;

  insert into research.researchers (user_id, email, role, is_active)
  values (v_id, v_email, p_role, true)
  on conflict (user_id) do update set role = excluded.role, is_active = true, email = excluded.email;
  return v_id;
end;
$$;

-- Turns access off at once. The account and the audit trail stay.
create or replace function research.remove_researcher(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update research.researchers r set is_active = false where lower(r.email) = lower(btrim(coalesce(p_email, '')));
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function research.add_researcher(text, text) from public, anon, authenticated;
revoke all on function research.remove_researcher(text) from public, anon, authenticated;
grant execute on function research.add_researcher(text, text) to service_role;
grant execute on function research.remove_researcher(text) to service_role;

-- ── Grid views ────────────────────────────────────────────────────────────────

-- One view per sheet the dashboard shows. Each carries the participant code and
-- group, so the browser never has to join, and a row_id that does not change, so a
-- live update can find the row it is replacing. They run with the reader's rights,
-- so they show exactly what the policies on the tables underneath allow.

create or replace view research.grid_meals with (security_invoker = true) as
select m.id::text as row_id, p.participant_code, p.grp, m.meal_date, m.meal_type, m.dining_hall,
       m.confirmed_at,
       case when jsonb_typeof(m.items) = 'array' then jsonb_array_length(m.items) else 0 end as item_count,
       m.consumption_reported_at, m.deleted_at
from research.meals m join research.participants p on p.id = m.participant_id;

create or replace view research.grid_plate_items with (security_invoker = true) as
select (i.meal_id::text || ':' || i.item_position::text) as row_id, p.participant_code, p.grp,
       i.meal_date, i.meal_type, i.dining_hall, i.item_position, i.item_name, i.servings, i.consumed,
       i.calories, i.protein, i.carbs, i.fat, i.deleted_at
from research.plate_items i join research.participants p on p.id = i.participant_id;

create or replace view research.grid_events with (security_invoker = true) as
select e.id::text as row_id, p.participant_code, p.grp, e.at, e.kind, e.data::text as detail
from research.events e join research.participants p on p.id = e.participant_id;

create or replace view research.grid_snapshots with (security_invoker = true) as
select s.id::text as row_id, p.participant_code, p.grp, s.taken_at, s.reason, s.university, s.weight, s.weight_unit,
       s.height_feet, s.height_inches, s.age, s.sex, s.activity_level, s.goal, s.skip_breakfast,
       s.calories, s.protein, s.carbs, s.fat, s.restrictions::text as restrictions
from research.profile_snapshots s join research.participants p on p.id = s.participant_id;

create or replace view research.grid_prompts with (security_invoker = true) as
select x.id::text as row_id, p.participant_code, p.grp, x.local_date, x.kind, sc.title, x.status,
       x.claimed_at, x.sent_at, x.error
from research.prompts x
join research.participants p on p.id = x.participant_id
join research.reminder_schedules sc on sc.id = x.schedule_id;

create or replace view research.grid_responses with (security_invoker = true) as
select (f.participant_id::text || ':' || f.question_id::text || ':' || f.for_date::text) as row_id,
       f.participant_code, f.grp, f.for_date, f.late, f.submitted_at, f.question_position,
       f.question_text, f.question_format, f.answer_text
from research.responses_flat f;

create or replace view research.grid_roster with (security_invoker = true) as
select rs.roster_id::text as row_id, rs.email, rs.full_name, rs.enrolled, rs.participant_code,
       rs.participant_status, rs.added_at, rs.claimed_at
from research.roster_status rs;

create or replace view research.grid_participants with (security_invoker = true) as
select p.id::text as row_id, p.participant_code, p.grp, p.status, p.full_name, p.email, p.enrolled_at,
       p.window_ends_at, p.withdrawn_at, p.acknowledged_at, p.platform, p.push_status, p.install_state
from research.participants p;

create or replace view research.grid_activity with (security_invoker = true) as
select a.participant_id::text as row_id, a.participant_code, a.grp, a.status, a.enrolled_at, a.days_enrolled,
       a.prompts_claimed, a.prompts_delivered, a.prompts_undelivered, a.surveys_due, a.surveys_answered,
       a.surveys_late, a.plates_logged, a.consumption_reports, a.app_opens, a.push_status
from research.activity a;

revoke all on research.grid_meals, research.grid_plate_items, research.grid_events, research.grid_snapshots,
              research.grid_prompts, research.grid_responses, research.grid_roster, research.grid_participants,
              research.grid_activity from public, anon, authenticated;
grant select on research.grid_meals, research.grid_plate_items, research.grid_events, research.grid_snapshots,
                research.grid_prompts, research.grid_responses, research.grid_roster, research.grid_participants,
                research.grid_activity to authenticated;

-- ── Realtime ──────────────────────────────────────────────────────────────────

-- Only where Supabase's publication exists. A plain Postgres has none, which is
-- the case under the test database. Each table on its own, so one already being
-- there does not stop the rest.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['participants', 'meals', 'events', 'responses', 'survey_days', 'prompts', 'profile_snapshots'] loop
      begin
        execute format('alter publication supabase_realtime add table research.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end;
$$;
