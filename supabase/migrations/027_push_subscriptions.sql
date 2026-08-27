-- Web push subscriptions.
--
-- One row per DEVICE, not per student: a browser mints a separate subscription
-- for every device and browser, so one person with a phone and a laptop has two
-- rows. The push endpoint is the natural key — it is unique per subscription
-- and is what the push service is addressed by.
--
-- On iOS a subscription only exists at all when the app has been installed to
-- the home screen; Safari tabs cannot subscribe. That is why install tracking
-- (migration 026) had to come first.

create table if not exists public.push_subscriptions (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  endpoint    text        not null unique,
  p256dh      text        not null,
  auth        text        not null,
  platform    text,
  university  text,
  created_at  timestamptz not null default now(),
  last_sent_at timestamptz,
  -- Push services return 404/410 for a subscription that no longer exists
  -- (app deleted, permission revoked). Those are pruned rather than retried
  -- forever, so a dead endpoint cannot slow every future send.
  failure_count int not null default 0
);

create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
create index if not exists push_subscriptions_university on public.push_subscriptions (university);

alter table public.push_subscriptions enable row level security;

-- A student manages only their own subscriptions. The sender runs with the
-- service role and bypasses this.
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Whether a student wants the daily nudge at all. Separate from the browser
-- permission: revoking here must stop sends even while the browser permission
-- is still granted, and it is the switch Settings writes to.
alter table public.profiles
  add column if not exists push_enabled boolean not null default false,
  add column if not exists push_opted_out_at timestamptz;

comment on column public.profiles.push_enabled is
  'Student-facing switch for the daily meal reminder. Independent of the browser permission.';
