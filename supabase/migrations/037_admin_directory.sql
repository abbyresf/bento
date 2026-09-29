-- Put names on the admin list.
--
-- The Admins panel rendered "Super admin" and "Admin" with a date and nothing
-- else, because admin_users holds a user_id and no email. The email lives in
-- auth.users, which no client role can read, so there was no way to tell who
-- had actually joined — which is the entire question that screen exists to
-- answer.
--
-- A SECURITY DEFINER function joins the two and is guarded to super admins of
-- the university being asked about. Denormalising the email onto admin_users
-- was the alternative and was rejected: it would have gone stale the moment
-- someone changed their address, and left a second copy of personal data to
-- keep in step.

create or replace function public.get_university_admins(p_university text)
returns table (
  id            uuid,
  user_id       uuid,
  email         text,
  university    text,
  is_active     boolean,
  is_super_admin boolean,
  created_at    timestamptz,
  last_sign_in_at timestamptz,
  is_self       boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;

  -- Only a super admin of that university may see its roster. Reuses the
  -- helper from migration 036, which exists precisely so a check like this
  -- does not re-enter admin_users' own policies.
  if not public.is_super_admin_of(p_university) then
    raise exception 'unauthorized';
  end if;

  return query
    select
      a.id,
      a.user_id,
      u.email::text,
      a.university,
      a.is_active,
      a.is_super_admin,
      a.created_at,
      u.last_sign_in_at,
      (a.user_id = auth.uid()) as is_self
    from public.admin_users a
    join auth.users u on u.id = a.user_id
   where a.university = p_university
   order by a.is_super_admin desc, a.created_at asc;
end;
$$;

revoke all on function public.get_university_admins(text) from public, anon;
grant execute on function public.get_university_admins(text) to authenticated;

comment on function public.get_university_admins(text) is
  'Admin roster for one university, including email and last sign-in. Super admins of that university only.';
