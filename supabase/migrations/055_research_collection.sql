-- Research study, phase 3: collecting what a participant does, and keeping it out
-- of dining Pulse.
--
-- Design: RESEARCH_DASHBOARD_SPEC.md, sections 2, 5 and 7. Builds on 054.
--
-- Rules that shape this file.
--
-- 1. Copy by trigger, at write time. A trigger on each source table copies a row
--    into research.* only while the student is an active participant, so
--    collection starts at enrolment and stops at withdrawal or the end of their
--    window. Nothing from before enrolment is ever copied. Realtime can follow
--    the research tables, which it cannot do through views.
--
-- 2. The research copy can never get in the way of a student. Every trigger body
--    is wrapped so that any error becomes a warning and the student's own write
--    goes through. A broken research table must cost the researchers a row, never
--    cost a student a meal confirmation.
--
-- 3. Consumption ("how much of each item did you eat") lives inside each
--    meal_history row's items, not in a table of its own, so the meal copy is the
--    plate and the waste record together. research.plate_items flattens it to one
--    row per item for the grid.
--
-- 4. Snapshots, not overwrites. A change to weight, targets or restrictions adds a
--    new row, so both values survive. A snapshot identical to the last one is not
--    stored.
--
-- 5. Dining Pulse never sees these students. The profile flag set at enrolment
--    (research_cohort) is read by the JavaScript helper that scopes every Pulse
--    query, and by the two database objects Pulse reads that skip that helper: the
--    ratings view and the survey results function, both redefined below.
--
-- Safe to run more than once.

alter table research.studies
  add column if not exists timezone text not null default 'America/New_York';
grant select (timezone) on research.studies to authenticated;

-- ── Helpers ───────────────────────────────────────────────────────────────────

-- The participant row for a student who is being collected right now, or no row.
create or replace function research.active_participant_id(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from research.participants p
  where p.user_id = p_user and p.status = 'active' and p.window_ends_at > now()
  order by p.enrolled_at desc
  limit 1;
$$;

create or replace function research.local_date(p_study uuid, p_ts timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (p_ts at time zone s.timezone)::date from research.studies s where s.id = p_study;
$$;

-- A number from a JSON value, or null when it is not a number. Item data comes
-- from the app, and one odd value must not break a researcher's whole sheet.
create or replace function research.jnum(j jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(j) = 'number' then (j #>> '{}')::numeric end;
$$;

create or replace function research.participant_is_real(p_participant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from research.participants p
    join research.studies s on s.id = p.study_id
    where p.id = p_participant and not s.is_test
  );
$$;

revoke all on function research.active_participant_id(uuid) from public, anon, authenticated;
revoke all on function research.local_date(uuid, timestamptz) from public, anon;
revoke all on function research.jnum(jsonb) from public, anon;
revoke all on function research.participant_is_real(uuid) from public, anon;
grant execute on function research.local_date(uuid, timestamptz) to authenticated, service_role;
grant execute on function research.jnum(jsonb) to authenticated, service_role;
grant execute on function research.participant_is_real(uuid) to authenticated, service_role;

-- ── Tables ────────────────────────────────────────────────────────────────────

create table if not exists research.meals (
  id             uuid        primary key default gen_random_uuid(),
  participant_id uuid        not null references research.participants(id),
  -- meal_history.id. A plain value, like user_id, so it outlives the source row.
  source_id      uuid        not null,
  meal_date      date,
  meal_type      text,
  dining_hall    text,
  confirmed_at   timestamptz,
  items          jsonb       not null default '[]'::jsonb,
  -- The first time any item on this plate got a "how much did you eat" answer.
  -- Counts consumption reports, which is a compensation metric.
  consumption_reported_at timestamptz,
  copied_at      timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- The student undid the confirmation. The row stays and is marked.
  deleted_at     timestamptz,
  constraint meals_source unique (participant_id, source_id)
);
create index if not exists meals_participant_date on research.meals (participant_id, meal_date);

create table if not exists research.profile_snapshots (
  id             bigint      generated always as identity primary key,
  participant_id uuid        not null references research.participants(id),
  taken_at       timestamptz not null default now(),
  reason         text        not null check (reason in ('enrolment', 'profile', 'targets', 'restrictions')),
  university     text,
  weight         numeric,
  weight_unit    text,
  height_feet    integer,
  height_inches  integer,
  age            integer,
  sex            text,
  activity_level text,
  goal           text,
  skip_breakfast boolean,
  calories       numeric,
  protein        numeric,
  carbs          numeric,
  fat            numeric,
  -- Every flag on the dietary_restrictions row, whatever columns it has now.
  -- Includes halal and kosher, which are religious data. The researchers' consent
  -- form has to name that.
  restrictions   jsonb       not null default '{}'::jsonb,
  snap_hash      text        not null
);
create index if not exists profile_snapshots_participant on research.profile_snapshots (participant_id, id desc);

create table if not exists research.events (
  id             bigint      generated always as identity primary key,
  participant_id uuid        not null references research.participants(id),
  kind           text        not null check (kind in
                   ('app_open', 'favorite_added', 'favorite_removed', 'streak_updated', 'push_added', 'push_removed')),
  at             timestamptz not null default now(),
  -- Never a token or a name. Item ids, counts and a platform label.
  data           jsonb       not null default '{}'::jsonb
);
create index if not exists events_participant_at on research.events (participant_id, at desc);

-- ── Copying ───────────────────────────────────────────────────────────────────

create or replace function research.mirror_meal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p     research.participants%rowtype;
  v_date  date;
  v_has   boolean;
begin
  begin
    select * into v_p from research.participants p
    where p.user_id = (case when tg_op = 'DELETE' then old.user_id else new.user_id end)
      and p.status = 'active' and p.window_ends_at > now()
    order by p.enrolled_at desc
    limit 1;
    if not found then return null; end if;

    if tg_op = 'DELETE' then
      -- A student undoing a confirmation is marked. An account being deleted takes
      -- its meal rows with it by cascade, and that is not an undo, so the profile
      -- being gone means leave the research copy exactly as it was.
      if exists (select 1 from public.profiles pr where pr.id = old.user_id) then
        update research.meals m set deleted_at = now(), updated_at = now()
        where m.participant_id = v_p.id and m.source_id = old.id and m.deleted_at is null;
      end if;
      return null;
    end if;

    -- Nothing from before enrolment, even if a student edits an old plate later.
    v_date := coalesce(new.meal_date, research.local_date(v_p.study_id, new.confirmed_at));
    if v_date < research.local_date(v_p.study_id, v_p.enrolled_at) then return null; end if;

    v_has := exists (
      select 1
      from jsonb_array_elements(case when jsonb_typeof(new.items) = 'array' then new.items else '[]'::jsonb end) i(item)
      where jsonb_typeof(i.item -> 'consumed') = 'number'
    );

    insert into research.meals
      (participant_id, source_id, meal_date, meal_type, dining_hall, confirmed_at, items, consumption_reported_at)
    values
      (v_p.id, new.id, new.meal_date, new.meal_type, new.dining_hall, new.confirmed_at,
       coalesce(new.items, '[]'::jsonb), case when v_has then now() end)
    on conflict (participant_id, source_id) do update set
      meal_date = excluded.meal_date,
      meal_type = excluded.meal_type,
      dining_hall = excluded.dining_hall,
      confirmed_at = excluded.confirmed_at,
      items = excluded.items,
      consumption_reported_at = coalesce(research.meals.consumption_reported_at, excluded.consumption_reported_at),
      updated_at = now(),
      deleted_at = null;
  exception when others then
    raise warning 'research.mirror_meal skipped: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists research_mirror_meal on public.meal_history;
create trigger research_mirror_meal
  after insert or update or delete on public.meal_history
  for each row execute function research.mirror_meal();

-- Adds a snapshot of who the student is right now, unless nothing changed since
-- the last one.
create or replace function research.take_snapshot(p_participant uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p     research.participants%rowtype;
  v_prof  public.profiles%rowtype;
  v_t     public.nutrition_targets%rowtype;
  v_r     jsonb;
  v_hash  text;
  v_last  text;
begin
  select * into v_p from research.participants p where p.id = p_participant;
  if not found then return; end if;

  select * into v_prof from public.profiles where id = v_p.user_id;
  select * into v_t from public.nutrition_targets where user_id = v_p.user_id;
  select to_jsonb(d) - 'id' - 'user_id' - 'updated_at' into v_r
  from public.dietary_restrictions d where d.user_id = v_p.user_id;
  v_r := coalesce(v_r, '{}'::jsonb);

  v_hash := md5(concat_ws('|', v_prof.university, v_prof.weight, v_prof.weight_unit, v_prof.height_feet,
    v_prof.height_inches, v_prof.age, v_prof.sex, v_prof.activity_level, v_prof.goal, v_prof.skip_breakfast,
    v_t.calories, v_t.protein, v_t.carbs, v_t.fat, v_r::text));

  select s.snap_hash into v_last from research.profile_snapshots s
  where s.participant_id = p_participant order by s.id desc limit 1;
  if v_last = v_hash then return; end if;

  insert into research.profile_snapshots
    (participant_id, reason, university, weight, weight_unit, height_feet, height_inches, age, sex,
     activity_level, goal, skip_breakfast, calories, protein, carbs, fat, restrictions, snap_hash)
  values
    (p_participant, p_reason, v_prof.university, v_prof.weight, v_prof.weight_unit, v_prof.height_feet,
     v_prof.height_inches, v_prof.age, v_prof.sex, v_prof.activity_level, v_prof.goal, v_prof.skip_breakfast,
     v_t.calories, v_t.protein, v_t.carbs, v_t.fat, v_r, v_hash);
end;
$$;

revoke all on function research.take_snapshot(uuid, text) from public, anon, authenticated;

create or replace function research.snapshot_on_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_pid uuid;
begin
  begin
    -- profiles has no user_id and its own id is the user. The others have both.
    v_uid := coalesce(to_jsonb(new) ->> 'user_id', to_jsonb(new) ->> 'id')::uuid;
    v_pid := research.active_participant_id(v_uid);
    if v_pid is not null then
      perform research.take_snapshot(v_pid,
        case tg_table_name when 'profiles' then 'profile' when 'nutrition_targets' then 'targets' else 'restrictions' end);
    end if;
  exception when others then
    raise warning 'research.snapshot_on_change skipped: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists research_snapshot_profiles on public.profiles;
create trigger research_snapshot_profiles
  after insert or update on public.profiles
  for each row execute function research.snapshot_on_change();

drop trigger if exists research_snapshot_targets on public.nutrition_targets;
create trigger research_snapshot_targets
  after insert or update on public.nutrition_targets
  for each row execute function research.snapshot_on_change();

drop trigger if exists research_snapshot_restrictions on public.dietary_restrictions;
create trigger research_snapshot_restrictions
  after insert or update on public.dietary_restrictions
  for each row execute function research.snapshot_on_change();

-- The first snapshot is taken the moment someone enrols.
create or replace function research.snapshot_at_enrolment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform research.take_snapshot(new.id, 'enrolment');
  exception when others then
    raise warning 'research.snapshot_at_enrolment skipped: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists research_snapshot_at_enrolment on research.participants;
create trigger research_snapshot_at_enrolment
  after insert on research.participants
  for each row execute function research.snapshot_at_enrolment();

-- Favorites, streaks and push registrations become events.
create or replace function research.record_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  jsonb;
  v_pid  uuid;
  v_kind text;
  v_data jsonb;
begin
  begin
    v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
    v_pid := research.active_participant_id((v_row ->> 'user_id')::uuid);
    if v_pid is null then return null; end if;

    if tg_table_name = 'favorites' then
      v_kind := case when tg_op = 'DELETE' then 'favorite_removed' else 'favorite_added' end;
      v_data := jsonb_build_object('item_id', v_row ->> 'item_id');
    elsif tg_table_name = 'streaks' then
      if tg_op = 'UPDATE' and to_jsonb(old) ->> 'current_streak' is not distinct from v_row ->> 'current_streak' then
        return null;
      end if;
      v_kind := 'streak_updated';
      v_data := jsonb_build_object('current_streak', v_row -> 'current_streak', 'longest_streak', v_row -> 'longest_streak');
    else
      v_kind := case when tg_op = 'DELETE' then 'push_removed' else 'push_added' end;
      -- A label only. The token and the endpoint never go into research data.
      v_data := jsonb_build_object('platform', case when v_row ->> 'apns_token' is not null then 'ios' else 'web' end);
    end if;

    insert into research.events (participant_id, kind, data) values (v_pid, v_kind, v_data);
  exception when others then
    raise warning 'research.record_event skipped: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists research_event_favorites on public.favorites;
create trigger research_event_favorites
  after insert or delete on public.favorites
  for each row execute function research.record_event();

drop trigger if exists research_event_streaks on public.streaks;
create trigger research_event_streaks
  after insert or update on public.streaks
  for each row execute function research.record_event();

drop trigger if exists research_event_push on public.push_subscriptions;
create trigger research_event_push
  after insert or delete on public.push_subscriptions
  for each row execute function research.record_event();

-- The iOS app tells us it opened. At most one every 20 minutes, so a student flicking
-- between apps is one open.
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
  if p_platform is distinct from 'ios' or p_kind is distinct from 'app_open' then return false; end if;

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

revoke all on function public.research_log_event(text, text) from public, anon;
grant execute on function public.research_log_event(text, text) to authenticated;

-- ── Who may read ──────────────────────────────────────────────────────────────

alter table research.meals              enable row level security;
alter table research.profile_snapshots  enable row level security;
alter table research.events             enable row level security;

drop policy if exists meals_researcher_read on research.meals;
create policy meals_researcher_read on research.meals
  for select to authenticated
  using (research.is_researcher() and research.participant_is_real(participant_id));

drop policy if exists snapshots_researcher_read on research.profile_snapshots;
create policy snapshots_researcher_read on research.profile_snapshots
  for select to authenticated
  using (research.is_researcher() and research.participant_is_real(participant_id));

drop policy if exists events_researcher_read on research.events;
create policy events_researcher_read on research.events
  for select to authenticated
  using (research.is_researcher() and research.participant_is_real(participant_id));

revoke all on research.meals, research.profile_snapshots, research.events from public, anon, authenticated;
grant select on research.meals, research.profile_snapshots, research.events to authenticated;

-- One row per item on a plate, for the grid. Runs with the reader's rights, so the
-- policies above apply to it.
create or replace view research.plate_items with (security_invoker = true) as
select
  m.participant_id,
  m.source_id                                   as meal_id,
  m.meal_date,
  m.meal_type,
  m.dining_hall,
  m.confirmed_at,
  m.deleted_at,
  i.ord::integer                                as item_position,
  i.item ->> 'id'                               as item_id,
  i.item ->> 'name'                             as item_name,
  coalesce(research.jnum(i.item -> 'servings'), 1) as servings,
  research.jnum(i.item -> 'consumed')           as consumed,
  research.jnum(i.item #> '{nutrition,calories}') as calories,
  research.jnum(i.item #> '{nutrition,protein}')  as protein,
  research.jnum(i.item #> '{nutrition,carbs}')    as carbs,
  research.jnum(i.item #> '{nutrition,fat}')      as fat
from research.meals m
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(m.items) = 'array' then m.items else '[]'::jsonb end
) with ordinality as i(item, ord);

revoke all on research.plate_items from public, anon, authenticated;
grant select on research.plate_items to authenticated;

-- ── Keeping the cohort out of dining Pulse ────────────────────────────────────

-- The ratings view reads item_ratings across students, so it needs the filter
-- itself. Same columns as migration 022, so create or replace keeps its grants.
create or replace view public.item_rating_aggregates as
select
  r.item_id,
  min(r.item_name)                                                          as item_name,
  r.university,
  round(avg(r.rating)::numeric, 1)                                          as avg_rating,
  count(*)::integer                                                         as rating_count,
  case
    when count(distinct r.dining_hall) filter (where r.dining_hall is not null) = 1
    then min(r.dining_hall) filter (where r.dining_hall is not null)
    else null
  end                                                                       as dining_hall
from public.item_ratings r
where not exists (select 1 from public.profiles pc where pc.id = r.user_id and pc.research_cohort)
group by r.item_id, r.university;

-- Survey results as in migration 034, with the same three reads skipping the
-- cohort. Students in a study still see and answer dining surveys. Their answers
-- are kept and are simply not counted for the dining team.
create or replace function public.get_survey_results(p_university text)
returns table (
  id            uuid,
  question      text,
  format        text,
  options       jsonb,
  targets       text[],
  published_at  timestamptz,
  closes_at     timestamptz,
  is_active     boolean,
  answered      bigint,
  dismissed     bigint,
  -- [{ "choice": "Great", "count": 42 }, ...] for the closed-set formats.
  tally         jsonb,
  -- Free text for short_answer, newest first, no attribution.
  text_answers  jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_super boolean;
  v_uni      text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;

  select a.university, a.is_super_admin
    into v_uni, v_is_super
    from public.admin_users a
   where a.user_id = auth.uid() and a.is_active;

  if v_uni is null then raise exception 'unauthorized'; end if;
  if not coalesce(v_is_super, false) and v_uni <> p_university then
    raise exception 'unauthorized';
  end if;

  return query
    select
      s.id, s.question, s.format, s.options, s.target_restrictions,
      s.published_at, s.closes_at, s.is_active,
      coalesce(count(*) filter (where r.status = 'answered'), 0),
      coalesce(count(*) filter (where r.status = 'dismissed'), 0),
      coalesce(
        (select jsonb_agg(jsonb_build_object('choice', t.choice, 'count', t.n) order by t.n desc)
           from (select r2.choice, count(*) as n
                   from public.survey_responses r2
                  where r2.survey_id = s.id
                    and not exists (select 1 from public.profiles pc where pc.id = r2.user_id and pc.research_cohort)
                    and r2.status = 'answered'
                    and r2.choice is not null
                  group by r2.choice) t),
        '[]'::jsonb),
      coalesce(
        (select jsonb_agg(r3.text_answer order by r3.answered_at desc)
           from public.survey_responses r3
          where r3.survey_id = s.id
            and not exists (select 1 from public.profiles pc where pc.id = r3.user_id and pc.research_cohort)
            and r3.status = 'answered'
            and r3.text_answer is not null),
        '[]'::jsonb)
      from public.surveys s
      left join public.survey_responses r on r.survey_id = s.id
        and not exists (select 1 from public.profiles pc where pc.id = r.user_id and pc.research_cohort)
     where s.university = p_university
     group by s.id
     order by s.published_at desc
     limit 25;
end;
$$;
