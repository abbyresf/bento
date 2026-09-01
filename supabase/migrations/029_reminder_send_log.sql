-- One row per meal reminder actually sent, keyed by meal and local date.
--
-- The send endpoint is reachable from two schedulers (Vercel cron for lunch, a
-- GitHub Actions workflow for dinner) and from a manual call. Any of those can
-- fire more than once: GitHub's cron is UTC-only with no daylight-saving
-- awareness, so a workflow carrying one entry per offset runs BOTH every day,
-- and Actions runs can be retried by hand. Nothing upstream can be trusted to
-- fire exactly once.
--
-- So the guard lives here instead. The primary key makes claiming a slot atomic:
-- the endpoint inserts (meal, send_date) BEFORE sending, and a duplicate insert
-- fails with 23505, which the endpoint reads as "already sent, stop". Two
-- schedulers racing at the same instant cannot both win.
--
-- This is deliberately not keyed on user. A partial send that crashes halfway
-- will not re-send to the students who already got it, which is the safer
-- failure: a missed reminder is a minor annoyance, a repeated one is the bug
-- being fixed here.

create table if not exists public.reminder_sends (
  meal        text        not null check (meal in ('lunch', 'dinner')),
  send_date   date        not null,
  sent_at     timestamptz not null default now(),
  recipients  integer     not null default 0,
  primary key (meal, send_date)
);

comment on table public.reminder_sends is
  'Idempotency guard for daily meal reminders. One row per meal per local date.';

alter table public.reminder_sends enable row level security;

-- No policies on purpose. Only the sender touches this, and it runs with the
-- service role, which bypasses RLS. Students have no reason to read it.
