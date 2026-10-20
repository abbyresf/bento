-- Default reminders now cover dinner as well as lunch: each group gets its reminder
-- 30 minutes before lunch (10:30) and 30 minutes before dinner. Dinner time is
-- data like everything else here: the 16:30 default is a placeholder for the real
-- opening time, and the Setup page changes it at any time.
--
-- Replaces seed_default_reminders from 056. Does nothing if the study already has
-- reminders. For a study that already has the lunch ones, add the dinner ones with
-- research.add_schedule (see RESEARCH_DASHBOARD_SPEC.md, section 8a).
-- Safe to run more than once.

drop function if exists research.seed_default_reminders(uuid);

create or replace function research.seed_default_reminders(p_study uuid, p_dinner time default '16:30')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from research.reminder_schedules s where s.study_id = p_study and s.kind = 'reminder') then
    return 0;
  end if;
  perform research.add_schedule(p_study, 'S', 'reminder', '10:30', 'Snack time',
    'Lunch opens at 11. Eat your snack now.');
  perform research.add_schedule(p_study, 'L', 'reminder', '10:30', 'Loop, plan, then plate',
    'Walk the hall once and see what is offered. Decide what you want. Then fill your plate.');
  perform research.add_schedule(p_study, 'S', 'reminder', p_dinner, 'Snack time',
    'Dinner opens soon. Eat your snack now.');
  perform research.add_schedule(p_study, 'L', 'reminder', p_dinner, 'Loop, plan, then plate',
    'Walk the hall once and see what is offered. Decide what you want. Then fill your plate.');
  return 4;
end;
$$;

revoke all on function research.seed_default_reminders(uuid, time) from public, anon, authenticated;
grant execute on function research.seed_default_reminders(uuid, time) to service_role;
