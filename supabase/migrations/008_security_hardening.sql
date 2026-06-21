-- Security hardening pass.

-- 1. Lock search_path on security definer functions to prevent schema injection.
create or replace function public.delete_user()
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

-- 2. Basic email format check on university_requests.
alter table public.university_requests
  add constraint if not exists university_requests_email_format
  check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- 3. Spam guard: one submission per email per calendar day.
--    Uses an explicit date column so the expression index is immutable.
alter table public.university_requests
  add column if not exists created_date date default current_date;

create unique index if not exists university_requests_email_day_idx
  on public.university_requests (lower(email), created_date);
