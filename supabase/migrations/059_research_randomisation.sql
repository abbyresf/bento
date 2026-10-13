-- Randomisation moves to Bento.
--
-- Until now the researchers' list carried each person's group. It no longer does:
-- Bento assigns the group when a person enrols, in order of arrival, so that every
-- two people who join get one of each (which of the two is random) and an odd
-- person out is assigned at random against groups that are already even. The
-- group is never sent to the app, and no pair is stored or shown anywhere.
-- The list stays as a reference for who may join: email, and a name if given.
--
-- Supersedes research_enroll and add_roster from 054. Safe to run more than once.

alter table research.roster alter column grp drop not null;
alter table research.roster drop constraint if exists roster_grp_check;
update research.roster set grp = null where claimed_by is null;

create or replace function research.roster_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.claimed_by is not null then
    if new.match_key is distinct from old.match_key
       or new.study_id  is distinct from old.study_id
       or new.claimed_by is distinct from old.claimed_by
       or new.claimed_at is distinct from old.claimed_at then
      raise exception 'roster_entry_claimed';
    end if;
  end if;
  return new;
end;
$$;

-- Loads the researchers' list. p_rows is a JSON array of
--   {"email": "...", "name": "..."}   (name is optional)
-- A "group" in a row is ignored. Safe to run again with a longer list: new people
-- are added, people not yet enrolled are updated, and nobody who has enrolled is
-- touched. Returns how many were added, updated and skipped.
create or replace function research.add_roster(p_study uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row   jsonb;
  v_key   text;
  v_name  text;
  v_have  research.roster%rowtype;
  v_added integer := 0;
  v_upd   integer := 0;
  v_skip  integer := 0;
begin
  if not exists (select 1 from research.studies s where s.id = p_study) then raise exception 'unknown_study'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'rows_must_be_an_array'; end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_key  := lower(btrim(coalesce(v_row ->> 'email', '')));
    v_name := nullif(btrim(coalesce(v_row ->> 'name', '')), '');
    if v_key !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email: %', v_key; end if;

    select * into v_have from research.roster r where r.study_id = p_study and r.match_key = v_key;
    if not found then
      insert into research.roster (study_id, match_key, full_name) values (p_study, v_key, v_name);
      v_added := v_added + 1;
    elsif v_have.claimed_by is not null then
      v_skip := v_skip + 1;
    else
      update research.roster r set full_name = v_name where r.id = v_have.id;
      v_upd := v_upd + 1;
    end if;
  end loop;

  return jsonb_build_object('added', v_added, 'updated', v_upd, 'skipped_enrolled', v_skip);
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
  v_roster research.roster%rowtype;
  v_rid    uuid;
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
    (study_id, roster_id, user_id, participant_code, grp, full_name, email,
     enrolled_at, window_ends_at, acknowledged_at, platform)
  values
    (v_id, v_roster.id, v_uid, v_code, v_grp, v_roster.full_name, v_email,
     v_now, v_ends, v_now, p_platform);

  update research.roster r set claimed_by = v_uid, claimed_at = v_now where r.id = v_roster.id;
  update public.profiles set research_cohort = true where id = v_uid;

  return query select 'ok'::text, v_code, v_ends;
end;
$$;
