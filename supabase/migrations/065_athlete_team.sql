-- Bento Athlete: the athlete picks their team from their school's list (src/data/athleteTeams.js), and the team sets the
-- sport and, from its schedule, the season. That replaces the sport_group and season_phase columns from 064, which stay in
-- place but are no longer written.
--
-- Run after 064. Safe to run more than once.

alter table public.athlete_profiles add column if not exists team text;

do $$ begin
  alter table public.athlete_profiles add constraint athlete_profiles_team_check
    check (team is null or team ~ '^[a-z0-9-]{1,60}$');
exception when duplicate_object then null; end $$;
