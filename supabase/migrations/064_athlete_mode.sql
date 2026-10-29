-- Bento Athlete, phase 1 (ATHLETE_SPEC.md). Self-serve only: no teams, no coaches, nothing Pulse can read.
--
--   athlete_profiles    one row per student who has opened Athlete mode: whether it is on, sport group, season phase, and
--                       any target the athlete moved (null means the middle of the published range). Kept apart from
--                       profiles so Bento Coach can build on it later. Turning the mode off keeps the row.
--   athlete_load_days   the training load the athlete set for a date: rest, light, heavy or double (two-a-day).
--   snacks              a snack the athlete added between meals: one per gap in the day, holding any number of items.
--                       Kept out of meal_history on purpose. Pulse counts meal_history rows and the research study copies
--                       them, so a snack written there would change both.
--
-- Every table is own-row only and cascades from auth.users, so delete_user() removes everything. No Pulse admin policy, and
-- none should be added: Pulse sees aggregates only.
--
-- Run after 063. Safe to run more than once.

create table if not exists public.athlete_profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  athlete_mode     boolean not null default false,
  sport_group      text check (sport_group in ('endurance', 'strength', 'team', 'skill')),
  season_phase     text check (season_phase in ('off', 'pre', 'in', 'post')),
  -- g of carbohydrate per kg per day, by load: { "rest": 4, "heavy": 8 }. Missing keys use the default.
  carbs_g_per_kg   jsonb not null default '{}'::jsonb check (jsonb_typeof(carbs_g_per_kg) = 'object'),
  protein_g_per_kg numeric check (protein_g_per_kg between 1.2 and 2.0),
  fat_share        numeric check (fat_share between 0.2 and 0.35),
  updated_at       timestamptz not null default now()
);

create table if not exists public.athlete_load_days (
  user_id    uuid not null references auth.users(id) on delete cascade,
  load_date  date not null,
  load       text not null check (load in ('rest', 'light', 'heavy', 'double')),
  updated_at timestamptz not null default now(),
  primary key (user_id, load_date)
);

create table if not exists public.snacks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  snack_date  date not null,
  slot        text not null check (slot in ('morning', 'afternoon', 'evening')),
  dining_hall text,
  items       jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  calories    numeric not null default 0 check (calories >= 0),
  protein     numeric not null default 0 check (protein >= 0),
  carbs       numeric not null default 0 check (carbs >= 0),
  fat         numeric not null default 0 check (fat >= 0),
  updated_at  timestamptz not null default now(),
  unique (user_id, snack_date, slot)
);

alter table public.athlete_profiles  enable row level security;
alter table public.athlete_load_days enable row level security;
alter table public.snacks            enable row level security;

drop policy if exists "own athlete profile" on public.athlete_profiles;
create policy "own athlete profile" on public.athlete_profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own load days" on public.athlete_load_days;
create policy "own load days" on public.athlete_load_days for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own snacks" on public.snacks;
create policy "own snacks" on public.snacks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.athlete_profiles, public.athlete_load_days, public.snacks from anon;
grant select, insert, update, delete on public.athlete_profiles, public.athlete_load_days, public.snacks to authenticated;
