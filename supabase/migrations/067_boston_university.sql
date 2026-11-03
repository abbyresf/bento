-- Boston University.
--
-- BU Dining agreed to Bento showing its menu (Nov 2026). Menus, ratings and
-- profiles already carry a free-text `university` ('bu'), so the only thing in
-- the database that listed schools was the menu health log's check constraint.
-- This widens it. Everything else keys on the school id and needs no change.
--
-- Independent of 066, so the two can run in either order. Safe to run more than once.

alter table public.menu_health_log drop constraint if exists menu_health_log_university_check;
alter table public.menu_health_log
  add constraint menu_health_log_university_check
  check (university in ('brandeis', 'tufts', 'bu'));
