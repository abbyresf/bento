-- Mystery plate becomes what it was meant to be: you pick a mystery dish for your buddy's plate, and your
-- buddy picks one for yours. (Migration 050 made it one shared dish. Plate swap, 052, was this idea, so the
-- app now offers it as Mystery plate and no longer lists Plate swap. The old Plate swap functions stay in
-- the database, unused.)
--
--   duo_plate_pick     now makes one pick per student for the pair, not one for both. The dish should be
--                      checked against the receiver's settings first (duo_compatible_items, 050).
--   duo_quests         counts, for Mystery plate, the buddy who ate the dish you picked plus you eating the
--                      one they picked. detail is the dish picked for you, mine_detail the one you picked.
--   duo_today_hints    the lines Bento says at the top of Today: the mystery dish picked for you and not yet
--                      eaten, and the Rainbow plate color you have not tapped yet.
--   profiles.skip_breakfast   a student who never eats breakfast at the dining hall can turn it off. Bento
--                      then plans two larger meals.
--
-- Run after 052. Safe to run more than once.

alter table public.profiles add column if not exists skip_breakfast boolean not null default false;

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
  -- One open pick from you to this buddy. They make their own.
  if exists (
    select 1 from public.duo_plate_picks p
    where p.user_a = v_a and p.user_b = v_b and p.quest_id = 'mystery_plate' and p.picked_by = v_uid and p.expires_at > now()
  ) then
    return 'exists';
  end if;
  insert into public.duo_plate_picks (user_a, user_b, quest_id, picked_by, item_id, item_name, hall, week_start)
  values (v_a, v_b, 'mystery_plate', v_uid, p_item_id, p_item_name, p_hall, v_week);
  return 'ok';
end;
$$;

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
  v_mym   public.duo_plate_picks;      -- Mystery plate: mine, and theirs
  v_myt   public.duo_plate_picks;
  v_rb    public.duo_plate_picks;      -- Rainbow plate
  v_bp    public.duo_plate_picks;      -- Bento plate
  v_swm   public.duo_plate_picks;      -- Plate swap (no longer offered): mine, and theirs
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

  v_mym := public.duo__latest_pick(v_uid, p_friend, 'mystery_plate', p_week, v_uid);
  v_myt := public.duo__latest_pick(v_uid, p_friend, 'mystery_plate', p_week, p_friend);
  v_my_n := (case when v_myt.id is not null and public.duo__ate(v_uid, v_myt) then 1 else 0 end)
          + (case when v_mym.id is not null and public.duo__ate(p_friend, v_mym) then 1 else 0 end);

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
           when 'mystery_plate' then v_myt.item_name
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
         case q.id when 'mystery_plate' then v_mym.item_name when 'plate_swap' then v_swm.item_name
                   when 'pick_of_week' then v_pwm.item_name else null end,
         case q.id
           when 'cover_me' then v_cv.id is not null
           when 'twin_day' then v_tw.picked_by = v_uid
           when 'outfit_swap' then v_os.picked_by = v_uid
           else false end,
         case q.id when 'mystery_plate' then v_myt.item_id when 'plate_swap' then v_swt.item_id
                   when 'pick_of_week' then v_pwt.item_id else null end
  from (values ('daily_duo'), ('week_dinners'), ('review_duo'), ('taste_test'), ('match_plate'), ('mystery_plate'),
               ('rainbow_plate'), ('bento_plate'), ('plate_swap'), ('pick_of_week'), ('cover_me'), ('twin_day'), ('outfit_swap')) as q(id);
end;
$$;

-- What Bento says at the top of Today about your quests: the mystery dish a buddy picked for you that you have not
-- eaten yet, and a Rainbow plate color you have not tapped. Names and dishes the pair chose, nothing else.
create or replace function public.duo_today_hints()
returns table(quest_id text, friend_name text, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  return query
  select h.quest_id, h.friend_name, h.detail from (
    select p.quest_id::text as quest_id, pr.display_name as friend_name, p.item_name as detail, p.created_at
      from public.duo_plate_picks p
      join public.profiles pr on pr.id = p.picked_by
      join public.friendships f on f.user_a = p.user_a and f.user_b = p.user_b and f.status = 'active'
     where p.quest_id = 'mystery_plate' and v_uid in (p.user_a, p.user_b) and p.picked_by <> v_uid
       and p.expires_at > now() and not public.duo__ate(v_uid, p)
    union all
    select p.quest_id::text, pr.display_name, p.item_name, p.created_at
      from public.duo_plate_picks p
      join public.profiles pr on pr.id = case when p.user_a = v_uid then p.user_b else p.user_a end
      join public.friendships f on f.user_a = p.user_a and f.user_b = p.user_b and f.status = 'active'
     where p.quest_id = 'rainbow_plate' and v_uid in (p.user_a, p.user_b) and p.expires_at > now()
       and not exists (select 1 from public.duo_plate_acks a where a.pick_id = p.id and a.user_id = v_uid)
  ) h
  order by h.created_at desc
  limit 4;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['duo_plate_pick(uuid, text, text, text)', 'duo_quests(uuid, date)', 'duo_today_hints()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
