-- Fixes a lockout introduced by migration 035.
--
-- 035 added two policies ON admin_users whose USING clause queried
-- admin_users. Postgres applies row level security to that inner query too,
-- which re-evaluates the same policy, so every read of admin_users raised:
--
--   42P17  infinite recursion detected in policy for relation "admin_users"
--
-- getAdminRecord() runs exactly that query the moment someone signs in to
-- Pulse, so the error surfaced as "your account doesn't have admin access"
-- and an immediate sign-out. Every Pulse admin was locked out, including the
-- super admin, which also removed the route to fix it through the UI.
--
-- It cascaded further than admin_users: the "super admin read invites" policy
-- on pulse_invites subqueries admin_users, so listing invites recursed as well.
--
-- The fix is the standard one. A SECURITY DEFINER function runs as its owner
-- and therefore does not re-enter RLS, which breaks the cycle. Policies call
-- the function instead of embedding a subquery over their own table.

-- ── Helpers ────────────────────────────────────────────────────────────────

-- Is the caller an active super admin for this university?
create or replace function public.is_super_admin_of(p_university text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.admin_users a
     where a.user_id = auth.uid()
       and a.is_super_admin = true
       and a.is_active = true
       and a.university = p_university
  );
$$;

-- Is the caller an active super admin anywhere? Used by policies on other
-- tables that only need the role, not the university.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.admin_users a
     where a.user_id = auth.uid()
       and a.is_super_admin = true
       and a.is_active = true
  );
$$;

revoke all on function public.is_super_admin_of(text) from public, anon;
revoke all on function public.is_super_admin()        from public, anon;
grant execute on function public.is_super_admin_of(text) to authenticated;
grant execute on function public.is_super_admin()        to authenticated;

-- ── Rebuild the policies 035 got wrong ─────────────────────────────────────

drop policy if exists "super admin read university admins"   on public.admin_users;
drop policy if exists "super admin manage university admins" on public.admin_users;

-- Migration 009's "admin can read own record" is what kept sign-in working
-- once the recursive policies were dropped. Recreated here so this migration
-- is sufficient on its own and does not depend on 009 having survived.
drop policy if exists "admin can read own record" on public.admin_users;
create policy "admin can read own record"
  on public.admin_users for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- A super admin sees the admins they manage. No subquery over admin_users, so
-- no recursion.
create policy "super admin read university admins"
  on public.admin_users for select
  to authenticated
  using (public.is_super_admin_of(university));

-- And can enable or disable them. Still cannot touch their own row, so the
-- last super admin cannot strand everyone.
create policy "super admin manage university admins"
  on public.admin_users for update
  to authenticated
  using (
    user_id <> (select auth.uid())
    and public.is_super_admin_of(university)
  )
  with check (
    user_id <> (select auth.uid())
    and public.is_super_admin_of(university)
  );

-- ── pulse_invites: same treatment ──────────────────────────────────────────
--
-- This policy did not recurse by itself, but it subqueries admin_users and so
-- inherited the recursion from there. Routed through the helper so the two can
-- never be coupled like that again.
drop policy if exists "super admin read invites" on public.pulse_invites;
create policy "super admin read invites"
  on public.pulse_invites for select
  to authenticated
  using (public.is_super_admin());

-- Revoking an invite is the one write the dashboard performs directly; every
-- other invite mutation goes through an Edge Function under the service role.
drop policy if exists "super admin revoke invites" on public.pulse_invites;
create policy "super admin revoke invites"
  on public.pulse_invites for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
