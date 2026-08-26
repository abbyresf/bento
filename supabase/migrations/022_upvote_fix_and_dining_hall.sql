-- 022: Fix community upvotes + add dining_hall tracking on ratings
--
-- 1. Re-create toggle_emphasize as SECURITY DEFINER so the UPDATE on suggestions
--    succeeds even though authenticated users have no UPDATE RLS policy on that
--    table. Migration 016 did this, but re-applying idempotently is safe.
--
-- 2. Add dining_hall column to item_ratings so the community leaderboard can
--    show which dining hall a dish is from.
--
-- 3. Rebuild item_rating_aggregates view to surface dining_hall when consistent
--    across all ratings for an item (null when rated from multiple halls).

-- ── 1. toggle_emphasize — guaranteed SECURITY DEFINER ────────────────────────

CREATE OR REPLACE FUNCTION public.toggle_emphasize(p_suggestion_id UUID)
RETURNS TABLE(emphasized BOOLEAN, emphasize_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_exists BOOLEAN;
  v_count  INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.suggestion_emphasizes
     WHERE user_id = auth.uid() AND suggestion_id = p_suggestion_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.suggestion_emphasizes
     WHERE user_id = auth.uid() AND suggestion_id = p_suggestion_id;

    UPDATE public.suggestions
       SET emphasize_count = GREATEST(0, emphasize_count - 1)
     WHERE id = p_suggestion_id
     RETURNING emphasize_count INTO v_count;

    RETURN QUERY SELECT false, v_count;
  ELSE
    INSERT INTO public.suggestion_emphasizes (user_id, suggestion_id)
      VALUES (auth.uid(), p_suggestion_id)
      ON CONFLICT DO NOTHING;

    UPDATE public.suggestions
       SET emphasize_count = emphasize_count + 1
     WHERE id = p_suggestion_id
     RETURNING emphasize_count INTO v_count;

    RETURN QUERY SELECT true, v_count;
  END IF;
END;
$$;

-- ── 2. dining_hall column ────────────────────────────────────────────────────

ALTER TABLE public.item_ratings
  ADD COLUMN IF NOT EXISTS dining_hall TEXT;

-- ── 3. Rebuild aggregates view with dining_hall ───────────────────────────────
-- dining_hall is non-null only when all ratings for an item came from exactly
-- one hall — the common case. Mixed-hall items get null (no label shown).

DROP VIEW IF EXISTS public.item_rating_aggregates;

CREATE VIEW public.item_rating_aggregates AS
SELECT
  item_id,
  MIN(item_name)                                                          AS item_name,
  university,
  ROUND(AVG(rating)::NUMERIC, 1)                                          AS avg_rating,
  COUNT(*)::INTEGER                                                        AS rating_count,
  CASE
    WHEN COUNT(DISTINCT dining_hall) FILTER (WHERE dining_hall IS NOT NULL) = 1
    THEN MIN(dining_hall) FILTER (WHERE dining_hall IS NOT NULL)
    ELSE NULL
  END                                                                      AS dining_hall
FROM public.item_ratings
GROUP BY item_id, university;
