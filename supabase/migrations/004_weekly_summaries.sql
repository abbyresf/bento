-- Weekly insights summaries
-- Safe to re-run: uses IF NOT EXISTS / DO-block policy guards throughout.

-- ── Table ─────────────────────────────────────────────────────────────
create table if not exists public.weekly_summaries (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  week_start    date        not null,          -- Monday of the summarised week (UTC)
  avg_calories  numeric,
  avg_protein   numeric,
  avg_carbs     numeric,
  avg_fat       numeric,
  top_foods     jsonb       default '[]',      -- [{name, count}, …] top-5 by frequency
  best_day      text,                          -- day-of-week name with highest calorie intake
  streak_at_end integer     default 0,         -- user's current_streak as of Sunday
  created_at    timestamptz default now(),
  unique (user_id, week_start)
);

create index if not exists weekly_summaries_user_week
  on public.weekly_summaries (user_id, week_start desc);

-- ── RLS ───────────────────────────────────────────────────────────────
alter table public.weekly_summaries enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'own summaries' and tablename = 'weekly_summaries'
  ) then
    create policy "own summaries"
      on public.weekly_summaries
      for all
      using (auth.uid() = user_id);
  end if;
end $$;

-- ── Schedule via pg_cron (every Monday at 00:05 UTC) ─────────────────────────
-- Requires pg_cron and pg_net extensions to be enabled in Supabase dashboard.
select cron.schedule(
  'generate-weekly-insights',
  '5 0 * * 1',
  $$
  select net.http_post(
    url     := 'https://jeexzjphglnpugsuznad.supabase.co/functions/v1/generate-weekly-insights',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZXh6anBoZ2xucHVnc3V6bmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjk2MzYsImV4cCI6MjA5MjgwNTYzNn0.sby08YMsgEHwsDcas2scw734pIrKr8PDf5kV-rMY260'
    ),
    body    := '{}'::jsonb
  )
  $$
) on conflict (jobname) do nothing;
