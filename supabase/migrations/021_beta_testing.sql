-- Bento Beta Testing tables (Aug 26 – Sep 8, 2026)

create table if not exists beta_testers (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  email      text        not null,
  created_at timestamptz default now() not null,
  constraint beta_testers_email_unique unique (email)
);

alter table beta_testers enable row level security;

create policy "anon insert beta tester"
  on beta_testers for insert to anon with check (true);

create policy "anon read beta testers"
  on beta_testers for select to anon using (true);

create table if not exists beta_responses (
  id          uuid        primary key default gen_random_uuid(),
  tester_id   uuid        not null references beta_testers(id) on delete cascade,
  day_number  int         not null check (day_number between 1 and 14),
  answer      text        not null,
  created_at  timestamptz default now() not null,
  constraint  beta_responses_unique unique (tester_id, day_number)
);

alter table beta_responses enable row level security;

create policy "anon insert beta response"
  on beta_responses for insert to anon with check (true);

create policy "anon read beta responses"
  on beta_responses for select to anon using (true);
