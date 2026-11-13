-- "Days in" on the researcher dashboard's Activity sheet counts from the start code.
--
-- Since 064 a student's week starts when they enter the code at the snack pickup
-- station, not when they join. days_enrolled still counted from joining, so someone
-- who joined and never started showed a full week, and a student who left kept
-- counting. It now counts whole days from the start code to now, the end of their
-- week, or the day they left, whichever is first. 0 until they start.
--
-- Same columns in the same order, so research.grid_activity and its grants carry on.
-- Safe to run more than once.

create or replace view research.activity with (security_invoker = true) as
select p.id as participant_id,
       p.participant_code,
       p.grp,
       p.status,
       p.enrolled_at,
       case when p.activated_at is null then 0
            else greatest(0, research.local_date(p.study_id, least(now(), p.window_ends_at, coalesce(p.withdrawn_at, 'infinity'::timestamptz)))
                           - research.local_date(p.study_id, p.activated_at))
       end as days_enrolled,
       (select count(*) from research.prompts x where x.participant_id = p.id)::integer as prompts_claimed,
       (select count(*) from research.prompts x where x.participant_id = p.id and x.status = 'sent')::integer as prompts_delivered,
       (select count(*) from research.prompts x where x.participant_id = p.id and x.status in ('failed', 'no_device'))::integer as prompts_undelivered,
       research.surveys_due(p.id, now()) as surveys_due,
       (select count(*) from research.survey_days d where d.participant_id = p.id)::integer as surveys_answered,
       (select count(*) from research.survey_days d where d.participant_id = p.id and d.late)::integer as surveys_late,
       (select count(*) from research.meals m where m.participant_id = p.id and m.deleted_at is null)::integer as plates_logged,
       (select count(*) from research.meals m where m.participant_id = p.id and m.deleted_at is null and m.consumption_reported_at is not null)::integer as consumption_reports,
       (select count(*) from research.events e where e.participant_id = p.id and e.kind = 'app_open')::integer as app_opens,
       p.push_status
from research.participants p;
