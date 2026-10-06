-- Let the evening streak nudge claim its slot.
--
-- reminder_sends is the guard that stops a scheduler firing twice from sending
-- twice. Its meal column only allowed 'lunch' and 'dinner', so a third kind of
-- reminder could not claim a slot and would send unguarded. This adds 'streak'.
--
-- Safe to run more than once.

alter table public.reminder_sends drop constraint if exists reminder_sends_meal_check;
alter table public.reminder_sends
  add constraint reminder_sends_meal_check check (meal in ('lunch', 'dinner', 'streak'));
