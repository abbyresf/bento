-- Bento Athlete: a weekly training plan, and water.
--
--   athlete_profiles.week_loads   the athlete's usual load for each weekday: { "mon": "heavy", "sat": "rest" }. A day set on
--                                 Today (athlete_load_days) wins over it. Missing days are light.
--   athlete_profiles.water_goal_cups   the athlete's daily water goal, in 8 oz cups. Null means the default in
--                                 src/lib/athlete.js.
--   water_logs                    cups of water logged for a date, one row per day.
--
-- water_logs is own-row only, cascades from auth.users and has no Pulse admin policy. Pulse sees aggregates only.
--
-- Run after 068. Safe to run more than once.

alter table public.athlete_profiles add column if not exists week_loads jsonb not null default '{}'::jsonb;
alter table public.athlete_profiles add column if not exists water_goal_cups integer;

do $$ begin
  alter table public.athlete_profiles add constraint athlete_profiles_week_loads_check
    check (jsonb_typeof(week_loads) = 'object');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.athlete_profiles add constraint athlete_profiles_water_goal_check
    check (water_goal_cups is null or water_goal_cups between 4 and 24);
exception when duplicate_object then null; end $$;

create table if not exists public.water_logs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  log_date   date not null,
  cups       integer not null default 0 check (cups between 0 and 40),
  updated_at timestamptz not null default now(),
  primary key (user_id, log_date)
);

alter table public.water_logs enable row level security;

drop policy if exists "own water logs" on public.water_logs;
create policy "own water logs" on public.water_logs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.water_logs from anon;
grant select, insert, update, delete on public.water_logs to authenticated;
