alter table public.profiles
  add column if not exists university text default 'brandeis';
