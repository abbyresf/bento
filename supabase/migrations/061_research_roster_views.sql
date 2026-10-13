-- The researchers' list no longer carries a group (059), so the two views that
-- read it stop showing one. 057 as first run still had the column, and a view
-- cannot lose a column in place, so they are dropped and made again.
-- Safe to run more than once.

drop view if exists research.grid_roster;
drop view if exists research.roster_status;

create view research.roster_status with (security_invoker = true) as
select
  r.id             as roster_id,
  r.study_id,
  r.match_key      as email,
  r.full_name,
  r.added_at,
  (r.claimed_by is not null)  as enrolled,
  r.claimed_at,
  p.participant_code,
  p.status         as participant_status
from research.roster r
left join research.participants p on p.roster_id = r.id;

create view research.grid_roster with (security_invoker = true) as
select rs.roster_id::text as row_id, rs.email, rs.full_name, rs.enrolled, rs.participant_code,
       rs.participant_status, rs.added_at, rs.claimed_at
from research.roster_status rs;

revoke all on research.roster_status, research.grid_roster from public, anon, authenticated;
grant select on research.roster_status, research.grid_roster to authenticated;
