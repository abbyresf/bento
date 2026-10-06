-- Native push tokens.
--
-- push_subscriptions was built for web push, where every row has an endpoint
-- and two keys. The iOS app has none of those: it has an APNs device token,
-- and the server sends to that token directly.
--
-- Same table, so one reminder run reaches both kinds of device and the
-- existing per-student switch (profiles.push_enabled) and pruning keep working.
-- endpoint stays NOT NULL and unique. Native rows store 'apns:<token>' there,
-- which cannot collide with a real web push endpoint (those are https URLs).

alter table public.push_subscriptions
  add column if not exists apns_token text,
  alter column p256dh drop not null,
  alter column auth drop not null;

-- A row is one or the other: a web subscription with both keys, or a token.
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_target_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_target_check
  check (apns_token is not null or (p256dh is not null and auth is not null));

comment on column public.push_subscriptions.apns_token is
  'APNs device token for the native iOS app. Null for web push rows.';
