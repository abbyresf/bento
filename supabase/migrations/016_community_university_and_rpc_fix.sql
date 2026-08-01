-- Fix community feature:
--
-- 1. All three RPCs (submit_suggestion, toggle_emphasize, flag_suggestion) were
--    SECURITY INVOKER but the suggestions table had no INSERT/UPDATE RLS policies,
--    so every write was silently blocked. Rebuild them as SECURITY DEFINER — each
--    function still validates auth.uid() before doing anything.
--
-- 2. Add a `university` column so suggestions are scoped to a school. The RLS
--    SELECT policy now enforces that users only see their own school's posts.
--    submit_suggestion reads the caller's university from their profile.

-- ── 1. Add university column ──────────────────────────────────────────────────

ALTER TABLE public.suggestions
  ADD COLUMN IF NOT EXISTS university TEXT NOT NULL DEFAULT 'brandeis';

-- ── 2. Tighten SELECT policy ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "public read suggestions" ON public.suggestions;

CREATE POLICY "read own university suggestions"
  ON public.suggestions FOR SELECT
  TO authenticated
  USING (
    is_hidden = false
    AND university = (
      SELECT COALESCE(university, 'brandeis')
        FROM public.profiles
       WHERE id = auth.uid()
    )
  );

-- ── 3. submit_suggestion — SECURITY DEFINER, stamps university ────────────────

CREATE OR REPLACE FUNCTION public.submit_suggestion(p_content TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id         UUID;
  v_university TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT COALESCE(university, 'brandeis')
    INTO v_university
    FROM public.profiles
   WHERE id = auth.uid();

  INSERT INTO public.suggestions (content, university)
    VALUES (trim(p_content), v_university)
    RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── 4. toggle_emphasize — SECURITY DEFINER so it can UPDATE suggestions ───────

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

-- ── 5. flag_suggestion — SECURITY DEFINER so it can UPDATE suggestions ────────

CREATE OR REPLACE FUNCTION public.flag_suggestion(p_suggestion_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  UPDATE public.suggestions
     SET flag_count = flag_count + 1
   WHERE id = p_suggestion_id AND is_hidden = false;
END;
$$;
