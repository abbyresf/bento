-- Restore increment_streak.
--
-- The app calls this on every confirmed meal. On 6 Oct 2026 the live API
-- reported it missing (PGRST202, "not found in the schema cache"), while the
-- functions around it answered. With it gone every streak call returns nothing,
-- so streaks never move and no celebration fires. Migration 013 defined it, but
-- the migration workflow had been failing on authentication for weeks, so
-- whatever it should have applied did not.
--
-- Safe to run more than once. It removes any version of the function under this
-- name first, so a half-matching old signature cannot shadow the new one, then
-- recreates it exactly as 013 defined it, and gives signed-in users, and only
-- them, permission to call it.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'increment_streak'
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

create or replace function public.increment_streak(p_user_id uuid, p_date date)
returns table(current_streak integer, longest_streak integer, prev_longest integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current integer := 0;
  v_longest integer := 0;
  v_last    date;
  v_days    integer;
  v_new     integer;
  v_missed  integer;
  v_day     date;
  v_avail   boolean;
begin
  -- Nobody can move anyone else's streak.
  if p_user_id is distinct from auth.uid() then
    raise exception 'unauthorized';
  end if;

  select s.current_streak, s.longest_streak, s.last_confirmed_date
  into v_current, v_longest, v_last
  from public.streaks s
  where s.user_id = p_user_id;

  -- No-op: this date is already counted, or is before the last one counted.
  if v_last = p_date or (v_last is not null and p_date < v_last) then
    return;
  end if;

  v_new := 1;

  if v_last is not null then
    v_days := p_date - v_last;

    if v_days = 1 then
      v_new := coalesce(v_current, 0) + 1;
    elsif v_days >= 2 then
      -- Count the gap days where dining was open, or has no record (assumed open).
      v_missed := 0;
      v_day := v_last + 1;
      while v_day < p_date loop
        select da.any_open into v_avail
        from public.dining_availability da
        where da.date = v_day;

        if not found or v_avail is distinct from false then
          v_missed := v_missed + 1;
        end if;
        v_day := v_day + 1;
      end loop;

      -- One missed dining day is forgiven. Two or more reset the streak.
      v_new := case when v_missed <= 1 then coalesce(v_current, 0) + 1 else 1 end;
    end if;
  end if;

  insert into public.streaks (user_id, current_streak, longest_streak, last_confirmed_date)
  values (p_user_id, v_new, greatest(v_new, coalesce(v_longest, 0)), p_date)
  on conflict (user_id) do update
    set current_streak      = v_new,
        longest_streak      = greatest(v_new, public.streaks.longest_streak),
        last_confirmed_date = p_date;

  return query
    select v_new::integer,
           greatest(v_new, coalesce(v_longest, 0))::integer,
           coalesce(v_longest, 0)::integer;
end;
$$;

revoke all on function public.increment_streak(uuid, date) from public, anon;
grant execute on function public.increment_streak(uuid, date) to authenticated;

-- Make the API pick the function up straight away.
notify pgrst, 'reload schema';
