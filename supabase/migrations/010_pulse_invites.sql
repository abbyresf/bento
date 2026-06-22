-- Bento Pulse: invite-based admin onboarding

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS pulse_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  university  text NOT NULL,
  used_at     timestamptz,
  expires_at  timestamptz DEFAULT now() + interval '7 days',
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE pulse_invites ENABLE ROW LEVEL SECURITY;

-- Super admins can create invites
CREATE POLICY "super admin insert invites"
ON pulse_invites FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE user_id = auth.uid() AND is_super_admin = true AND is_active = true
  )
);

-- Super admins can read all invites
CREATE POLICY "super admin read invites"
ON pulse_invites FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE user_id = auth.uid() AND is_super_admin = true AND is_active = true
  )
);

-- Unauthenticated users can read a specific unused, unexpired invite by its UUID
-- (the UUID itself is the secret — 128 bits of entropy, unguessable)
CREATE POLICY "public read valid invite"
ON pulse_invites FOR SELECT
TO anon
USING (used_at IS NULL AND expires_at > now());
