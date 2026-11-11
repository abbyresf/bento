-- 071: the shorter setup (Loud pilot).
--
-- Setup used to count as finished only once a profile had a weight and an age, so a student who skips their details
-- would be sent back to setup on every launch. setup_done says setup is finished on its own.
--
-- goals: what the student picked on "What brings you here?" (any of: goals, safe, friends, sport, good).
-- liked_foods: foods typed on "Foods you like" (for example "chicken"). Bento plans more dishes whose names match.
--
-- The profile row already has row level security (owner only), so these columns need no new policy. Pulse never reads
-- them. The app works before this runs: it keeps the same three values on the device until the columns exist.

alter table public.profiles
  add column if not exists setup_done  boolean not null default false,
  add column if not exists goals       text[]  not null default '{}',
  add column if not exists liked_foods text[]  not null default '{}';

-- Typed foods are short words, not essays.
alter table public.profiles
  drop constraint if exists profiles_liked_foods_size,
  add constraint profiles_liked_foods_size check (cardinality(liked_foods) <= 30);
