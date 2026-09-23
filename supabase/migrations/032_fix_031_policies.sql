-- Corrects migration 031, which got two things wrong.
--
-- 1. It tried to drop the permissive read policies by guessing their names and
--    missed both. The real names are "menu cache public read" (012) and
--    "Anyone can read dining availability" (011), so RLS stayed wide open and
--    anon could still read both tables after 031 ran.
--
-- 2. Worse, 031 added its own insert and update policies on dining_availability
--    with USING (true) / WITH CHECK (true). Migration 014 had deliberately
--    narrowed those to `date = current_date` so an authenticated user could not
--    back-date or forward-date rows and manipulate streak gap-forgiveness. 031
--    reopened exactly the hole 014 closed. Those policies are removed here and
--    014's remain the only write path.

-- ── menu_cache: close it properly ─────────────────────────────────────────
-- Every read goes through /api/dining and /api/tufts under the service role,
-- which bypasses RLS. No client has ever needed direct access, and the rows are
-- multi-megabyte, so leaving it readable by the public anon key was a free
-- egress drain.
drop policy if exists "menu cache public read" on public.menu_cache;

-- ── dining_availability: authenticated read, 014's writes ─────────────────
drop policy if exists "Anyone can read dining availability" on public.dining_availability;

-- Remove 031's over-permissive writes. 014's today-only policies stay.
drop policy if exists "record dining availability" on public.dining_availability;
drop policy if exists "update dining availability" on public.dining_availability;
drop policy if exists "read dining availability"   on public.dining_availability;

create policy "read dining availability"
  on public.dining_availability for select
  to authenticated
  using (true);

-- Safety net: if 014 was ever rolled back, recreate its writes rather than
-- leaving the table unwritable, which would silently break streak recording.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'dining_availability'
       and cmd = 'INSERT'
  ) then
    create policy "Authenticated users can insert today dining availability"
      on public.dining_availability for insert
      to authenticated
      with check (auth.uid() is not null and date = current_date);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'dining_availability'
       and cmd = 'UPDATE'
  ) then
    create policy "Authenticated users can update today dining availability"
      on public.dining_availability for update
      to authenticated
      using (auth.uid() is not null and date = current_date)
      with check (date = current_date);
  end if;
end $$;
