-- Rebuild the Pulse invite flow.
--
-- The old design had two exploitable flaws.
--
-- 1. Anyone could list every pending invite. The anon SELECT policy was
--    `USING (used_at is null and expires_at > now())` with no row restriction,
--    so the public anon key returned id, email and university for every open
--    invite. Migration 010's comment said "the UUID itself is the secret", but
--    the policy never required knowing it. Migration 014 believed it had fixed
--    this and recreated the identical policy, changing nothing. Verified live
--    on 29 Sep 2026 by planting a pending invite and reading it back with the
--    anon key: one row, email included.
--
--    The consequence was full privilege escalation. Poll the table, take the
--    id of a fresh invite, redeem it at /admin/join/<id> before the real
--    invitee, and you hold a Pulse admin account for that university with
--    access to every student's dietary and meal data.
--
-- 2. The primary key doubled as the bearer token, so the secret was stored in
--    plaintext in a table several roles could read.
--
-- The fix is the standard one. A random token is generated at send time, only
-- its SHA-256 hash is stored, and the plaintext exists solely inside the email.
-- The table is closed to clients entirely: validation and redemption go through
-- Edge Functions running as the service role.

-- ── Token, revocation, longer expiry ───────────────────────────────────────

alter table public.pulse_invites
  add column if not exists token_hash text,
  add column if not exists revoked_at timestamptz,
  add column if not exists last_sent_at timestamptz;

-- A given token may exist once. Partial, because rows predating this migration
-- have no hash and must not collide with each other on null.
create unique index if not exists pulse_invites_token_hash_key
  on public.pulse_invites (token_hash)
  where token_hash is not null;

-- 24 hours was too short to be usable. An invite nobody opened overnight was
-- dead, and there was no resend. Slack, Linear, Notion and GitHub all sit at a
-- week or more.
alter table public.pulse_invites
  alter column expires_at set default now() + interval '7 days';

comment on column public.pulse_invites.token_hash is
  'SHA-256 of the invite token. The plaintext token is emailed and never stored.';
comment on column public.pulse_invites.revoked_at is
  'Set when an admin cancels an invite. A revoked invite can never be redeemed.';

-- ── Close the table to clients ─────────────────────────────────────────────
--
-- No anon access at all. The join page now asks validate-invite, which runs as
-- the service role and returns only the university and a masked email.
drop policy if exists "public read valid invite" on public.pulse_invites;

-- Super admins keep read access, because the dashboard lists invites and their
-- status. Writes go through Edge Functions, so no insert or update policy is
-- granted to any client role.
drop policy if exists "super admin read invites" on public.pulse_invites;
create policy "super admin read invites"
  on public.pulse_invites for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_users
       where user_id = (select auth.uid())
         and is_super_admin = true
         and is_active = true
    )
  );

-- The insert policy was dead weight: send-invite uses the service role, which
-- bypasses RLS, and it performs its own super-admin check. Removing it means
-- there is exactly one way to create an invite.
drop policy if exists "super admin insert invites" on public.pulse_invites;

-- ── Admin management ───────────────────────────────────────────────────────
--
-- `is_active` has existed since migration 009 with nothing able to change it.
-- A super admin can now deactivate an admin at their own university, which is
-- how access is removed when someone leaves. Reactivation uses the same policy.
--
-- Deliberately narrow: a super admin cannot deactivate themselves, which stops
-- the last administrator locking everyone out, and cannot touch another
-- university's admins unless they are a super admin there too.
drop policy if exists "super admin manage university admins" on public.admin_users;
create policy "super admin manage university admins"
  on public.admin_users for update
  to authenticated
  using (
    user_id <> (select auth.uid())
    and exists (
      select 1 from public.admin_users me
       where me.user_id = (select auth.uid())
         and me.is_super_admin = true
         and me.is_active = true
         and me.university = public.admin_users.university
    )
  )
  with check (
    user_id <> (select auth.uid())
    and exists (
      select 1 from public.admin_users me
       where me.user_id = (select auth.uid())
         and me.is_super_admin = true
         and me.is_active = true
         and me.university = public.admin_users.university
    )
  );

-- Super admins can see the admins they manage, not only their own row.
drop policy if exists "super admin read university admins" on public.admin_users;
create policy "super admin read university admins"
  on public.admin_users for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_users me
       where me.user_id = (select auth.uid())
         and me.is_super_admin = true
         and me.is_active = true
         and me.university = public.admin_users.university
    )
  );

-- ── Retire the old rows ────────────────────────────────────────────────────
--
-- Every pre-existing invite was addressable by its primary key, which is now
-- treated as public knowledge. None can be redeemed under the new functions
-- anyway, since they have no token_hash, but they are marked revoked so the
-- dashboard shows an honest status rather than "pending" forever.
update public.pulse_invites
   set revoked_at = now()
 where token_hash is null
   and used_at is null
   and revoked_at is null;
