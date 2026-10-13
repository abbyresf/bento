-- The wide survey sheet.
--
-- The researchers' May study exported one row per submission with one column per
-- question and answers as numeric codes (lunchYN, lunch_loop, lunch_waste, ...).
-- Their analysis expects that shape, so the dashboard gets a sheet in it. This adds
-- the two things it needs:
--
--   column_key  the column's name in that sheet, e.g. lunch_loop
--   codes       the number each answer is written as: for a pick-one question one
--               number per choice in order (default 1, 2, 3 ...), for a yes or no
--               question [yes, no] (default [1, 0]). A rating is its own number.
--
-- Both are labels on a question, not part of what it asks, so they can be changed
-- without replacing the question, and a change re-labels past rows when they are
-- read. A replacement question inherits both from the one it replaces, so a column
-- carries on across a wording change. The sheet itself is built in the browser from
-- grid_survey_wide, which holds each day's raw answers keyed by question id.
--
-- Safe to run more than once.

alter table research.questions add column if not exists column_key text;
alter table research.questions add column if not exists codes jsonb;
alter table research.questions drop constraint if exists questions_column_key;
alter table research.questions add constraint questions_column_key
  check (column_key is null or column_key ~ '^[A-Za-z][A-Za-z0-9_]{0,39}$');
alter table research.questions drop constraint if exists questions_codes;
alter table research.questions add constraint questions_codes
  check (codes is null or (jsonb_typeof(codes) = 'array' and jsonb_array_length(codes) between 2 and 8));

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
      if new.codes is null and v_old.format = new.format
         and jsonb_array_length(coalesce(v_old.options, '[]'::jsonb)) = jsonb_array_length(coalesce(new.options, '[]'::jsonb)) then
        new.codes := v_old.codes;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists questions_inherit_meta on research.questions;
create trigger questions_inherit_meta
  before insert on research.questions
  for each row execute function research.questions_inherit_meta();

-- Checks and sets a question's column name and codes. A null or empty key clears
-- the name (the sheet then falls back to q<position>). Used by both the seed and
-- the dashboard.
create or replace function research.tag_question(p_id uuid, p_key text, p_codes jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q   research.questions%rowtype;
  v_key text := nullif(btrim(coalesce(p_key, '')), '');
  v_n   integer;
begin
  select * into v_q from research.questions q where q.id = p_id;
  if not found then raise exception 'unknown_question'; end if;

  if v_key is not null then
    if v_key !~ '^[A-Za-z][A-Za-z0-9_]{0,39}$' then raise exception 'bad_value: column name'; end if;
    if exists (select 1 from research.questions o
               where o.study_id = v_q.study_id and o.id <> p_id and o.is_active and v_q.is_active
                 and lower(o.column_key) = lower(v_key)) then
      raise exception 'column_name_in_use: %', v_key;
    end if;
  end if;

  if p_codes is not null and p_codes <> 'null'::jsonb then
    if jsonb_typeof(p_codes) <> 'array' then raise exception 'bad_value: codes'; end if;
    v_n := case v_q.format when 'yes_no' then 2 when 'multiple_choice' then jsonb_array_length(v_q.options) end;
    if v_n is null then raise exception 'codes_not_for_this_question'; end if;
    if jsonb_array_length(p_codes) <> v_n then raise exception 'codes_need_one_per_choice: %', v_n; end if;
    if exists (select 1 from jsonb_array_elements(p_codes) c where jsonb_typeof(c) <> 'number' or (c #>> '{}')::numeric <> trunc((c #>> '{}')::numeric)) then
      raise exception 'bad_value: codes must be whole numbers';
    end if;
    if (select count(distinct c) from jsonb_array_elements(p_codes) c) <> v_n then raise exception 'bad_value: codes must differ'; end if;
  end if;

  update research.questions q set column_key = v_key,
    codes = case when p_codes is null or p_codes = 'null'::jsonb then null else p_codes end
  where q.id = p_id;
end;
$$;

revoke all on function research.tag_question(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function research.tag_question(uuid, text, jsonb) to service_role;

-- What the dashboard calls. Audited like every other setup change.
create or replace function public.research_tag_question(p_id uuid, p_key text, p_codes jsonb default null)
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
  perform research.tag_question(p_id, p_key, p_codes);
  perform research.write_audit('setup_change', jsonb_build_object('what', 'question_columns', 'question', p_id,
    'from', jsonb_build_object('key', v_q.column_key, 'codes', v_q.codes),
    'to', jsonb_build_object('key', nullif(btrim(coalesce(p_key, '')), ''), 'codes', p_codes)));
  return true;
end;
$$;

revoke all on function public.research_tag_question(uuid, text, jsonb) from public, anon;
grant execute on function public.research_tag_question(uuid, text, jsonb) to authenticated;

-- One row per participant per day with that day's raw answers, keyed by question id.
-- The browser turns it into columns and codes using the questions.
create or replace view research.grid_survey_wide with (security_invoker = true) as
select d.id::text as row_id, p.participant_code, p.grp, d.for_date, d.late, d.submitted_at,
       coalesce(jsonb_object_agg(r.question_id::text, r.answer) filter (where r.question_id is not null), '{}'::jsonb) as answers
from research.survey_days d
join research.participants p on p.id = d.participant_id
left join research.responses r on r.survey_day_id = d.id
group by d.id, p.participant_code, p.grp, d.for_date, d.late, d.submitted_at;

revoke all on research.grid_survey_wide from public, anon, authenticated;
grant select on research.grid_survey_wide to authenticated;

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
  v_loop   uuid;
  v_time   uuid;
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
  -- The May study's data held 0, 1 and 2 here. Which is which was not confirmed with
  -- the researchers, so this is a guess (1 Usdan, 2 Sherman, 0 No) that the Setup
  -- page lets them correct. Changing codes re-labels past rows when read.
  perform research.tag_question(v_where, 'lunchYN', '[1, 2, 0]'::jsonb);

  -- Group L (LOOP&PLAN) only.
  v_loop := research.add_question(p_study,
    'When having lunch at Usdan/Sherman, did you use the "loop and plan" strategy before getting food? (That is, did you first walk around to see all the food options and plan what you would take for your meal before beginning to get it?)',
    'rating', v_scale, array['L'], 20);
  perform research.tag_question(v_loop, 'lunch_loop');

  -- Group S (PRELOAD) only, and the follow-up only if they ate the snack.
  v_snack := research.add_question(p_study, 'Did you eat the snack given to you before lunch today?',
    'yes_no', '[]'::jsonb, array['S'], 20);
  perform research.tag_question(v_snack, 'lunch_snack');
  v_time := research.add_question(p_study, 'How long before lunch did you eat the snack?',
    'multiple_choice', '["0-20 min before lunch", "21-60 min before lunch", "More than 1 hour before lunch"]'::jsonb,
    array['S'], 21, null, jsonb_build_object('question', v_snack, 'any_of', jsonb_build_array(true)));
  perform research.tag_question(v_time, 'lunch_snack_time');

  -- Everyone.
  perform research.tag_question(research.add_question(p_study,
    'To what extent were your lunch choices today consistent with your eating goals?', 'rating', v_scale, '{}', 30), 'lunch_goals');
  perform research.tag_question(research.add_question(p_study,
    'How much food was left at the end of your meal? Imagine you put all your leftover food on a single plate (think of the most common size plate), estimate about how much of the plate it would cover.',
    'multiple_choice', v_plate, '{}', 40), 'lunch_waste');
  v_n := 6;

  if p_include_dinner then
    v_dwhere := research.add_question(p_study,
      'Did you eat dinner in Usdan or Sherman all-you-care-to-eat (AYCTE) dining hall today?',
      'multiple_choice', '["Yes - in Usdan", "Yes - in Sherman", "No"]'::jsonb, '{}', 50);
    perform research.tag_question(v_dwhere, 'dinnerYN', '[1, 2, 0]'::jsonb);
    perform research.tag_question(research.add_question(p_study,
      'When having dinner at Usdan/Sherman, did you use the "loop and plan" strategy before getting food? (That is, did you first walk around to see all the food options and plan what you would take for your meal before beginning to get it?)',
      'rating', v_scale, array['L'], 60, null, jsonb_build_object('question', v_dwhere, 'none_of', jsonb_build_array('No'))), 'dinner_loop');
    perform research.tag_question(research.add_question(p_study,
      'To what extent were your dinner choices today consistent with your eating goals?',
      'rating', v_scale, '{}', 70, null, jsonb_build_object('question', v_dwhere, 'none_of', jsonb_build_array('No'))), 'dinner_goals');
    perform research.tag_question(research.add_question(p_study,
      'How much food was left at the end of your meal? Imagine you put all your leftover food on a single plate (think of the most common size plate), estimate about how much of the plate it would cover.',
      'multiple_choice', v_plate, '{}', 80, null, jsonb_build_object('question', v_dwhere, 'none_of', jsonb_build_array('No'))), 'dinner_waste');
    v_n := v_n + 4;
  end if;
  return v_n;
end;
$$;

revoke all on function research.seed_daily_survey(uuid, boolean) from public, anon, authenticated;
grant execute on function research.seed_daily_survey(uuid, boolean) to service_role;
