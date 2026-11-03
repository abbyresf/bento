-- A Rainbow plate, Bento plate, Twin day or Outfit swap that ran out of time no longer shows as open.
--
-- These four quests last two days (duo_plate_picks.expires_at). duo_quests kept returning an expired one with its color and
-- "I did it" still showing, and duo_plate_ack answered 'no_pick' to every tap, so the button did nothing and a new quest
-- could not be started from it. Now a pick that expired before both of you tapped is treated as not there, so the card
-- shows Start again. A pick that both of you tapped stays, so it can still be claimed.
--
-- Run after 067. Safe to run more than once.

create or replace function public.duo__open_pick(p_a uuid, p_b uuid, p_quest text, p_week date)
returns public.duo_plate_picks
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.duo__latest_pick(p_a, p_b, p_quest, p_week) p
   where p.id is not null
     and (p.expires_at > now() or (select count(*) from public.duo_plate_acks a where a.pick_id = p.id) >= 2);
$$;

revoke all on function public.duo__open_pick(uuid, uuid, text, date) from public, anon, authenticated;

create or replace function public.duo_quests(p_friend uuid, p_week date)
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

  v_rb := public.duo__open_pick(v_uid, p_friend, 'rainbow_plate', p_week);
  if v_rb.id is not null then
    select count(*)::integer into v_rb_n from public.duo_plate_acks a where a.pick_id = v_rb.id and a.user_id in (v_uid, p_friend);
    v_rb_me := exists (select 1 from public.duo_plate_acks a where a.pick_id = v_rb.id and a.user_id = v_uid);
  end if;

  v_bp := public.duo__open_pick(v_uid, p_friend, 'bento_plate', p_week);
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

  v_tw := public.duo__open_pick(v_uid, p_friend, 'twin_day', p_week);
  if v_tw.id is not null then
    select count(*)::integer into v_tw_n from public.duo_plate_acks a where a.pick_id = v_tw.id and a.user_id in (v_uid, p_friend);
    v_tw_me := exists (select 1 from public.duo_plate_acks a where a.pick_id = v_tw.id and a.user_id = v_uid);
  end if;
  v_os := public.duo__open_pick(v_uid, p_friend, 'outfit_swap', p_week);
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

notify pgrst, 'reload schema';
