create table if not exists public.university_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  university  text not null,
  email       text not null,
  name        text,
  referral    text,
  notify      boolean default false,
  created_at  timestamptz default now()
);

alter table public.university_requests enable row level security;

create policy "anyone can submit university requests"
  on public.university_requests for insert
  to anon, authenticated
  with check (true);
