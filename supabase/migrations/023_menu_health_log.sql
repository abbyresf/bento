-- Menu health log: records results of /api/health checks
-- Written by the Vercel cron and on-demand calls.

create table if not exists menu_health_log (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        not null,
  name        text        not null,
  university  text        not null check (university in ('brandeis', 'tufts')),
  date        date        not null,
  status      text        not null check (status in ('ok', 'closed', 'degraded', 'error')),
  item_count  int         not null default 0,
  has_tabs    boolean,
  error       text,
  checked_at  timestamptz not null default now()
);

-- Index for querying recent checks by location
create index menu_health_log_slug_date on menu_health_log (slug, date, checked_at desc);

-- Service role only — this table is internal monitoring
alter table menu_health_log enable row level security;
create policy "service role only" on menu_health_log using (false);
