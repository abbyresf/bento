-- Community feature: food ratings + anonymous suggestion box.

-- ── item_ratings ──────────────────────────────────────────────────────────────
-- One row per (user, item). item_id is the string from the menu parser (bh_<id>).
-- item_name stored denormalized so we can display it without a menu join.

CREATE TABLE IF NOT EXISTS public.item_ratings (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id    TEXT        NOT NULL,
  item_name  TEXT        NOT NULL,
  rating     SMALLINT    NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id),
  CONSTRAINT item_ratings_rating_range CHECK (rating BETWEEN 1 AND 5)
);

ALTER TABLE public.item_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own ratings"
  ON public.item_ratings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Aggregate view: avg + count per item. Used for the leaderboard and badge logic.
CREATE OR REPLACE VIEW public.item_rating_aggregates AS
SELECT
  item_id,
  MIN(item_name)               AS item_name,
  ROUND(AVG(rating)::NUMERIC, 1) AS avg_rating,
  COUNT(*)::INTEGER            AS rating_count
FROM public.item_ratings
GROUP BY item_id;

-- ── suggestions ───────────────────────────────────────────────────────────────
-- No user_id — fully anonymous. Content inserted via RPC to enforce anonymity.

CREATE TABLE IF NOT EXISTS public.suggestions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content         TEXT        NOT NULL,
  emphasize_count INTEGER     NOT NULL DEFAULT 0,
  flag_count      INTEGER     NOT NULL DEFAULT 0,
  is_hidden       BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT suggestions_content_length CHECK (char_length(content) BETWEEN 1 AND 300)
);

ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

-- Students can read non-hidden suggestions
CREATE POLICY "public read suggestions"
  ON public.suggestions FOR SELECT
  USING (is_hidden = false);

-- ── suggestion_emphasizes ─────────────────────────────────────────────────────
-- Tracks which user emphasized which suggestion (one per user).
-- Does NOT reveal who *wrote* the suggestion.

CREATE TABLE IF NOT EXISTS public.suggestion_emphasizes (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestion_id UUID NOT NULL REFERENCES public.suggestions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, suggestion_id)
);

ALTER TABLE public.suggestion_emphasizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own emphasizes"
  ON public.suggestion_emphasizes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── RPCs ──────────────────────────────────────────────────────────────────────

-- submit_suggestion: inserts without any user_id to guarantee anonymity.
CREATE OR REPLACE FUNCTION public.submit_suggestion(p_content TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO public.suggestions (content) VALUES (trim(p_content)) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- toggle_emphasize: atomically flips emphasize on/off, keeps count in sync.
CREATE OR REPLACE FUNCTION public.toggle_emphasize(p_suggestion_id UUID)
RETURNS TABLE(emphasized BOOLEAN, emphasize_count INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
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

-- flag_suggestion: anonymous flag — just increments counter, no user stored.
CREATE OR REPLACE FUNCTION public.flag_suggestion(p_suggestion_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.suggestions
  SET flag_count = flag_count + 1
  WHERE id = p_suggestion_id AND is_hidden = false;
END;
$$;
