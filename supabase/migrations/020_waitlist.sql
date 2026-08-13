create table if not exists waitlist_submissions (
  id              uuid        primary key default gen_random_uuid(),
  email           text        not null,
  university_name text        not null,
  created_at      timestamptz default now() not null
);

alter table waitlist_submissions enable row level security;

-- Public landing page — anyone (anon) can submit, no one can read via client
create policy "Anyone can submit waitlist"
  on waitlist_submissions for insert
  with check (true);

-- Convenience view for demand analytics (readable by authenticated admins / service role)
create or replace view waitlist_demand as
  select
    university_name,
    count(*)            as submissions,
    min(created_at)     as first_submission,
    max(created_at)     as latest_submission
  from waitlist_submissions
  group by university_name
  order by submissions desc;
