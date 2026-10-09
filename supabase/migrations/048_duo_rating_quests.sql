-- Two rating quests for buddies.
--
--   review_duo  Both rate 3 dishes in the week. The count is the smaller of the two
--               students' counts, so one student cannot finish it alone.
--   taste_test  Both rate the same dish in the week.
--
-- Only counts leave these functions. A buddy never sees which dishes you rated or what
-- you gave them. A rating counts on the Eastern-time day it was last saved, and ratings
-- saved before the two of you became buddies do not count (same rule as duo_week).
--
-- Run after 047. Safe to run more than once.

alter table public.duo_claims drop constraint if exists duo_claims_quest_id_check;
alter table public.duo_claims
  add constraint duo_claims_quest_id_check
  check (quest_id in ('daily_duo', 'week_dinners', 'review_duo', 'taste_test'));

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
    else 0 end;
$$;

-- Ratings in one Monday to Sunday week: the smaller of the two students' counts, and
-- how many dishes both rated.
create or replace function public.duo_rating_week(p_friend uuid, p_week_start date)
returns table(each_min integer, shared integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_start date;
  v_mine  integer;
  v_theirs integer;
  v_both  integer;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select (f.started_at at time zone 'America/New_York')::date into v_start
  from public.friendships f
  where f.status = 'active'
    and f.user_a = least(v_uid, p_friend) and f.user_b = greatest(v_uid, p_friend);
  if v_start is null then raise exception 'not_friends'; end if;

  with r as (
    select ir.user_id, ir.item_id
    from public.item_ratings ir
    where ir.user_id in (v_uid, p_friend)
      and (ir.updated_at at time zone 'America/New_York')::date between greatest(p_week_start, v_start) and p_week_start + 6
  )
  select count(*) filter (where r.user_id = v_uid)::integer,
         count(*) filter (where r.user_id = p_friend)::integer,
         (select count(*)::integer from r a join r b on a.item_id = b.item_id
           where a.user_id = v_uid and b.user_id = p_friend)
    into v_mine, v_theirs, v_both
  from r;

  return query select least(coalesce(v_mine, 0), coalesce(v_theirs, 0)), coalesce(v_both, 0);
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
  v_uid  uuid := auth.uid();
  v_days integer;
  v_din  integer;
  v_each integer;
  v_same integer;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select w.days_both, w.dinners_both into v_days, v_din from public.duo_week(p_friend, p_week) w;
  select r.each_min, r.shared into v_each, v_same from public.duo_rating_week(p_friend, p_week) r;

  return query
  select q.id,
         least(case q.id when 'daily_duo' then v_days when 'week_dinners' then v_din
                         when 'review_duo' then v_each else v_same end,
               public.duo_quest_target(q.id)),
         public.duo_quest_target(q.id),
         exists (select 1 from public.duo_claims c
                 where c.user_id = v_uid and c.friend_id = p_friend
                   and c.quest_id = q.id and c.week_start = p_week)
  from (values ('daily_duo'), ('week_dinners'), ('review_duo'), ('taste_test')) as q(id);
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
  if p_quest not in ('daily_duo', 'week_dinners', 'review_duo', 'taste_test') then raise exception 'invalid_quest'; end if;
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

revoke all on function public.duo_rating_week(uuid, date) from public, anon;
grant execute on function public.duo_rating_week(uuid, date) to authenticated;

notify pgrst, 'reload schema';
