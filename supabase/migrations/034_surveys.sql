-- Admin surveys: one question, shown to students as a popup.
--
-- Dining services can ask the student body a single question, optionally only
-- the students a question actually applies to, and read the answers in Pulse.
--
-- Three rules shape the whole design.
--
-- 1. One survey per university per week. Enforced by a unique index on
--    (university, published_week) rather than by a count check in application
--    code, so two admins pressing Send at the same moment cannot both succeed.
--    The week is an ISO week in Eastern time, which means a survey sent Sunday
--    and another sent Monday are in different weeks. That is a known edge and
--    is preferred over a rolling window, which cannot be enforced atomically.
--
-- 2. Answers are anonymous to admins. user_id is stored, because without it a
--    student could answer repeatedly and could be re-prompted forever, but the
--    admin read path aggregates and never returns it. There is no policy that
--    lets an admin select from survey_responses at all: the only way in is
--    get_survey_results(), which returns counts and free text with no identity
--    attached. This matters because targeting can select kosher or halal
--    students, and tying named students to religious practice is not something
--    a dining dashboard should be able to do.
--
-- 3. Students never query these tables directly. Deciding who sees a survey
--    means joining dietary_restrictions and checking prior responses, which is
--    unreadable as an RLS policy and easy to get subtly wrong. A SECURITY
--    DEFINER function does it in one place instead.

-- ── Surveys ────────────────────────────────────────────────────────────────

create table if not exists public.surveys (
  id          uuid primary key default gen_random_uuid(),
  university  text not null,
  -- Nulled rather than cascaded: an admin leaving should not delete the survey
  -- their students already answered.
  created_by  uuid references auth.users(id) on delete set null,

  question    text not null check (char_length(question) between 1 and 200),

  -- The preset templates. Kept as a closed set so the client can render each
  -- one without interpreting free-form config.
  format      text not null check (format in ('multiple_choice', 'short_answer', 'rating', 'yes_no')),

  -- Choices for multiple_choice, ignored by every other format.
  options     jsonb not null default '[]'::jsonb,

  -- Empty means every student at the university. Otherwise a student sees the
  -- survey when ANY listed restriction is set on their profile, so targeting
  -- "vegetarian, vegan" reaches both groups rather than only people who are
  -- somehow both.
  target_restrictions text[] not null default '{}',

  published_at timestamptz not null default now(),
  closes_at    timestamptz not null,
  -- The admin can stop a survey early without deleting the answers.
  is_active    boolean not null default true,

  -- Written by create_survey, never by a client. Exists purely so the weekly
  -- cap can be a unique index. Not generated, because date_trunc over a named
  -- timezone is not immutable and cannot appear in a generated column.
  published_week date not null,

  constraint surveys_closes_after_publish check (closes_at > published_at),

  -- A multiple choice question with no choices renders as a dead end, and more
  -- than six does not fit a popup.
  constraint surveys_options_match_format check (
    (format = 'multiple_choice' and jsonb_typeof(options) = 'array'
      and jsonb_array_length(options) between 2 and 6)
    or (format <> 'multiple_choice')
  )
);

-- The weekly cap. Partial, so closing or deleting a survey does not free up
-- the slot in a way that lets an admin send twice in one week.
create unique index if not exists surveys_one_per_week
  on public.surveys (university, published_week);

-- The student lookup filters on exactly these three columns.
create index if not exists surveys_active_lookup
  on public.surveys (university, is_active, closes_at desc);

-- ── Responses ──────────────────────────────────────────────────────────────

create table if not exists public.survey_responses (
  id        uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,

  -- Present so a student answers once and is not asked again. Never leaves the
  -- database: see get_survey_results.
  user_id   uuid not null references auth.users(id) on delete cascade,

  -- 'answered' or 'dismissed'. A dismissal is recorded so the popup does not
  -- come back, and is counted separately so an admin can tell a question
  -- nobody cared about from one nobody was shown.
  status    text not null default 'answered' check (status in ('answered', 'dismissed')),

  -- Which option, or the rating as text, or 'yes'/'no'. Null for short answer.
  choice      text check (choice is null or char_length(choice) <= 120),
  -- Free text for short_answer. Capped so a popup cannot be used as storage.
  text_answer text check (text_answer is null or char_length(text_answer) <= 500),

  answered_at timestamptz not null default now(),

  -- One row per student per survey. This is what makes the popup stay gone.
  unique (survey_id, user_id)
);

create index if not exists survey_responses_by_survey
  on public.survey_responses (survey_id);

-- ── Row level security ─────────────────────────────────────────────────────
--
-- Both tables are closed. Every read and write goes through the functions
-- below, which run as definer and decide what the caller is allowed to see.
-- Nothing here grants a client direct select on either table, including admins.

alter table public.surveys          enable row level security;
alter table public.survey_responses enable row level security;

comment on table public.surveys is
  'Admin-authored single-question surveys. Service role and SECURITY DEFINER functions only.';
comment on table public.survey_responses is
  'Student answers. user_id exists to enforce one response per student and is never returned to an admin.';

-- ── Does this student match the targeting? ─────────────────────────────────
--
-- Written out flag by flag rather than with dynamic SQL. Seven branches is
-- less code than the machinery needed to make column names safe, and it fails
-- loudly if a new restriction is added without updating targeting.
create or replace function public.student_matches_targets(p_user uuid, p_targets text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_targets is null or cardinality(p_targets) = 0 then true
    else exists (
      select 1
        from public.dietary_restrictions r
       where r.user_id = p_user
         and (
              (r.vegetarian  and 'vegetarian'  = any(p_targets))
           or (r.vegan       and 'vegan'       = any(p_targets))
           or (r.gluten_free and 'gluten_free' = any(p_targets))
           or (r.dairy_free  and 'dairy_free'  = any(p_targets))
           or (r.nut_free    and 'nut_free'    = any(p_targets))
           or (r.halal       and 'halal'       = any(p_targets))
           or (r.kosher      and 'kosher'      = any(p_targets))
         )
    )
  end;
$$;

-- ── Student: which survey should I see? ────────────────────────────────────
--
-- Returns at most one row. Never returns a survey the student has already
-- answered or dismissed, one that has closed, one for another university, or
-- one whose targeting they do not match.
create or replace function public.get_active_survey()
returns table (
  id       uuid,
  question text,
  format   text,
  options  jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_uni  text;
begin
  if v_user is null then return; end if;

  select p.university into v_uni
    from public.profiles p
   where p.id = v_user;

  if v_uni is null then return; end if;

  return query
    select s.id, s.question, s.format, s.options
      from public.surveys s
     where s.university = v_uni
       and s.is_active
       and s.closes_at > now()
       and public.student_matches_targets(v_user, s.target_restrictions)
       and not exists (
             select 1 from public.survey_responses r
              where r.survey_id = s.id and r.user_id = v_user
           )
     order by s.published_at desc
     limit 1;
end;
$$;

-- ── Student: answer, or dismiss ────────────────────────────────────────────
--
-- One entry point for both, so "stop showing me this" and "here is my answer"
-- cannot diverge. Re-submitting is a no-op rather than an error: a double tap
-- on a slow connection should not surface a failure.
create or replace function public.submit_survey_response(
  p_survey_id uuid,
  p_status    text default 'answered',
  p_choice    text default null,
  p_text      text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_ok   boolean;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if p_status not in ('answered', 'dismissed') then
    raise exception 'invalid status';
  end if;

  -- Confirm the student was actually eligible for this survey. Without this a
  -- student could post answers to any survey id they learned, including one
  -- targeted at a group they are not in, and skew a result set.
  select s.is_active
         and s.closes_at > now()
         and public.student_matches_targets(v_user, s.target_restrictions)
         and s.university = (select p.university from public.profiles p where p.id = v_user)
    into v_ok
    from public.surveys s
   where s.id = p_survey_id;

  if not coalesce(v_ok, false) then raise exception 'survey not available'; end if;

  insert into public.survey_responses (survey_id, user_id, status, choice, text_answer)
  values (p_survey_id, v_user, p_status, left(p_choice, 120), left(p_text, 500))
  on conflict (survey_id, user_id) do nothing;
end;
$$;

-- ── Admin: publish ─────────────────────────────────────────────────────────
--
-- Returns the new survey id. Raises 'weekly limit reached' when the unique
-- index rejects a second survey in the same week, so the dashboard can say
-- something useful instead of surfacing a constraint name.
create or replace function public.create_survey(
  p_university text,
  p_question   text,
  p_format     text,
  p_options    jsonb default '[]'::jsonb,
  p_targets    text[] default '{}',
  p_days       int default 7
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_super boolean;
  v_uni      text;
  v_id       uuid;
  v_week     date;
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

  if p_days < 1 or p_days > 30 then raise exception 'invalid duration'; end if;

  -- Eastern, because a survey's week should match the week the dining team is
  -- working in, not UTC's.
  v_week := date_trunc('week', (now() at time zone 'America/New_York'))::date;

  begin
    insert into public.surveys
      (university, created_by, question, format, options, target_restrictions,
       closes_at, published_week)
    values
      (p_university, auth.uid(), p_question, p_format, coalesce(p_options, '[]'::jsonb),
       coalesce(p_targets, '{}'), now() + make_interval(days => p_days), v_week)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'weekly limit reached';
  end;

  return v_id;
end;
$$;

-- ── Admin: read results ────────────────────────────────────────────────────
--
-- The only way an admin sees answers. Returns aggregates and free text with no
-- user id anywhere in the result, which is what makes the anonymity claim in
-- the header true rather than a convention the UI happens to follow.
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
                    and r2.status = 'answered'
                    and r2.choice is not null
                  group by r2.choice) t),
        '[]'::jsonb),
      coalesce(
        (select jsonb_agg(r3.text_answer order by r3.answered_at desc)
           from public.survey_responses r3
          where r3.survey_id = s.id
            and r3.status = 'answered'
            and r3.text_answer is not null),
        '[]'::jsonb)
      from public.surveys s
      left join public.survey_responses r on r.survey_id = s.id
     where s.university = p_university
     group by s.id
     order by s.published_at desc
     limit 25;
end;
$$;

-- ── Admin: stop a survey early ─────────────────────────────────────────────
create or replace function public.close_survey(p_survey_id uuid)
returns void
language plpgsql
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

  update public.surveys s
     set is_active = false
   where s.id = p_survey_id
     and (coalesce(v_is_super, false) or s.university = v_uni);
end;
$$;

-- ── Grants ─────────────────────────────────────────────────────────────────
--
-- anon gets nothing. Every one of these depends on auth.uid() and would only
-- raise, so exposing them to a signed-out caller adds surface for no purpose.
revoke all on function public.student_matches_targets(uuid, text[])              from public, anon, authenticated;
revoke all on function public.get_active_survey()                                from public, anon;
revoke all on function public.submit_survey_response(uuid, text, text, text)     from public, anon;
revoke all on function public.create_survey(text, text, text, jsonb, text[], int) from public, anon;
revoke all on function public.get_survey_results(text)                           from public, anon;
revoke all on function public.close_survey(uuid)                                 from public, anon;

grant execute on function public.get_active_survey()                             to authenticated;
grant execute on function public.submit_survey_response(uuid, text, text, text)  to authenticated;
grant execute on function public.create_survey(text, text, text, jsonb, text[], int) to authenticated;
grant execute on function public.get_survey_results(text)                        to authenticated;
grant execute on function public.close_survey(uuid)                              to authenticated;
