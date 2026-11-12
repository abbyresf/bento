-- 078: Feed moderators (Loud pilot). Builds on 072, 073 and 074.
--
-- A moderator can remove or restore any Campus post or reply, at any school, from bentodining.com/moderator. Removing sets
-- is_hidden, the same flag the automatic hides use, so nothing is deleted and a removal can be undone. Restoring sets
-- reviewed_ok, which keeps later reports from hiding the item again.
--
-- Nobody is a moderator until added by hand in the SQL editor:
--   insert into public.feed_moderators (user_id) select id from auth.users where email = '<email>';
-- To remove one:
--   delete from public.feed_moderators where user_id = (select id from auth.users where email = '<email>');
--
-- Posts and replies carry no author, so moderators never see who wrote anything.

-- ── 1. Who moderates ────────────────────────────────────────────────────────

create table if not exists public.feed_moderators (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.feed_moderators enable row level security;
-- No policies: clients cannot read or write this table. is_feed_moderator() answers for the caller only.

create or replace function public.is_feed_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.feed_moderators where user_id = auth.uid());
$$;

-- ── 2. Replies can be cleared like posts ────────────────────────────────────

alter table public.suggestion_replies
  add column if not exists reviewed_ok boolean not null default false;

-- Same as 072, except a reply a moderator restored stays up.
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
     set flag_count = v_count, is_hidden = is_hidden or (v_count >= 3 and not reviewed_ok)
   where id = p_reply_id
   returning suggestion_id into v_post;
  update public.suggestions
     set reply_count = (select count(*) from public.suggestion_replies where suggestion_id = v_post and is_hidden = false)
   where id = v_post;
  return v_count;
end;
$$;

-- ── 3. Remove and restore ───────────────────────────────────────────────────

create or replace function public.mod_set_post_hidden(p_suggestion_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_feed_moderator() then raise exception 'forbidden'; end if;
  update public.suggestions
     set is_hidden   = p_hidden,
         reviewed_ok = not p_hidden
   where id = p_suggestion_id;
  if not found then raise exception 'not found'; end if;
end;
$$;

create or replace function public.mod_set_reply_hidden(p_reply_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post uuid;
begin
  if not public.is_feed_moderator() then raise exception 'forbidden'; end if;
  update public.suggestion_replies
     set is_hidden   = p_hidden,
         reviewed_ok = not p_hidden
   where id = p_reply_id
   returning suggestion_id into v_post;
  if v_post is null then raise exception 'not found'; end if;
  update public.suggestions
     set reply_count = (select count(*) from public.suggestion_replies where suggestion_id = v_post and is_hidden = false)
   where id = v_post;
end;
$$;

-- ── 4. The moderation queue ─────────────────────────────────────────────────
-- Recent posts and replies at every school (or one, if p_university is set), hidden ones included, so a moderator
-- can see what was reported and what the automatic rules already took down. p_before pages back through older items.

create or replace function public.mod_feed_items(
  p_university text default null, p_limit integer default 200, p_before timestamptz default null
)
returns table(
  kind        text,
  id          uuid,
  post_id     uuid,
  post_text   text,
  content     text,
  university  text,
  flag_count  integer,
  downvotes   integer,
  is_hidden   boolean,
  reviewed_ok boolean,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_feed_moderator() then raise exception 'forbidden'; end if;
  return query
    select q.k, q.i, q.pid, q.ptxt, q.txt, q.uni, q.flags, q.downs, q.hid, q.ok, q.at
      from (
        select 'post'::text as k, s.id as i, s.id as pid, null::text as ptxt, s.content as txt, s.university as uni,
               s.flag_count as flags, s.downvote_count as downs, s.is_hidden as hid, s.reviewed_ok as ok, s.created_at as at
          from public.suggestions s
         where (p_university is null or s.university = p_university)
           and (p_before is null or s.created_at < p_before)
        union all
        select 'reply'::text, r.id, r.suggestion_id, s.content, r.content, r.university,
               r.flag_count, 0, r.is_hidden, r.reviewed_ok, r.created_at
          from public.suggestion_replies r
          join public.suggestions s on s.id = r.suggestion_id
         where (p_university is null or r.university = p_university)
           and (p_before is null or r.created_at < p_before)
      ) q
     order by q.at desc
    limit least(greatest(p_limit, 1), 500);
end;
$$;

revoke execute on function public.is_feed_moderator()                     from public, anon;
revoke execute on function public.mod_set_post_hidden(uuid, boolean)      from public, anon;
revoke execute on function public.mod_set_reply_hidden(uuid, boolean)     from public, anon;
revoke execute on function public.mod_feed_items(text, integer, timestamptz)           from public, anon;
grant  execute on function public.is_feed_moderator()                     to authenticated;
grant  execute on function public.mod_set_post_hidden(uuid, boolean)      to authenticated;
grant  execute on function public.mod_set_reply_hidden(uuid, boolean)     to authenticated;
grant  execute on function public.mod_feed_items(text, integer, timestamptz)           to authenticated;
grant  execute on function public.flag_reply(uuid)                        to authenticated;
