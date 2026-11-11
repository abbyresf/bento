-- Event gifts: a free closet piece for accounts created during a launch event.
--
-- The first one is the Halloween 2026 launch. Anyone whose account was created from
-- 29 Oct to the end of 3 Nov 2026 (Eastern) picks one piece, once: bat wings or a
-- pumpkin hat. Eligibility is decided here from the account's own created_at, so the
-- app cannot grant itself a piece, and a build that reaches a phone after 3 Nov still
-- honors an account made before it. The claim has no deadline, only the sign-up window.
--
-- A claim is owned by the student who made it and is kept for good. Event pieces are
-- cosmetic. They are not tied to a streak, rating or quest.
--
-- Run after 064. Safe to run more than once.

create table if not exists public.gift_events (
  event     text        primary key check (event ~ '^[a-z0-9_]{3,32}$'),
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  pieces    text[]      not null check (cardinality(pieces) > 0),
  check (ends_at > starts_at)
);

alter table public.gift_events enable row level security;
revoke all on public.gift_events from public, anon, authenticated;

insert into public.gift_events (event, starts_at, ends_at, pieces)
values (
  'halloween26',
  timestamptz '2026-10-29 00:00:00 America/New_York',
  timestamptz '2026-11-04 00:00:00 America/New_York',
  array['batwings', 'pumpkin']
)
on conflict (event) do nothing;

create table if not exists public.gift_claims (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  event      text        not null references public.gift_events(event),
  piece      text        not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, event)
);

alter table public.gift_claims enable row level security;
revoke all on public.gift_claims from public, anon, authenticated;

-- Whether this student may claim, and the piece they already chose if they did.
drop function if exists public.gift_status(text);
create function public.gift_status(p_event text)
returns table(eligible boolean, piece text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_created timestamptz;
  v_ev      public.gift_events;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select * into v_ev from public.gift_events e where e.event = p_event;
  if not found then return query select false, null::text; return; end if;

  select u.created_at into v_created from auth.users u where u.id = v_uid;

  return query
    select (v_created is not null and v_created >= v_ev.starts_at and v_created < v_ev.ends_at),
           (select c.piece from public.gift_claims c where c.user_id = v_uid and c.event = p_event);
end;
$$;

-- Claims one piece. 'ok', 'already' (a piece was chosen before), 'not_eligible' or
-- 'invalid_piece'. The choice is final.
drop function if exists public.gift_claim(text, text);
create function public.gift_claim(p_event text, p_piece text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_created timestamptz;
  v_ev      public.gift_events;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select * into v_ev from public.gift_events e where e.event = p_event;
  if not found then return 'not_eligible'; end if;
  if p_piece is null or not (p_piece = any (v_ev.pieces)) then return 'invalid_piece'; end if;

  if exists (select 1 from public.gift_claims c where c.user_id = v_uid and c.event = p_event) then
    return 'already';
  end if;

  select u.created_at into v_created from auth.users u where u.id = v_uid;
  if v_created is null or v_created < v_ev.starts_at or v_created >= v_ev.ends_at then
    return 'not_eligible';
  end if;

  insert into public.gift_claims (user_id, event, piece) values (v_uid, p_event, p_piece)
  on conflict do nothing;
  return 'ok';
end;
$$;

-- Every event piece this student owns, for the closet.
drop function if exists public.gift_pieces();
create function public.gift_pieces()
returns table(piece text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  return query select c.piece from public.gift_claims c where c.user_id = auth.uid();
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['gift_status(text)', 'gift_claim(text, text)', 'gift_pieces()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
