-- 072: Campus feed (Loud pilot). Downvotes and anonymous replies on the existing community posts.
--
-- Campus reuses public.suggestions: posts are already anonymous (no user id is stored), scoped to a school, upvoted
-- through suggestion_emphasizes and flagged through suggestion_flags. This adds:
--   - suggestion_downvotes, one row per person, kept apart from upvotes so the existing toggle_emphasize keeps working
--     for the current app;
--   - cast_vote, which sets a person's vote to up, down or none and recounts both;
--   - an automatic hide once a post has at least 6 downvotes and more downvotes than upvotes;
--   - suggestion_replies, anonymous like posts, with their own report and a hide at 3 reports.
--
-- Every writer is SECURITY DEFINER and recounts from rows, the same pattern as 025, so no client can write a count.
-- Pulse reads none of this.

-- ── 1. Counts on posts ───────────────────────────────────────────────────────

alter table public.suggestions
  add column if not exists downvote_count integer not null default 0,
  add column if not exists reply_count    integer not null default 0;

-- ── 2. Downvotes ────────────────────────────────────────────────────────────

create table if not exists public.suggestion_downvotes (
  user_id       uuid not null references auth.users(id) on delete cascade,
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, suggestion_id)
);
alter table public.suggestion_downvotes enable row level security;
drop policy if exists "own downvotes" on public.suggestion_downvotes;
create policy "own downvotes" on public.suggestion_downvotes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 3. cast_vote: 1 up, -1 down, 0 none ─────────────────────────────────────

create or replace function public.cast_vote(p_suggestion_id uuid, p_vote smallint)
returns table(my_vote smallint, up_count integer, down_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_up   integer;
  v_down integer;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if p_vote not in (-1, 0, 1) then raise exception 'bad vote'; end if;
  -- Only posts the caller can see: not hidden, and from their own school.
  if not exists (
    select 1 from public.suggestions s
     where s.id = p_suggestion_id and s.is_hidden = false
       and s.university = (select coalesce(university, 'brandeis') from public.profiles where id = v_user)
  ) then raise exception 'not found'; end if;

  delete from public.suggestion_emphasizes where user_id = v_user and suggestion_id = p_suggestion_id;
  delete from public.suggestion_downvotes  where user_id = v_user and suggestion_id = p_suggestion_id;
  if p_vote = 1 then
    insert into public.suggestion_emphasizes (user_id, suggestion_id) values (v_user, p_suggestion_id);
  elsif p_vote = -1 then
    insert into public.suggestion_downvotes (user_id, suggestion_id) values (v_user, p_suggestion_id);
  end if;

  select count(*)::integer into v_up   from public.suggestion_emphasizes where suggestion_id = p_suggestion_id;
  select count(*)::integer into v_down from public.suggestion_downvotes  where suggestion_id = p_suggestion_id;

  update public.suggestions
     set emphasize_count = v_up,
         downvote_count  = v_down,
         is_hidden       = is_hidden or (v_down >= 6 and v_down > v_up)
   where id = p_suggestion_id;

  return query select p_vote, v_up, v_down;
end;
$$;

-- ── 4. Replies ──────────────────────────────────────────────────────────────

create table if not exists public.suggestion_replies (
  id            uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  content       text not null,
  university    text not null,
  flag_count    integer not null default 0,
  is_hidden     boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint suggestion_replies_content_length check (char_length(content) between 1 and 200)
);
create index if not exists suggestion_replies_by_post on public.suggestion_replies (suggestion_id, created_at);
alter table public.suggestion_replies enable row level security;
drop policy if exists "read own university replies" on public.suggestion_replies;
create policy "read own university replies" on public.suggestion_replies for select to authenticated
  using (
    is_hidden = false
    and university = (select coalesce(university, 'brandeis') from public.profiles where id = auth.uid())
  );

create table if not exists public.suggestion_reply_flags (
  user_id    uuid not null references auth.users(id) on delete cascade,
  reply_id   uuid not null references public.suggestion_replies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, reply_id)
);
alter table public.suggestion_reply_flags enable row level security;
drop policy if exists "own reply flags" on public.suggestion_reply_flags;
create policy "own reply flags" on public.suggestion_reply_flags for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.submit_reply(p_suggestion_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_uni  text;
  v_id   uuid;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  select coalesce(university, 'brandeis') into v_uni from public.profiles where id = v_user;
  if not exists (
    select 1 from public.suggestions where id = p_suggestion_id and is_hidden = false and university = v_uni
  ) then raise exception 'not found'; end if;

  insert into public.suggestion_replies (suggestion_id, content, university)
    values (p_suggestion_id, trim(p_content), v_uni)
    returning id into v_id;

  update public.suggestions
     set reply_count = (select count(*) from public.suggestion_replies where suggestion_id = p_suggestion_id and is_hidden = false)
   where id = p_suggestion_id;
  return v_id;
end;
$$;

create or replace function public.flag_reply(p_reply_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_count integer;
  v_post  uuid;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  insert into public.suggestion_reply_flags (user_id, reply_id) values (v_user, p_reply_id) on conflict do nothing;
  select count(*)::integer into v_count from public.suggestion_reply_flags where reply_id = p_reply_id;
  update public.suggestion_replies
     set flag_count = v_count, is_hidden = is_hidden or v_count >= 3
   where id = p_reply_id
   returning suggestion_id into v_post;
  update public.suggestions
     set reply_count = (select count(*) from public.suggestion_replies where suggestion_id = v_post and is_hidden = false)
   where id = v_post;
  return v_count;
end;
$$;

grant execute on function public.cast_vote(uuid, smallint)  to authenticated;
grant execute on function public.submit_reply(uuid, text)   to authenticated;
grant execute on function public.flag_reply(uuid)           to authenticated;
