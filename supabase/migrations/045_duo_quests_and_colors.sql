-- Buddy quests, and a color for Bento that buddies can see.
--
-- 1. Two starter buddy quests, worked out from both students' confirmed meals each
--    time (nothing stored but the claim). Claiming the first one unlocks Bento's
--    colors. A claim is owned by the student who made it: it does not point at the
--    buddy with a foreign key, so a buddy deleting their account cannot take the
--    reward away.
-- 2. profiles.mascot_color, the color scheme Bento wears. It is cosmetic. The
--    unlock is checked in the app, and a student who sets one early only changes
--    how their own Bento looks.
-- 3. duo_friends now also returns each buddy's outfit and color, so the Buddies tab
--    and the widget can draw them.
--
-- Run after 044. Safe to run more than once.

-- ── Color ─────────────────────────────────────────────────────────────────────

alter table public.profiles add column if not exists mascot_color text;

alter table public.profiles drop constraint if exists profiles_mascot_color_form;
alter table public.profiles
  add constraint profiles_mascot_color_form
  check (mascot_color is null or mascot_color ~ '^[a-z]{2,16}$');

comment on column public.profiles.mascot_color is
  'Id of the color scheme Bento wears (src/data/mascotColors.js), or null for the classic one.';

-- ── Claims ────────────────────────────────────────────────────────────────────

create table if not exists public.duo_claims (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  friend_id  uuid        references auth.users(id) on delete set null,
  quest_id   text        not null check (quest_id in ('daily_duo', 'week_dinners')),
  week_start date        not null,
  claimed_at timestamptz not null default now()
);

create unique index if not exists duo_claims_once
  on public.duo_claims (user_id, friend_id, quest_id, week_start);
create index if not exists duo_claims_user on public.duo_claims (user_id);

alter table public.duo_claims enable row level security;
revoke all on public.duo_claims from public, anon, authenticated;

-- ── The quests ────────────────────────────────────────────────────────────────

create or replace function public.duo_quest_target(p_quest text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_quest when 'daily_duo' then 4 when 'week_dinners' then 5 else 0 end;
$$;

-- Progress and claim state for one buddy in one Monday to Sunday week.
create or replace function public.duo_quests(p_friend uuid, p_week date)
returns table(quest_id text, progress integer, target integer, claimed boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_days integer;
  v_din  integer;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select w.days_both, w.dinners_both into v_days, v_din from public.duo_week(p_friend, p_week) w;

  return query
  select q.id,
         least(case q.id when 'daily_duo' then v_days else v_din end, public.duo_quest_target(q.id)),
         public.duo_quest_target(q.id),
         exists (select 1 from public.duo_claims c
                 where c.user_id = v_uid and c.friend_id = p_friend
                   and c.quest_id = q.id and c.week_start = p_week)
  from (values ('daily_duo'), ('week_dinners')) as q(id);
end;
$$;

-- Claims a finished quest. The progress is worked out here again, so the app cannot
-- claim something that was not done. The week must start on a Monday, not be in the
-- future, and not be more than five weeks old.
create or replace function public.duo_claim(p_friend uuid, p_quest text, p_week date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_now   date := (now() at time zone 'America/New_York')::date;
  v_this  date := v_now - ((extract(isodow from v_now)::integer) - 1);
  v_row   record;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if p_quest not in ('daily_duo', 'week_dinners') then raise exception 'invalid_quest'; end if;
  if extract(isodow from p_week) <> 1 or p_week > v_this or p_week < v_this - 35 then
    raise exception 'invalid_week';
  end if;

  select * into v_row from public.duo_quests(p_friend, p_week) q where q.quest_id = p_quest;
  if v_row.claimed then return 'already'; end if;
  if v_row.progress < v_row.target then return 'not_met'; end if;

  insert into public.duo_claims (user_id, friend_id, quest_id, week_start)
  values (v_uid, p_friend, p_quest, p_week)
  on conflict do nothing;
  return 'ok';
end;
$$;

-- How many buddy quests this student has claimed, ever. One is enough to unlock
-- Bento's colors.
create or replace function public.duo_perks()
returns table(claims integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  return query select (select count(*)::integer from public.duo_claims c where c.user_id = auth.uid());
end;
$$;

-- ── The buddy list, now with each buddy's Bento ───────────────────────────────

drop function if exists public.duo_friends();

create function public.duo_friends()
returns table(
  friend_id     uuid,
  display_name  text,
  started_at    timestamptz,
  i_share       boolean,
  here_hall     text,
  here_meal     text,
  here_at       timestamptz,
  here_until    timestamptz,
  mascot_outfit text,
  mascot_color  text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  return query
    select p.id,
           p.display_name,
           f.started_at,
           case when f.user_a = v_uid then f.share_a else f.share_b end,
           hp.hall,
           hp.meal,
           hp.created_at,
           hp.expires_at,
           p.mascot_outfit,
           p.mascot_color
    from public.friendships f
    join public.profiles p
      on p.id = case when f.user_a = v_uid then f.user_b else f.user_a end
    left join public.here_pings hp
      on hp.sender = p.id and hp.recipient = v_uid and hp.expires_at > now()
    where f.status = 'active' and v_uid in (f.user_a, f.user_b)
    order by p.display_name;
end;
$$;

-- ── Who may call what ─────────────────────────────────────────────────────────

do $$
declare f text;
begin
  foreach f in array array[
    'duo_friends()', 'duo_quests(uuid, date)', 'duo_claim(uuid, text, date)', 'duo_perks()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
