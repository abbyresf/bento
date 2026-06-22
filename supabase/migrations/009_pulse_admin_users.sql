-- Bento Pulse: admin accounts scoped to a university.

CREATE TABLE IF NOT EXISTS admin_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  university  text NOT NULL,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can read own record"
ON admin_users FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Admins can read profiles for their own university
CREATE POLICY "admin can read university profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  university = (
    SELECT university FROM admin_users
    WHERE user_id = (SELECT auth.uid()) AND is_active = true
  )
);

-- Admins can read meal history for their university (via profiles join)
CREATE POLICY "admin can read university meal history"
ON meal_history FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users a
    JOIN profiles p ON p.id = meal_history.user_id
    WHERE a.user_id = (SELECT auth.uid())
    AND a.is_active = true
    AND p.university = a.university
  )
);

-- Admins can read dietary restrictions for their university
CREATE POLICY "admin can read university dietary restrictions"
ON dietary_restrictions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users a
    JOIN profiles p ON p.id = dietary_restrictions.user_id
    WHERE a.user_id = (SELECT auth.uid())
    AND a.is_active = true
    AND p.university = a.university
  )
);
