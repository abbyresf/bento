-- Admin suggestions RPC.
--
-- The suggestions RLS SELECT policy (added in 016) filters by profiles.university,
-- but pulse admins are in admin_users — they have no profiles row. Without this RPC
-- the admin dashboard would see zero suggestions.
--
-- get_admin_suggestions is SECURITY DEFINER so it bypasses the user-facing RLS,
-- but it still validates the caller is an active admin for the requested university
-- (or is_super_admin) before returning anything.

CREATE OR REPLACE FUNCTION public.get_admin_suggestions(
  p_university TEXT,
  p_days       INT DEFAULT NULL
)
RETURNS TABLE(
  id              UUID,
  content         TEXT,
  emphasize_count INTEGER,
  flag_count      INTEGER,
  created_at      TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_super BOOLEAN;
  v_uni      TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT a.university, a.is_super_admin
    INTO v_uni, v_is_super
    FROM public.admin_users a
   WHERE a.user_id = auth.uid()
     AND a.is_active = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT v_is_super AND v_uni != p_university THEN RAISE EXCEPTION 'unauthorized'; END IF;

  RETURN QUERY
  SELECT s.id, s.content, s.emphasize_count, s.flag_count, s.created_at
    FROM public.suggestions s
   WHERE s.is_hidden = false
     AND s.university = p_university
     AND (
       p_days IS NULL
       OR s.created_at >= NOW() - (p_days || ' days')::INTERVAL
     )
   ORDER BY s.emphasize_count DESC
   LIMIT 10;
END;
$$;
