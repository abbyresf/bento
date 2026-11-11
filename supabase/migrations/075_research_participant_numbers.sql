-- Participant numbers never repeat.
--
-- research_enroll numbered each new person by how many were already in the study, so
-- if a participant row was deleted (for example a test account reset) the next person
-- was given a number that was already in use and the join failed with a generic error.
-- The number is now one more than the highest issued. Nothing else changes.
--
-- Supersedes research_enroll from 064. Safe to run more than once.

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

  -- The next number after the highest one issued, not the number of people: if a row
  -- is ever removed (a test account reset) a count would hand out a number that is
  -- already in use.
  select coalesce(max(substring(p.participant_code from 3)::integer), 0) + 1 into v_n
  from research.participants p where p.study_id = v_id and p.participant_code ~ '^P-[0-9]+$';
  v_code := 'P-' || lpad(v_n::text, 3, '0');
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
