-- Daily duo: two days instead of four.
--
-- Four days in a week needed both students to confirm a meal on the same four days, which is a
-- lot to ask for the first buddy quest, and that first claim is what unlocks Bento's colors.
-- Two days is reachable in the first week. Week of dinners stays at five nights.
--
-- Claims already made are not touched. A week where both of you reached two days but not four
-- can now be claimed, up to five weeks back (duo_claim's limit).
--
-- Run after 046. Safe to run more than once.

create or replace function public.duo_quest_target(p_quest text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_quest when 'daily_duo' then 2 when 'week_dinners' then 5 else 0 end;
$$;

notify pgrst, 'reload schema';
