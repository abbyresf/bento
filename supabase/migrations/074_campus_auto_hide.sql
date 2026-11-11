-- 074: Simple Campus moderation (Loud pilot). Builds on 025 and 072.
--
-- A post is hidden once 3 different students in its school report it, the same rule replies already follow (072).
-- Nobody has to be watching for that to work.
--
-- To bring back a post that was hidden by mistake, run in the SQL editor:
--   update public.suggestions set is_hidden = false, reviewed_ok = true where id = '<post id>';
-- reviewed_ok keeps later reports from hiding it again. To find what is hidden:
--   select id, content, flag_count, created_at from public.suggestions where is_hidden order by created_at desc;

alter table public.suggestions
  add column if not exists reviewed_ok boolean not null default false;

create or replace function public.flag_suggestion(p_suggestion_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  -- Only a post the caller can see: not hidden, from their own school.
  if not exists (
    select 1 from public.suggestions s
     where s.id = p_suggestion_id and s.is_hidden = false
       and s.university = (select coalesce(university, 'brandeis') from public.profiles where id = v_user)
  ) then raise exception 'not found'; end if;

  insert into public.suggestion_flags (user_id, suggestion_id)
    values (v_user, p_suggestion_id)
    on conflict do nothing;

  select count(*)::integer into v_count from public.suggestion_flags where suggestion_id = p_suggestion_id;

  update public.suggestions
     set flag_count = v_count,
         is_hidden  = is_hidden or (v_count >= 3 and not reviewed_ok)
   where id = p_suggestion_id;

  return v_count;
end;
$$;

grant execute on function public.flag_suggestion(uuid) to authenticated;
