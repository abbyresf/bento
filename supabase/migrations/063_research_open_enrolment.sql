-- Anyone with the study code can enrol. The researchers' list is compared afterwards.
--
-- Students sign up in waves and the full list arrives later, so enrolment no longer
-- checks the list. The code is the only gate. Once the list is loaded, the roster
-- and participants sheets show who is on it and who is not, matched by email, and
-- that comparison is live: load or add to the list at any time and it updates.
-- Nothing is claimed or stored about the match, so a late or corrected list needs
-- no clean-up.
--
-- Supersedes research_check_code and research_enroll (054, 059), and the roster and
-- participant views (057, 061). Safe to run more than once.

alter table research.participants alter column roster_id drop not null;

-- Step 1. Is the code right. No longer asks whether the account is on the list.
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

  if exists (select 1 from research.participants p where p.study_id = v_id and p.user_id = v_uid) then
    return query select 'already_enrolled'::text, null::text;
    return;
  end if;

  select s.name into v_name from research.studies s where s.id = v_id;
  return query select 'ok'::text, v_name;
end;
$$;

-- Step 2. Enrol, after the acknowledgement. The group is assigned here (059) and is
-- never returned to the app.
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
  v_ends := v_now + make_interval(days => v_study.window_days);

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


-- The list against who has enrolled, matched by email as the list is read.
drop view if exists research.grid_roster;
drop view if exists research.roster_status;

create view research.roster_status with (security_invoker = true) as
select
  r.id             as roster_id,
  r.study_id,
  r.match_key      as email,
  r.full_name,
  r.added_at,
  (p.id is not null)  as enrolled,
  p.enrolled_at       as claimed_at,
  p.participant_code,
  p.status         as participant_status
from research.roster r
left join research.participants p
  on p.study_id = r.study_id and lower(btrim(p.email)) = r.match_key;

create view research.grid_roster with (security_invoker = true) as
select rs.roster_id::text as row_id, rs.email, rs.full_name, rs.enrolled, rs.participant_code,
       rs.participant_status, rs.added_at, rs.claimed_at
from research.roster_status rs;

-- Participants, with whether they are on the list and the name the list gives them.
drop view if exists research.grid_participants;
create view research.grid_participants with (security_invoker = true) as
select p.id::text as row_id, p.participant_code, p.grp, p.status,
       coalesce(p.full_name, r.full_name) as full_name, p.email,
       (r.id is not null) as on_list,
       p.enrolled_at, p.window_ends_at, p.withdrawn_at, p.acknowledged_at, p.platform, p.push_status, p.install_state
from research.participants p
left join research.roster r on r.study_id = p.study_id and r.match_key = lower(btrim(p.email));

revoke all on research.roster_status, research.grid_roster, research.grid_participants from public, anon, authenticated;
grant select on research.roster_status, research.grid_roster, research.grid_participants to authenticated;
