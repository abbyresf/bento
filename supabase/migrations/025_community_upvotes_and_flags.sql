-- 025: Make upvotes persist, and make flags per-user.
--
-- Two separate bugs, with the same underlying shape: public.suggestions has a
-- SELECT policy and no UPDATE policy, so any UPDATE run as the calling user
-- matches zero rows. RLS reports no error for that — the statement simply
-- affects nothing — so toggle_emphasize appeared to succeed while the count
-- never moved, and RETURNING handed back NULL. flag_suggestion was already
-- SECURITY DEFINER, which is why flag counts reached the admin dashboard and
-- emphasize counts did not.
--
-- Rather than open an UPDATE policy on suggestions (which would let a client
-- write any count it liked), both writers stay SECURITY DEFINER and the counts
-- are derived from the underlying rows.

-- ── 1. suggestion_flags: record who flagged what ─────────────────────────────
-- Without this there is no way to know whether you have already flagged a
-- suggestion, so the flag never stayed lit after a reload, and one person
-- could raise flag_count without limit by tapping repeatedly.

CREATE TABLE IF NOT EXISTS public.suggestion_flags (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestion_id UUID NOT NULL REFERENCES public.suggestions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, suggestion_id)
);

ALTER TABLE public.suggestion_flags ENABLE ROW LEVEL SECURITY;

-- Mirrors the "own emphasizes" policy: you can see and manage only your own
-- flags, so flagging stays private from other students.
DROP POLICY IF EXISTS "own flags" ON public.suggestion_flags;
CREATE POLICY "own flags"
  ON public.suggestion_flags FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 2. toggle_emphasize ──────────────────────────────────────────────────────
-- SECURITY DEFINER so the UPDATE on suggestions actually applies. The count is
-- recomputed from suggestion_emphasizes rather than incremented, so any drift
-- left behind while the UPDATE was silently failing is corrected the next time
-- someone votes.
--
-- Both functions are dropped before being recreated: CREATE OR REPLACE cannot
-- change a function's return type, and flag_suggestion previously returned
-- VOID. Dropping also discards their grants, which are reissued at the end.

DROP FUNCTION IF EXISTS public.toggle_emphasize(UUID);
DROP FUNCTION IF EXISTS public.flag_suggestion(UUID);

CREATE FUNCTION public.toggle_emphasize(p_suggestion_id UUID)
RETURNS TABLE(emphasized BOOLEAN, emphasize_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user  UUID := auth.uid();
  v_now   BOOLEAN;
  v_count INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.suggestion_emphasizes
     WHERE user_id = v_user AND suggestion_id = p_suggestion_id
  ) THEN
    DELETE FROM public.suggestion_emphasizes
     WHERE user_id = v_user AND suggestion_id = p_suggestion_id;
    v_now := false;
  ELSE
    INSERT INTO public.suggestion_emphasizes (user_id, suggestion_id)
      VALUES (v_user, p_suggestion_id)
      ON CONFLICT DO NOTHING;
    v_now := true;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count
    FROM public.suggestion_emphasizes
   WHERE suggestion_id = p_suggestion_id;

  UPDATE public.suggestions
     SET emphasize_count = v_count
   WHERE id = p_suggestion_id;

  RETURN QUERY SELECT v_now, v_count;
END;
$$;

-- ── 3. flag_suggestion ───────────────────────────────────────────────────────
-- Now idempotent per user: flagging twice does nothing the second time, and
-- the stored count reflects distinct people rather than taps.

CREATE FUNCTION public.flag_suggestion(p_suggestion_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user  UUID := auth.uid();
  v_count INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  INSERT INTO public.suggestion_flags (user_id, suggestion_id)
    VALUES (v_user, p_suggestion_id)
    ON CONFLICT DO NOTHING;

  SELECT COUNT(*)::INTEGER INTO v_count
    FROM public.suggestion_flags
   WHERE suggestion_id = p_suggestion_id;

  UPDATE public.suggestions
     SET flag_count = v_count
   WHERE id = p_suggestion_id;

  RETURN v_count;
END;
$$;

-- ── 4. Backfill counts that drifted while the UPDATE was failing ─────────────

UPDATE public.suggestions s
   SET emphasize_count = COALESCE((
     SELECT COUNT(*) FROM public.suggestion_emphasizes e WHERE e.suggestion_id = s.id
   ), 0);

GRANT EXECUTE ON FUNCTION public.toggle_emphasize(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flag_suggestion(UUID)  TO authenticated;
