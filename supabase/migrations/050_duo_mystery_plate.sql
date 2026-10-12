-- Mystery plate: pick a dish that works for you and a buddy, then both eat it.
--
--   1. duo_compatible_items(friend, items) tells you which of the dishes you send pass your
--      buddy's dietary settings. It returns ids only. Your buddy's settings never leave the
--      database, and nothing is returned about why a dish was left out. It mirrors the checks in
--      src/utils/mealOptimizer.js (passesHardRestrictions) and fails closed: a dish with no
--      allergen or tag data is left out when your buddy has an allergy or a diet that needs it.
--   2. duo_plate_picks holds the dish a pair chose. It is reached only through functions.
--   3. duo_plate_pick(friend, item, name, hall) records a pick for the pair. One open pick per pair,
--      and it lasts two days.
--   4. duo_quests gets a fifth quest, mystery_plate. It counts the two of you who confirmed a
--      meal with that dish while the pick is open, and it needs both. duo_quests also returns
--      `detail`, the dish name once a pick exists, so each buddy sees what was picked.
--
-- Run after 049. Safe to run more than once.

-- ── The picks ─────────────────────────────────────────────────────────────────

create table if not exists public.duo_plate_picks (
  id         uuid        primary key default gen_random_uuid(),
  user_a     uuid        not null references auth.users(id) on delete cascade,
  user_b     uuid        not null references auth.users(id) on delete cascade,
  quest_id   text        not null check (quest_id in ('mystery_plate')),
  picked_by  uuid        not null references auth.users(id) on delete cascade,
  item_id    text        not null check (char_length(item_id) between 1 and 120),
  item_name  text        not null check (char_length(item_name) between 1 and 160),
  hall       text        check (hall is null or char_length(hall) <= 80),
  week_start date        not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 days',
  check (user_a < user_b)
);
create index if not exists duo_plate_picks_pair on public.duo_plate_picks (user_a, user_b, created_at desc);

alter table public.duo_plate_picks enable row level security;
revoke all on public.duo_plate_picks from public, anon, authenticated;

alter table public.duo_claims drop constraint if exists duo_claims_quest_id_check;
alter table public.duo_claims
  add constraint duo_claims_quest_id_check
  check (quest_id in ('daily_duo', 'week_dinners', 'review_duo', 'taste_test', 'match_plate', 'mystery_plate'));

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
    else 0 end;
$$;

-- ── Which dishes pass your buddy's settings ───────────────────────────────────

create or replace function public.duo_compatible_items(p_friend uuid, p_items jsonb)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  r         record;
  v_flags   text[] := '{}';
  v_free    text[] := '{}';
  v_item    jsonb;
  v_ok      boolean;
  v_text    text;
  v_has_all boolean;
  v_algs    jsonb;
  v_tags    jsonb;
  v_out     text[] := '{}';
  a         text;
  k         text;
  v_keymap  constant jsonb := '{"milk":"milk","eggs":"eggs","wheat":"wheat","soy":"soy","fish":"fish","shellfish":"shellfish","treeNuts":"tree nuts","peanuts":"peanuts","sesame":"sesame"}';
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not exists (
    select 1 from public.friendships f
    where f.status = 'active'
      and f.user_a = least(v_uid, p_friend) and f.user_b = greatest(v_uid, p_friend)
  ) then raise exception 'not_friends'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 400 then
    raise exception 'invalid_items';
  end if;

  select d.vegetarian, d.vegan, d.gluten_free, d.kosher, d.allergies
    into r from public.dietary_restrictions d where d.user_id = p_friend;

  -- The allergies column holds structured flags as '__allergen:<key>' and free text as plain strings.
  if r.allergies is not null and jsonb_typeof(r.allergies) = 'array' then
    for a in select jsonb_array_elements_text(r.allergies) loop
      if left(a, 11) = '__allergen:' then v_flags := v_flags || substr(a, 12);
      else v_free := v_free || a;
      end if;
    end loop;
  end if;
  v_has_all := coalesce(array_length(v_flags, 1), 0) > 0 or coalesce(array_length(v_free, 1), 0) > 0;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_ok := true;
    v_algs := case when jsonb_typeof(v_item -> 'allergens') = 'array' then v_item -> 'allergens' else null end;
    v_tags := case when jsonb_typeof(v_item -> 'tags') = 'array' then v_item -> 'tags' else null end;

    -- Fails closed: no allergen data means the dish cannot be cleared for a buddy with an allergy.
    if v_has_all and v_algs is null then v_ok := false; end if;
    -- A diet that depends on tags cannot be cleared for a dish with no tag data.
    if (coalesce(r.vegetarian, false) or coalesce(r.vegan, false) or coalesce(r.gluten_free, false) or coalesce(r.kosher, false))
       and v_tags is null then v_ok := false; end if;

    if v_ok then
      -- Structured allergens against the dish's allergen list.
      foreach a in array v_flags loop
        k := v_keymap ->> a;
        if k is not null and v_algs ? k then v_ok := false; end if;
      end loop;
    end if;

    if v_ok and coalesce(array_length(v_free, 1), 0) > 0 then
      -- Free-text allergies against allergens plus ingredients, lower-cased, as a substring.
      -- The app joins the two lists with a single space and nothing else, so match that shape.
      v_text := lower(array_to_string(
        array(select jsonb_array_elements_text(coalesce(v_algs, '[]'::jsonb)))
        || array(select jsonb_array_elements_text(case when jsonb_typeof(v_item -> 'ingredients') = 'array' then v_item -> 'ingredients' else '[]'::jsonb end)),
        ' '));
      foreach a in array v_free loop
        if position(lower(a) in v_text) > 0 then v_ok := false; end if;
      end loop;
    end if;

    if v_ok and v_tags is not null then
      if coalesce(r.vegetarian, false) and not (v_tags ? 'vegetarian' or v_tags ? 'vegan') then v_ok := false; end if;
      if coalesce(r.vegan, false) and not (v_tags ? 'vegan') then v_ok := false; end if;
      if coalesce(r.gluten_free, false) and not (v_tags ? 'glutenFree') then v_ok := false; end if;
      if coalesce(r.kosher, false) and not (v_tags ? 'kosher') then v_ok := false; end if;
    end if;

    if v_ok and (v_item ->> 'id') is not null then v_out := v_out || (v_item ->> 'id'); end if;
  end loop;

  return v_out;
end;
$$;

-- ── Recording a pick ──────────────────────────────────────────────────────────

create or replace function public.duo_plate_pick(p_friend uuid, p_item_id text, p_item_name text, p_hall text)
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
  if coalesce(char_length(p_item_id), 0) not between 1 and 120 or coalesce(char_length(p_item_name), 0) not between 1 and 160 then
    return 'invalid';
  end if;
  if exists (
    select 1 from public.duo_plate_picks p
    where p.user_a = v_a and p.user_b = v_b and p.quest_id = 'mystery_plate' and p.expires_at > now()
  ) then
    return 'exists';
  end if;
  insert into public.duo_plate_picks (user_a, user_b, quest_id, picked_by, item_id, item_name, hall, week_start)
  values (v_a, v_b, 'mystery_plate', v_uid, p_item_id, p_item_name, p_hall, v_week);
  return 'ok';
end;
$$;

-- ── The quests, now with Mystery plate and a detail line ──────────────────────

drop function if exists public.duo_quests(uuid, date);

create function public.duo_quests(p_friend uuid, p_week date)
returns table(quest_id text, progress integer, target integer, claimed boolean, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_days  integer;
  v_din   integer;
  v_each  integer;
  v_same  integer;
  v_match integer;
  v_pick  record;
  v_mine  boolean;
  v_theirs boolean;
  v_mystery integer := 0;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select w.days_both, w.dinners_both into v_days, v_din from public.duo_week(p_friend, p_week) w;
  select r.each_min, r.shared into v_each, v_same from public.duo_rating_week(p_friend, p_week) r;
  v_match := public.duo_match_week(p_friend, p_week);

  -- The newest pick this pair made in this week. Both of you must confirm a meal with the dish
  -- between the day it was picked and the day it expires.
  select p.* into v_pick from public.duo_plate_picks p
   where p.user_a = least(v_uid, p_friend) and p.user_b = greatest(v_uid, p_friend)
     and p.quest_id = 'mystery_plate' and p.week_start = p_week
   order by p.created_at desc limit 1;
  if found then
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

  return query
  select q.id,
         least(case q.id when 'daily_duo' then v_days when 'week_dinners' then v_din
                         when 'review_duo' then v_each when 'taste_test' then v_same
                         when 'match_plate' then v_match else v_mystery end,
               public.duo_quest_target(q.id)),
         public.duo_quest_target(q.id),
         exists (select 1 from public.duo_claims c
                 where c.user_id = v_uid and c.friend_id = p_friend
                   and c.quest_id = q.id and c.week_start = p_week),
         case when q.id = 'mystery_plate' and v_pick.id is not null then v_pick.item_name else null end
  from (values ('daily_duo'), ('week_dinners'), ('review_duo'), ('taste_test'), ('match_plate'), ('mystery_plate')) as q(id);
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
  if p_quest not in ('daily_duo', 'week_dinners', 'review_duo', 'taste_test', 'match_plate', 'mystery_plate') then
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
  foreach f in array array['duo_compatible_items(uuid, jsonb)', 'duo_plate_pick(uuid, text, text, text)', 'duo_quests(uuid, date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
