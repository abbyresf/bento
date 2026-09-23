-- Two gaps found while working out why the database went unhealthy.
--
-- 1. menu_cache had no retention policy. Nothing ever deleted a row, so it
--    reached 312 MB of dining-hall HTML against a 500 MB free-tier cap, growing
--    11.5 MB a day, roughly 16 days from filling the disk. A full disk is a
--    very good way to make Postgres unhealthy. The API now prunes on every
--    cache miss; this adds the index that prune needs and a function that can
--    be called on a schedule as a backstop.
--
-- 2. menu_cache and dining_availability were readable by anyone holding the
--    anon key, which ships in the client bundle and is therefore public.
--    Nothing sensitive is in either table, but menu_cache rows are multi-MB, so
--    an anonymous visitor could pull megabytes per request straight out of the
--    database and burn the free tier's egress allowance. Both are now writable
--    and readable only by the service role, which is all the app ever needed:
--    every read goes through /api/dining and /api/tufts.

-- Prune wants (university, date), not just the primary key.
create index if not exists menu_cache_university_date
  on public.menu_cache (university, date);

-- Backstop for the API-side prune. Safe to call from a cron or by hand.
create or replace function public.prune_menu_cache(keep_days integer default 2)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.menu_cache
   where date < (current_date - keep_days);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_menu_cache(integer) from public, anon, authenticated;

-- ── Lock menu_cache; tighten dining_availability without breaking it ──────
--
-- menu_cache can be closed completely: the client never reads it directly,
-- every menu request goes through /api/dining or /api/tufts, and those run with
-- the service role, which bypasses RLS.
alter table public.menu_cache enable row level security;

drop policy if exists "public read menu_cache" on public.menu_cache;
drop policy if exists "menu_cache read" on public.menu_cache;

comment on table public.menu_cache is
  'Scraped menu HTML. Service role only. Pruned to 2 days by the API and by prune_menu_cache().';

-- dining_availability is different: the app writes it from the browser when a
-- menu loads (recordDiningAvailability), and the streak RPC reads it to decide
-- whether a gap was a closed dining hall or a missed day. Closing it outright
-- would silently break streaks. So it gets policies rather than a lock: signed
-- in students may read and record, anonymous visitors may not.
alter table public.dining_availability enable row level security;

drop policy if exists "read dining availability" on public.dining_availability;
create policy "read dining availability"
  on public.dining_availability for select
  to authenticated
  using (true);

drop policy if exists "record dining availability" on public.dining_availability;
create policy "record dining availability"
  on public.dining_availability for insert
  to authenticated
  with check (true);

-- The client upserts, so the update half of that has to exist too.
drop policy if exists "update dining availability" on public.dining_availability;
create policy "update dining availability"
  on public.dining_availability for update
  to authenticated
  using (true)
  with check (true);

comment on table public.dining_availability is
  'Whether any hall was open on a date. Written by the app, read by increment_streak.';
