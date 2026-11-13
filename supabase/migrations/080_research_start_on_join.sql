-- One code: joining starts the week.
--
-- Since 064 a student joined with the study code and started their week later,
-- with a second code at the snack pickup station. The researchers now hand out
-- one code, at the pickup station, once the student has their snack box. So the
-- moment a student joins is the moment their week starts.
--
-- studies.start_on_join (on by default, and turned on here for every study) makes
-- research_enroll start the week as research_activate does: activated_at is now,
-- and the week ends at midnight Eastern after its last calendar day. Anyone who
-- joined before this and has not started is started now, so nobody is left
-- waiting for a code they will never be given.
--
-- The app needs no change to work with this. After joining it asks for the start
-- code, and entering anything there answers "already started", which it treats as
-- done. research_activate and the start code stay, for a study that turns the
-- setting off.
--
-- Supersedes research_enroll from 075. Safe to run more than once.

alter table research.studies add column if not exists start_on_join boolean not null default true;
update research.studies set start_on_join = true where not start_on_join;

grant select (start_on_join) on research.studies to authenticated;

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
  v_start  timestamptz;
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

  -- Bento assigns the group: whichever has fewest people so far, at random when
  -- level. With one group, that is always it.
  select g.grp into v_grp
  from unnest(v_study.groups) as g(grp)
  order by (select count(*) from research.participants p where p.study_id = v_id and p.grp = g.grp),
           random()
  limit 1;

  -- The next number after the highest one issued (see 075).
  select coalesce(max(substring(p.participant_code from 3)::integer), 0) + 1 into v_n
  from research.participants p where p.study_id = v_id and p.participant_code ~ '^P-[0-9]+$';
  v_code := 'P-' || lpad(v_n::text, 3, '0');

  -- The week starts now when the study starts on joining, exactly as
  -- research_activate starts it. Otherwise it waits for the start code.
  if v_study.start_on_join then
    v_start := v_now;
    v_ends  := ((((v_now at time zone v_study.timezone)::date) + v_study.window_days)::timestamp) at time zone v_study.timezone;
  else
    v_start := null;
    v_ends  := null;
  end if;

  insert into research.participants
    (study_id, user_id, participant_code, grp, email,
     enrolled_at, window_ends_at, acknowledged_at, platform, activated_at)
  values
    (v_id, v_uid, v_code, v_grp, v_email,
     v_now, v_ends, v_now, p_platform, v_start);

  update public.profiles set research_cohort = true where id = v_uid;

  return query select 'ok'::text, v_code, v_ends;
end;
$$;
revoke all on function public.research_enroll(text, boolean, text) from public, anon;
grant execute on function public.research_enroll(text, boolean, text) to authenticated;

-- Anyone who joined and has not started is started now: their week runs from
-- today. Their start was never set, so the guard allows setting it once.
update research.participants p
set activated_at  = now(),
    window_ends_at = ((((now() at time zone s.timezone)::date) + s.window_days)::timestamp) at time zone s.timezone
from research.studies s
where s.id = p.study_id
  and s.start_on_join
  and p.status = 'active'
  and p.activated_at is null;
