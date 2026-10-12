-- Rainbow plate: pick a color with a buddy, then both eat something that color.
--
-- Bento has no color data for dishes, so this runs on the honor system, as the spec says
-- (SOCIAL_SPEC.md, rule 6). What the database does check:
--   * the color is one of five, and the two of you are buddies,
--   * a pair has one open Rainbow plate at a time, and it lasts two days,
--   * a student can tap "I did it" only after confirming a meal inside that window,
--   * the quest needs both taps, and each student can tap once.
-- Nothing about what anyone ate is stored or shown.
--
-- Run after 050. Safe to run more than once.

alter table public.duo_plate_picks drop constraint if exists duo_plate_picks_quest_id_check;
alter table public.duo_plate_picks
  add constraint duo_plate_picks_quest_id_check check (quest_id in ('mystery_plate', 'rainbow_plate'));

alter table public.duo_claims drop constraint if exists duo_claims_quest_id_check;
alter table public.duo_claims
  add constraint duo_claims_quest_id_check
  check (quest_id in ('daily_duo', 'week_dinners', 'review_duo', 'taste_test', 'match_plate', 'mystery_plate', 'rainbow_plate'));

create table if not exists public.duo_plate_acks (
  pick_id  uuid        not null references public.duo_plate_picks(id) on delete cascade,
  user_id  uuid        not null references auth.users(id) on delete cascade,
  acked_at timestamptz not null default now(),
  primary key (pick_id, user_id)
);
alter table public.duo_plate_acks enable row level security;
revoke all on public.duo_plate_acks from public, anon, authenticated;

create or replace function public.duo_quest_target(p_quest text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_quest
    when 'daily_duo' then 2
    when 'week_dinners' then 5
    when 'review_duo' then 3
    when 'taste_test' then 1
    when 'match_plate' then 1
    when 'mystery_plate' then 2
    when 'rainbow_plate' then 2
    else 0 end;
$$;

-- ── Picking a color ───────────────────────────────────────────────────────────

create or replace function public.duo_rainbow_pick(p_friend uuid, p_color text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_now  date := (now() at time zone 'America/New_York')::date;
  v_week date := v_now - ((extract(isodow from v_now)::integer) - 1);
  v_a    uuid;
  v_b    uuid;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  v_a := least(v_uid, p_friend); v_b := greatest(v_uid, p_friend);
  if not exists (select 1 from public.friendships f where f.status = 'active' and f.user_a = v_a and f.user_b = v_b) then
    return 'not_friends';
  end if;
  if p_color is null or p_color not in ('red', 'orange', 'yellow', 'green', 'purple') then
    return 'invalid';
  end if;
  if exists (
    select 1 from public.duo_plate_picks p
    where p.user_a = v_a and p.user_b = v_b and p.quest_id = 'rainbow_plate' and p.expires_at > now()
  ) then
    return 'exists';
  end if;
  insert into public.duo_plate_picks (user_a, user_b, quest_id, picked_by, item_id, item_name, hall, week_start)
  values (v_a, v_b, 'rainbow_plate', v_uid, p_color, initcap(p_color), null, v_week);
  return 'ok';
end;
$$;

-- ── "I did it" ────────────────────────────────────────────────────────────────

create or replace function public.duo_plate_ack(p_friend uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_pick record;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select p.* into v_pick from public.duo_plate_picks p
   where p.user_a = least(v_uid, p_friend) and p.user_b = greatest(v_uid, p_friend)
     and p.quest_id = 'rainbow_plate' and p.expires_at > now()
   order by p.created_at desc limit 1;
  if v_pick.id is null then return 'no_pick'; end if;
  if exists (select 1 from public.duo_plate_acks a where a.pick_id = v_pick.id and a.user_id = v_uid) then
    return 'already';
  end if;
  -- Honor system for the color, but a student must have confirmed a meal while the pick is open.
  if not exists (
    select 1 from public.meal_history m
    where m.user_id = v_uid
      and m.meal_date between (v_pick.created_at at time zone 'America/New_York')::date
                          and (v_pick.expires_at at time zone 'America/New_York')::date
  ) then
    return 'no_meal';
  end if;
  insert into public.duo_plate_acks (pick_id, user_id) values (v_pick.id, v_uid) on conflict do nothing;
  return 'ok';
end;
$$;

-- ── The quests, now with Rainbow plate and whether you have tapped ────────────

drop function if exists public.duo_quests(uuid, date);

create function public.duo_quests(p_friend uuid, p_week date)
returns table(quest_id text, progress integer, target integer, claimed boolean, detail text, acked boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_days    integer;
  v_din     integer;
  v_each    integer;
  v_same    integer;
  v_match   integer;
  v_pick    record;
  v_rb      record;
  v_mine    boolean;
  v_theirs  boolean;
  v_mystery integer := 0;
  v_rainbow integer := 0;
  v_myack   boolean := false;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select w.days_both, w.dinners_both into v_days, v_din from public.duo_week(p_friend, p_week) w;
  select r.each_min, r.shared into v_each, v_same from public.duo_rating_week(p_friend, p_week) r;
  v_match := public.duo_match_week(p_friend, p_week);

  select p.* into v_pick from public.duo_plate_picks p
   where p.user_a = least(v_uid, p_friend) and p.user_b = greatest(v_uid, p_friend)
     and p.quest_id = 'mystery_plate' and p.week_start = p_week
   order by p.created_at desc limit 1;
  if v_pick.id is not null then
    select exists (select 1 from public.meal_history m
                    where m.user_id = v_uid and m.meal_date between (v_pick.created_at at time zone 'America/New_York')::date
                          and (v_pick.expires_at at time zone 'America/New_York')::date
                      and case when jsonb_typeof(m.items) = 'array' then m.items else '[]'::jsonb end @> jsonb_build_array(jsonb_build_object('id', v_pick.item_id)))
      into v_mine;
    select exists (select 1 from public.meal_history m
                    where m.user_id = p_friend and m.meal_date between (v_pick.created_at at time zone 'America/New_York')::date
                          and (v_pick.expires_at at time zone 'America/New_York')::date
                      and case when jsonb_typeof(m.items) = 'array' then m.items else '[]'::jsonb end @> jsonb_build_array(jsonb_build_object('id', v_pick.item_id)))
      into v_theirs;
    v_mystery := (case when v_mine then 1 else 0 end) + (case when v_theirs then 1 else 0 end);
  end if;

  select p.* into v_rb from public.duo_plate_picks p
   where p.user_a = least(v_uid, p_friend) and p.user_b = greatest(v_uid, p_friend)
     and p.quest_id = 'rainbow_plate' and p.week_start = p_week
   order by p.created_at desc limit 1;
  if v_rb.id is not null then
    select count(*)::integer into v_rainbow from public.duo_plate_acks a where a.pick_id = v_rb.id and a.user_id in (v_uid, p_friend);
    select exists (select 1 from public.duo_plate_acks a where a.pick_id = v_rb.id and a.user_id = v_uid) into v_myack;
  end if;

  return query
  select q.id,
         least(case q.id when 'daily_duo' then v_days when 'week_dinners' then v_din
                         when 'review_duo' then v_each when 'taste_test' then v_same
                         when 'match_plate' then v_match when 'mystery_plate' then v_mystery
                         else v_rainbow end,
               public.duo_quest_target(q.id)),
         public.duo_quest_target(q.id),
         exists (select 1 from public.duo_claims c
                 where c.user_id = v_uid and c.friend_id = p_friend
                   and c.quest_id = q.id and c.week_start = p_week),
         case when q.id = 'mystery_plate' and v_pick.id is not null then v_pick.item_name
              when q.id = 'rainbow_plate' and v_rb.id is not null then v_rb.item_name
              else null end,
         case when q.id = 'rainbow_plate' then v_myack else false end
  from (values ('daily_duo'), ('week_dinners'), ('review_duo'), ('taste_test'), ('match_plate'), ('mystery_plate'), ('rainbow_plate')) as q(id);
end;
$$;

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
  if p_quest not in ('daily_duo', 'week_dinners', 'review_duo', 'taste_test', 'match_plate', 'mystery_plate', 'rainbow_plate') then
    raise exception 'invalid_quest';
  end if;
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

do $$
declare f text;
begin
  foreach f in array array['duo_rainbow_pick(uuid, text)', 'duo_plate_ack(uuid)', 'duo_quests(uuid, date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
