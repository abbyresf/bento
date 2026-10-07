-- Weekly quest claims.
--
-- Quest progress is not stored: it is worked out from meal_history and
-- item_ratings (see src/data/quests.js). A row here only records that a student
-- tapped Claim on a finished quest, once per quest per week. The closet unlocks
-- pieces from how many rows a student has.
--
-- Safe to run more than once.

create table if not exists public.quest_claims (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  quest_id   text        not null,
  week_start date        not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, quest_id, week_start)
);

alter table public.quest_claims enable row level security;

drop policy if exists "own quest claims read" on public.quest_claims;
create policy "own quest claims read" on public.quest_claims
  for select using (auth.uid() = user_id);

drop policy if exists "own quest claims insert" on public.quest_claims;
create policy "own quest claims insert" on public.quest_claims
  for insert with check (auth.uid() = user_id);
