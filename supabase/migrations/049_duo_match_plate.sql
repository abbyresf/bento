-- Match the plate: a buddy quest for eating alike.
--
--   match_plate  Both confirm the same meal on the same day with at least two dishes in
--                common. The count is meals, and one is enough.
--
-- Only a count leaves the function. A buddy never sees what you ate. Meals before the two
-- of you became buddies do not count (same rule as duo_week).
--
-- Run after 048. Safe to run more than once.

alter table public.duo_claims drop constraint if exists duo_claims_quest_id_check;
alter table public.duo_claims
  add constraint duo_claims_quest_id_check
  check (quest_id in ('daily_duo', 'week_dinners', 'review_duo', 'taste_test', 'match_plate'));

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
    else 0 end;
$$;

-- Meals in one Monday to Sunday week where both students confirmed the same meal and
-- shared at least two dishes.
create or replace function public.duo_match_week(p_friend uuid, p_week_start date)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_start date;
  v_n     integer;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select (f.started_at at time zone 'America/New_York')::date into v_start
  from public.friendships f
  where f.status = 'active'
    and f.user_a = least(v_uid, p_friend) and f.user_b = greatest(v_uid, p_friend);
  if v_start is null then raise exception 'not_friends'; end if;

  select count(*)::integer into v_n from (
    select a.meal_date, a.meal_type
    from public.meal_history a
    join public.meal_history b
      on b.user_id = p_friend and b.meal_date = a.meal_date and b.meal_type = a.meal_type
    where a.user_id = v_uid
      and a.meal_type is not null
      and a.meal_date between greatest(p_week_start, v_start) and p_week_start + 6
      and (
        select count(distinct x.value ->> 'id')
        from jsonb_array_elements(case when jsonb_typeof(a.items) = 'array' then a.items else '[]'::jsonb end) x
        where x.value ->> 'id' is not null
          and exists (
            select 1
            from jsonb_array_elements(case when jsonb_typeof(b.items) = 'array' then b.items else '[]'::jsonb end) y
            where y.value ->> 'id' = x.value ->> 'id'
          )
      ) >= 2
    group by a.meal_date, a.meal_type
  ) t;
  return coalesce(v_n, 0);
end;
$$;

create or replace function public.duo_quests(p_friend uuid, p_week date)
returns table(quest_id text, progress integer, target integer, claimed boolean)
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
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select w.days_both, w.dinners_both into v_days, v_din from public.duo_week(p_friend, p_week) w;
  select r.each_min, r.shared into v_each, v_same from public.duo_rating_week(p_friend, p_week) r;
  v_match := public.duo_match_week(p_friend, p_week);

  return query
  select q.id,
         least(case q.id when 'daily_duo' then v_days when 'week_dinners' then v_din
                         when 'review_duo' then v_each when 'taste_test' then v_same
                         else v_match end,
               public.duo_quest_target(q.id)),
         public.duo_quest_target(q.id),
         exists (select 1 from public.duo_claims c
                 where c.user_id = v_uid and c.friend_id = p_friend
                   and c.quest_id = q.id and c.week_start = p_week)
  from (values ('daily_duo'), ('week_dinners'), ('review_duo'), ('taste_test'), ('match_plate')) as q(id);
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
  if p_quest not in ('daily_duo', 'week_dinners', 'review_duo', 'taste_test', 'match_plate') then raise exception 'invalid_quest'; end if;
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

revoke all on function public.duo_match_week(uuid, date) from public, anon;
grant execute on function public.duo_match_week(uuid, date) to authenticated;

notify pgrst, 'reload schema';
