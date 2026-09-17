-- In-app feedback.
--
-- Deliberately not EmailJS. The landing page uses it, but for feedback arriving
-- from inside the app it is the wrong tool: the free tier caps at 200 messages a
-- month, the public key ships in the client bundle where anyone can scrape it
-- and burn that quota, and nothing is stored. If an email is missed the report
-- is gone. It also failed silently for ten weeks because a CSP change blocked
-- the endpoint, which is exactly the kind of outage a table cannot have.
--
-- Stored here instead: durable, queryable, and visible to Pulse alongside the
-- community suggestions already collected.

create table if not exists public.feedback (
  id          uuid        primary key default gen_random_uuid(),
  -- Kept if the account is deleted, so a bug report does not disappear with the
  -- reporter. Nulled rather than cascaded for the same reason.
  user_id     uuid        references auth.users(id) on delete set null,
  topic       text        not null,
  message     text        not null check (char_length(message) between 1 and 4000),
  -- Optional. Someone reporting a bug may not want a reply.
  reply_email text        check (reply_email is null or char_length(reply_email) <= 320),
  university  text,
  -- Which build the student was on. The single most useful debugging field:
  -- a surprising number of reports turn out to be a stale cached bundle.
  app_context jsonb,
  created_at  timestamptz not null default now(),
  handled     boolean     not null default false
);

create index if not exists feedback_created on public.feedback (created_at desc);
create index if not exists feedback_unhandled on public.feedback (handled) where handled = false;

alter table public.feedback enable row level security;

-- A student may file feedback as themselves and read back only their own.
-- Nobody can read anyone else's, and nobody can edit or delete once sent.
drop policy if exists "insert own feedback" on public.feedback;
create policy "insert own feedback"
  on public.feedback for insert
  with check (auth.uid() = user_id);

drop policy if exists "read own feedback" on public.feedback;
create policy "read own feedback"
  on public.feedback for select
  using (auth.uid() = user_id);

comment on table public.feedback is
  'In-app feedback from students. Read with the service role for Pulse.';
