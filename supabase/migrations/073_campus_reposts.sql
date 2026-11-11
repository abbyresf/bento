-- 073: Reposts and quote posts on the Campus feed (Loud pilot). Builds on 072.
--
-- A repost is anonymous like everything on Campus: it raises the post's repost_count (and its place in Hot) and is
-- remembered per person only so they can undo it. Nobody can see who reposted.
-- A quote is a new post that carries the original inside it: suggestions.quote_of points at the original. If the
-- original is later hidden or deleted, the quote stays and simply loses the attachment.
--
-- Writers are SECURITY DEFINER and recount from rows, the same pattern as 025 and 072.

alter table public.suggestions
  add column if not exists repost_count integer not null default 0,
  add column if not exists quote_of     uuid references public.suggestions(id) on delete set null;

create table if not exists public.suggestion_reposts (
  user_id       uuid not null references auth.users(id) on delete cascade,
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, suggestion_id)
);
alter table public.suggestion_reposts enable row level security;
drop policy if exists "own reposts" on public.suggestion_reposts;
create policy "own reposts" on public.suggestion_reposts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Repost, or undo a repost. Only posts the caller can see: not hidden, from their own school.
create or replace function public.toggle_repost(p_suggestion_id uuid)
returns table(reposted boolean, repost_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_now   boolean;
  v_count integer;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if not exists (
    select 1 from public.suggestions s
     where s.id = p_suggestion_id and s.is_hidden = false
       and s.university = (select coalesce(university, 'brandeis') from public.profiles where id = v_user)
  ) then raise exception 'not found'; end if;

  if exists (select 1 from public.suggestion_reposts where user_id = v_user and suggestion_id = p_suggestion_id) then
    delete from public.suggestion_reposts where user_id = v_user and suggestion_id = p_suggestion_id;
    v_now := false;
  else
    insert into public.suggestion_reposts (user_id, suggestion_id) values (v_user, p_suggestion_id);
    v_now := true;
  end if;

  select count(*)::integer into v_count from public.suggestion_reposts where suggestion_id = p_suggestion_id;
  update public.suggestions set repost_count = v_count where id = p_suggestion_id;
  return query select v_now, v_count;
end;
$$;

-- A quote post: anonymous, stamped with the caller's school, pointing at a post they can see.
create or replace function public.submit_quote(p_quote_of uuid, p_content text)
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
    select 1 from public.suggestions where id = p_quote_of and is_hidden = false and university = v_uni
  ) then raise exception 'not found'; end if;

  insert into public.suggestions (content, university, quote_of)
    values (trim(p_content), v_uni, p_quote_of)
    returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.toggle_repost(uuid)      to authenticated;
grant execute on function public.submit_quote(uuid, text) to authenticated;
