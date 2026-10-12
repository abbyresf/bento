-- Six more buddy quests, built on the same table as Mystery plate and Rainbow plate.
--
--   bento_plate   Both eat a plate with a protein, a vegetable and a grain. Honor system, but a
--                 student can tap "I did it" only after confirming a meal in the two day window.
--   plate_swap    Each picks a dish for the other (checked against the receiver's settings by
--                 duo_compatible_items). Counts the dishes each receiver ate. Needs both.
--   pick_of_week  Each nominates a favorite (it must be in their own ratings, 4 stars or more) and
--                 each rates the other's pick after it was made. Needs both.
--   cover_me      Nudge a buddy who has not confirmed a meal today, before 8pm. Counts when they
--                 confirm one after the nudge. The nudger's quest only.
--   twin_day      Both agree, for today, to wear the same outfit (the one who asked).
--   outfit_swap   Both agree, for today, to wear each other's outfit.
--
-- Only counts, dish names the pair chose, and an outfit id (which buddies already see) leave these
-- functions. Nothing about what anyone ate is shown. Nudges are limited to 5 a day.
--
-- Run after 051. Safe to run more than once.

-- ── Shared pieces ─────────────────────────────────────────────────────────────

alter table public.duo_plate_picks drop constraint if exists duo_plate_picks_quest_id_check;
alter table public.duo_plate_picks
  add constraint duo_plate_picks_quest_id_check
  check (quest_id in ('mystery_plate', 'rainbow_plate', 'bento_plate', 'plate_swap', 'pick_of_week', 'cover_me', 'twin_day', 'outfit_swap'));

alter table public.duo_claims drop constraint if exists duo_claims_quest_id_check;
alter table public.duo_claims
  add constraint duo_claims_quest_id_check
  check (quest_id in ('daily_duo', 'week_dinners', 'review_duo', 'taste_test', 'match_plate', 'mystery_plate', 'rainbow_plate',
                      'bento_plate', 'plate_swap', 'pick_of_week', 'cover_me', 'twin_day', 'outfit_swap'));

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
    when 'bento_plate' then 2
    when 'plate_swap' then 2
    when 'pick_of_week' then 2
    when 'cover_me' then 1
    when 'twin_day' then 2
    when 'outfit_swap' then 2
    else 0 end;
$$;

-- Midnight at the end of today in Eastern time.
create or replace function public.duo__end_of_day()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (((now() at time zone 'America/New_York')::date + 1)::timestamp at time zone 'America/New_York');
$$;

-- The newest pick of one kind for a pair in a week, optionally only one person's.
create or replace function public.duo__latest_pick(p_a uuid, p_b uuid, p_quest text, p_week date, p_by uuid default null)
returns public.duo_plate_picks
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.duo_plate_picks p
   where p.user_a = least(p_a, p_b) and p.user_b = greatest(p_a, p_b)
     and p.quest_id = p_quest and p.week_start = p_week
     and (p_by is null or p.picked_by = p_by)
   order by p.created_at desc limit 1;
$$;

-- Whether a student confirmed a meal with this pick's dish while the pick was open.
create or replace function public.duo__ate(p_user uuid, p public.duo_plate_picks)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.meal_history m
     where m.user_id = p_user
       and m.meal_date between (p.created_at at time zone 'America/New_York')::date and (p.expires_at at time zone 'America/New_York')::date
       and case when jsonb_typeof(m.items) = 'array' then m.items else '[]'::jsonb end
           @> jsonb_build_array(jsonb_build_object('id', p.item_id)));
$$;

-- Whether a student rated this pick's dish after the pick was made.
create or replace function public.duo__rated(p_user uuid, p public.duo_plate_picks)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.item_ratings r where r.user_id = p_user and r.item_id = p.item_id and r.updated_at >= p.created_at);
$$;

-- Whether a student confirmed any meal while the pick was open.
create or replace function public.duo__has_meal(p_user uuid, p public.duo_plate_picks)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.meal_history m
     where m.user_id = p_user
       and m.meal_date between (p.created_at at time zone 'America/New_York')::date and (p.expires_at at time zone 'America/New_York')::date);
$$;

revoke all on function public.duo__end_of_day() from public, anon, authenticated;
revoke all on function public.duo__latest_pick(uuid, uuid, text, date, uuid) from public, anon, authenticated;
revoke all on function public.duo__ate(uuid, public.duo_plate_picks) from public, anon, authenticated;
revoke all on function public.duo__rated(uuid, public.duo_plate_picks) from public, anon, authenticated;
revoke all on function public.duo__has_meal(uuid, public.duo_plate_picks) from public, anon, authenticated;

-- ── Starting each quest ───────────────────────────────────────────────────────

-- Bento plate: no choice to make, just the pair.
create or replace function public.duo_bento_pick(p_friend uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_now  date := (now() at time zone 'America/New_York')::date;
  v_week date := v_now - ((extract(isodow from v_now)::integer) - 1);
  v_a uuid; v_b uuid;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  v_a := least(v_uid, p_friend); v_b := greatest(v_uid, p_friend);
  if not exists (select 1 from public.friendships f where f.status = 'active' and f.user_a = v_a and f.user_b = v_b) then return 'not_friends'; end if;
  if exists (select 1 from public.duo_plate_picks p where p.user_a = v_a and p.user_b = v_b and p.quest_id = 'bento_plate' and p.expires_at > now()) then return 'exists'; end if;
  insert into public.duo_plate_picks (user_a, user_b, quest_id, picked_by, item_id, item_name, hall, week_start)
  values (v_a, v_b, 'bento_plate', v_uid, 'bento', 'Bento plate', null, v_week);
  return 'ok';
end;
$$;

-- Plate swap: a dish for your buddy. Each of you makes one.
create or replace function public.duo_swap_pick(p_friend uuid, p_item_id text, p_item_name text, p_hall text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_now  date := (now() at time zone 'America/New_York')::date;
  v_week date := v_now - ((extract(isodow from v_now)::integer) - 1);
  v_a uuid; v_b uuid;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  v_a := least(v_uid, p_friend); v_b := greatest(v_uid, p_friend);
  if not exists (select 1 from public.friendships f where f.status = 'active' and f.user_a = v_a and f.user_b = v_b) then return 'not_friends'; end if;
  if coalesce(char_length(p_item_id), 0) not between 1 and 120 or coalesce(char_length(p_item_name), 0) not between 1 and 160 then return 'invalid'; end if;
  if exists (select 1 from public.duo_plate_picks p where p.user_a = v_a and p.user_b = v_b and p.quest_id = 'plate_swap'
              and p.picked_by = v_uid and p.expires_at > now()) then return 'exists'; end if;
  insert into public.duo_plate_picks (user_a, user_b, quest_id, picked_by, item_id, item_name, hall, week_start)
  values (v_a, v_b, 'plate_swap', v_uid, p_item_id, p_item_name, p_hall, v_week);
  return 'ok';
end;
$$;

-- Pick of the week: your favorite, from your own ratings.
create or replace function public.duo_nominate(p_friend uuid, p_item_id text, p_item_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_now  date := (now() at time zone 'America/New_York')::date;
  v_week date := v_now - ((extract(isodow from v_now)::integer) - 1);
  v_a uuid; v_b uuid;
  v_stars smallint;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  v_a := least(v_uid, p_friend); v_b := greatest(v_uid, p_friend);
  if not exists (select 1 from public.friendships f where f.status = 'active' and f.user_a = v_a and f.user_b = v_b) then return 'not_friends'; end if;
  if coalesce(char_length(p_item_id), 0) not between 1 and 120 or coalesce(char_length(p_item_name), 0) not between 1 and 160 then return 'invalid'; end if;
  select r.rating into v_stars from public.item_ratings r where r.user_id = v_uid and r.item_id = p_item_id;
  if v_stars is null or v_stars < 4 then return 'not_rated'; end if;
  if exists (select 1 from public.duo_plate_picks p where p.user_a = v_a and p.user_b = v_b and p.quest_id = 'pick_of_week'
              and p.picked_by = v_uid and p.week_start = v_week) then return 'exists'; end if;
  insert into public.duo_plate_picks (user_a, user_b, quest_id, picked_by, item_id, item_name, hall, week_start, expires_at)
  values (v_a, v_b, 'pick_of_week', v_uid, p_item_id, p_item_name, null, v_week, ((v_week + 7)::timestamp at time zone 'America/New_York'));
  return 'ok';
end;
$$;

-- Cover for me: a nudge to a buddy who has not confirmed a meal today.
create or replace function public.duo_nudge(p_friend uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_ny    timestamp := now() at time zone 'America/New_York';
  v_today date := v_ny::date;
  v_week  date := v_today - ((extract(isodow from v_today)::integer) - 1);
  v_a uuid; v_b uuid;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  v_a := least(v_uid, p_friend); v_b := greatest(v_uid, p_friend);
  if not exists (select 1 from public.friendships f where f.status = 'active' and f.user_a = v_a and f.user_b = v_b) then return 'not_friends'; end if;
  if v_ny::time >= time '20:00' then return 'too_late'; end if;
  if exists (select 1 from public.meal_history m where m.user_id = p_friend and m.meal_date = v_today) then return 'already_confirmed'; end if;
  if exists (select 1 from public.duo_plate_picks p where p.user_a = v_a and p.user_b = v_b and p.quest_id = 'cover_me'
              and p.picked_by = v_uid and p.expires_at > now()) then return 'exists'; end if;
  if (select count(*) from public.duo_plate_picks p where p.quest_id = 'cover_me' and p.picked_by = v_uid
       and (p.created_at at time zone 'America/New_York')::date = v_today) >= 5 then return 'limit'; end if;
  insert into public.duo_plate_picks (user_a, user_b, quest_id, picked_by, item_id, item_name, hall, week_start, expires_at)
  values (v_a, v_b, 'cover_me', v_uid, 'nudge', 'Nudge', null, v_week, public.duo__end_of_day());
  return 'ok';
end;
$$;

-- Twin day and Outfit swap: ask for today. The asker's agreement counts at once.
create or replace function public.duo_twin_request(p_friend uuid, p_mode text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_now  date := (now() at time zone 'America/New_York')::date;
  v_week date := v_now - ((extract(isodow from v_now)::integer) - 1);
  v_a uuid; v_b uuid;
  v_quest text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if p_mode not in ('twin', 'swap') then return 'invalid'; end if;
  v_quest := case p_mode when 'twin' then 'twin_day' else 'outfit_swap' end;
  v_a := least(v_uid, p_friend); v_b := greatest(v_uid, p_friend);
  if not exists (select 1 from public.friendships f where f.status = 'active' and f.user_a = v_a and f.user_b = v_b) then return 'not_friends'; end if;
  if exists (select 1 from public.duo_plate_picks p where p.user_a = v_a and p.user_b = v_b and p.quest_id = v_quest and p.expires_at > now()) then return 'exists'; end if;
  insert into public.duo_plate_picks (user_a, user_b, quest_id, picked_by, item_id, item_name, hall, week_start, expires_at)
  values (v_a, v_b, v_quest, v_uid, 'today', case p_mode when 'twin' then 'Twin day' else 'Outfit swap' end, null, v_week, public.duo__end_of_day())
  returning id into v_id;
  insert into public.duo_plate_acks (pick_id, user_id) values (v_id, v_uid) on conflict do nothing;
  return 'ok';
end;
$$;

-- "I did it" for Rainbow plate and Bento plate (needs a confirmed meal in the window), and
-- "Accept" for Twin day and Outfit swap (no meal needed). Replaces the one-argument version.
drop function if exists public.duo_plate_ack(uuid);
drop function if exists public.duo_plate_ack(uuid, text);

create function public.duo_plate_ack(p_friend uuid, p_quest text default 'rainbow_plate')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_pick public.duo_plate_picks;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if p_quest not in ('rainbow_plate', 'bento_plate', 'twin_day', 'outfit_swap') then return 'invalid'; end if;
  select p.* into v_pick from public.duo_plate_picks p
   where p.user_a = least(v_uid, p_friend) and p.user_b = greatest(v_uid, p_friend)
     and p.quest_id = p_quest and p.expires_at > now()
   order by p.created_at desc limit 1;
  if v_pick.id is null then return 'no_pick'; end if;
  if exists (select 1 from public.duo_plate_acks a where a.pick_id = v_pick.id and a.user_id = v_uid) then return 'already'; end if;
  if p_quest in ('rainbow_plate', 'bento_plate') and not public.duo__has_meal(v_uid, v_pick) then
    return 'no_meal';
  end if;
  insert into public.duo_plate_acks (pick_id, user_id) values (v_pick.id, v_uid) on conflict do nothing;
  return 'ok';
end;
$$;

-- The outfit to wear today, for each buddy you agreed a Twin day or Outfit swap with. Only an outfit id,
-- which buddies already see, and only while both of you have agreed and the day has not ended.
create or replace function public.duo_costumes()
returns table(friend_id uuid, mode text, outfit text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  return query
  select case when p.user_a = v_uid then p.user_b else p.user_a end,
         case p.quest_id when 'twin_day' then 'twin' else 'swap' end,
         case p.quest_id
           when 'twin_day' then (select pr.mascot_outfit from public.profiles pr where pr.id = p.picked_by)
           else (select pr.mascot_outfit from public.profiles pr where pr.id = case when p.user_a = v_uid then p.user_b else p.user_a end)
         end
    from public.duo_plate_picks p
    join public.friendships f on f.user_a = p.user_a and f.user_b = p.user_b and f.status = 'active'
   where v_uid in (p.user_a, p.user_b)
     and p.quest_id in ('twin_day', 'outfit_swap')
     and p.expires_at > now()
     and (select count(*) from public.duo_plate_acks a where a.pick_id = p.id) >= 2;
end;
$$;

-- ── The quests ────────────────────────────────────────────────────────────────

drop function if exists public.duo_quests(uuid, date);

create function public.duo_quests(p_friend uuid, p_week date)
returns table(quest_id text, progress integer, target integer, claimed boolean, detail text, acked boolean,
              mine_detail text, requested_by_me boolean, detail_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_days  integer; v_din integer; v_each integer; v_same integer; v_match integer;
  v_my    public.duo_plate_picks;      -- Mystery plate
  v_rb    public.duo_plate_picks;      -- Rainbow plate
  v_bp    public.duo_plate_picks;      -- Bento plate
  v_swm   public.duo_plate_picks;      -- Plate swap: mine, and theirs
  v_swt   public.duo_plate_picks;
  v_pwm   public.duo_plate_picks;      -- Pick of the week: mine, and theirs
  v_pwt   public.duo_plate_picks;
  v_cv    public.duo_plate_picks;      -- Cover for me (mine only)
  v_tw    public.duo_plate_picks;      -- Twin day
  v_os    public.duo_plate_picks;      -- Outfit swap
  v_my_n integer := 0; v_rb_n integer := 0; v_bp_n integer := 0; v_sw_n integer := 0; v_pw_n integer := 0;
  v_cv_n integer := 0; v_tw_n integer := 0; v_os_n integer := 0;
  v_rb_me boolean := false; v_bp_me boolean := false; v_pw_me boolean := false; v_tw_me boolean := false; v_os_me boolean := false;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select w.days_both, w.dinners_both into v_days, v_din from public.duo_week(p_friend, p_week) w;
  select r.each_min, r.shared into v_each, v_same from public.duo_rating_week(p_friend, p_week) r;
  v_match := public.duo_match_week(p_friend, p_week);

  v_my := public.duo__latest_pick(v_uid, p_friend, 'mystery_plate', p_week);
  if v_my.id is not null then
    v_my_n := (case when public.duo__ate(v_uid, v_my) then 1 else 0 end) + (case when public.duo__ate(p_friend, v_my) then 1 else 0 end);
  end if;

  v_rb := public.duo__latest_pick(v_uid, p_friend, 'rainbow_plate', p_week);
  if v_rb.id is not null then
    select count(*)::integer into v_rb_n from public.duo_plate_acks a where a.pick_id = v_rb.id and a.user_id in (v_uid, p_friend);
    v_rb_me := exists (select 1 from public.duo_plate_acks a where a.pick_id = v_rb.id and a.user_id = v_uid);
  end if;

  v_bp := public.duo__latest_pick(v_uid, p_friend, 'bento_plate', p_week);
  if v_bp.id is not null then
    select count(*)::integer into v_bp_n from public.duo_plate_acks a where a.pick_id = v_bp.id and a.user_id in (v_uid, p_friend);
    v_bp_me := exists (select 1 from public.duo_plate_acks a where a.pick_id = v_bp.id and a.user_id = v_uid);
  end if;

  v_swm := public.duo__latest_pick(v_uid, p_friend, 'plate_swap', p_week, v_uid);
  v_swt := public.duo__latest_pick(v_uid, p_friend, 'plate_swap', p_week, p_friend);
  v_sw_n := (case when v_swt.id is not null and public.duo__ate(v_uid, v_swt) then 1 else 0 end)
          + (case when v_swm.id is not null and public.duo__ate(p_friend, v_swm) then 1 else 0 end);

  v_pwm := public.duo__latest_pick(v_uid, p_friend, 'pick_of_week', p_week, v_uid);
  v_pwt := public.duo__latest_pick(v_uid, p_friend, 'pick_of_week', p_week, p_friend);
  v_pw_me := v_pwt.id is not null and public.duo__rated(v_uid, v_pwt);
  v_pw_n := (case when v_pw_me then 1 else 0 end)
          + (case when v_pwm.id is not null and public.duo__rated(p_friend, v_pwm) then 1 else 0 end);

  v_cv := public.duo__latest_pick(v_uid, p_friend, 'cover_me', p_week, v_uid);
  if v_cv.id is not null then
    v_cv_n := case when exists (select 1 from public.meal_history m
                                 where m.user_id = p_friend and m.confirmed_at > v_cv.created_at and m.confirmed_at <= v_cv.expires_at)
                   then 1 else 0 end;
  end if;

  v_tw := public.duo__latest_pick(v_uid, p_friend, 'twin_day', p_week);
  if v_tw.id is not null then
    select count(*)::integer into v_tw_n from public.duo_plate_acks a where a.pick_id = v_tw.id and a.user_id in (v_uid, p_friend);
    v_tw_me := exists (select 1 from public.duo_plate_acks a where a.pick_id = v_tw.id and a.user_id = v_uid);
  end if;
  v_os := public.duo__latest_pick(v_uid, p_friend, 'outfit_swap', p_week);
  if v_os.id is not null then
    select count(*)::integer into v_os_n from public.duo_plate_acks a where a.pick_id = v_os.id and a.user_id in (v_uid, p_friend);
    v_os_me := exists (select 1 from public.duo_plate_acks a where a.pick_id = v_os.id and a.user_id = v_uid);
  end if;

  return query
  select q.id,
         least(case q.id
                 when 'daily_duo' then v_days when 'week_dinners' then v_din when 'review_duo' then v_each
                 when 'taste_test' then v_same when 'match_plate' then v_match when 'mystery_plate' then v_my_n
                 when 'rainbow_plate' then v_rb_n when 'bento_plate' then v_bp_n when 'plate_swap' then v_sw_n
                 when 'pick_of_week' then v_pw_n when 'cover_me' then v_cv_n when 'twin_day' then v_tw_n
                 else v_os_n end,
               public.duo_quest_target(q.id)),
         public.duo_quest_target(q.id),
         exists (select 1 from public.duo_claims c
                 where c.user_id = v_uid and c.friend_id = p_friend and c.quest_id = q.id and c.week_start = p_week),
         case q.id
           when 'mystery_plate' then v_my.item_name
           when 'rainbow_plate' then v_rb.item_name
           when 'bento_plate' then v_bp.item_name
           when 'plate_swap' then v_swt.item_name
           when 'pick_of_week' then v_pwt.item_name
           when 'cover_me' then v_cv.item_name
           when 'twin_day' then v_tw.item_name
           when 'outfit_swap' then v_os.item_name
           else null end,
         case q.id
           when 'rainbow_plate' then v_rb_me when 'bento_plate' then v_bp_me when 'pick_of_week' then v_pw_me
           when 'twin_day' then v_tw_me when 'outfit_swap' then v_os_me else false end,
         case q.id when 'plate_swap' then v_swm.item_name when 'pick_of_week' then v_pwm.item_name else null end,
         case q.id
           when 'cover_me' then v_cv.id is not null
           when 'twin_day' then v_tw.picked_by = v_uid
           when 'outfit_swap' then v_os.picked_by = v_uid
           else false end,
         case q.id when 'mystery_plate' then v_my.item_id when 'plate_swap' then v_swt.item_id
                   when 'pick_of_week' then v_pwt.item_id else null end
  from (values ('daily_duo'), ('week_dinners'), ('review_duo'), ('taste_test'), ('match_plate'), ('mystery_plate'),
               ('rainbow_plate'), ('bento_plate'), ('plate_swap'), ('pick_of_week'), ('cover_me'), ('twin_day'), ('outfit_swap')) as q(id);
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
  if public.duo_quest_target(p_quest) = 0 then raise exception 'invalid_quest'; end if;
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
  foreach f in array array[
    'duo_bento_pick(uuid)', 'duo_swap_pick(uuid, text, text, text)', 'duo_nominate(uuid, text, text)', 'duo_nudge(uuid)',
    'duo_twin_request(uuid, text)', 'duo_plate_ack(uuid, text)', 'duo_costumes()', 'duo_quests(uuid, date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
