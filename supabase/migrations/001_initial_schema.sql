-- Bento initial schema
-- Run this in the Supabase SQL editor after creating your project.

-- ── Profiles ──────────────────────────────────────────────────────────
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  weight          numeric,
  weight_unit     text    default 'lbs',
  height_feet     integer,
  height_inches   integer,
  age             integer,
  sex             text,
  activity_level  text,
  goal            text,
  terms_accepted  boolean default false,
  updated_at      timestamptz default now()
);

-- ── Nutrition targets ─────────────────────────────────────────────────
create table public.nutrition_targets (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.profiles(id) on delete cascade,
  calories  numeric,
  protein   numeric,
  carbs     numeric,
  fat       numeric,
  updated_at timestamptz default now(),
  unique (user_id)
);

-- ── Dietary restrictions ──────────────────────────────────────────────
create table public.dietary_restrictions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  vegetarian          boolean default false,
  vegan               boolean default false,
  gluten_free         boolean default false,
  dairy_free          boolean default false,
  nut_free            boolean default false,
  halal               boolean default false,
  kosher              boolean default false,
  allergies           jsonb   default '[]',
  avoid_ingredients   jsonb   default '[]',
  updated_at          timestamptz default now(),
  unique (user_id)
);

-- ── Meal history ──────────────────────────────────────────────────────
create table public.meal_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  confirmed_at timestamptz default now(),
  items       jsonb not null default '[]'
);

create index meal_history_user_date on public.meal_history (user_id, confirmed_at desc);

-- ── Favorites ─────────────────────────────────────────────────────────
create table public.favorites (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.profiles(id) on delete cascade,
  item_id   text not null,
  name      text,
  station   text,
  nutrition jsonb,
  tags      jsonb,
  created_at timestamptz default now(),
  unique (user_id, item_id)
);

-- ── Streaks ───────────────────────────────────────────────────────────
create table public.streaks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  current_streak      integer default 0,
  longest_streak      integer default 0,
  last_confirmed_date date,
  unique (user_id)
);

-- ── Row-level security ────────────────────────────────────────────────
alter table public.profiles             enable row level security;
alter table public.nutrition_targets    enable row level security;
alter table public.dietary_restrictions enable row level security;
alter table public.meal_history         enable row level security;
alter table public.favorites            enable row level security;
alter table public.streaks              enable row level security;

-- Each user can only read/write their own rows.
create policy "own profile"      on public.profiles             for all using (auth.uid() = id);
create policy "own targets"      on public.nutrition_targets    for all using (auth.uid() = user_id);
create policy "own restrictions" on public.dietary_restrictions for all using (auth.uid() = user_id);
create policy "own history"      on public.meal_history         for all using (auth.uid() = user_id);
create policy "own favorites"    on public.favorites            for all using (auth.uid() = user_id);
create policy "own streaks"      on public.streaks              for all using (auth.uid() = user_id);

-- ── Auto-create profile row on signup ────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
