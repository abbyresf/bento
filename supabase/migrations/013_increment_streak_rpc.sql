-- Replaces 3 sequential client round-trips with a single Postgres function:
--   1. getStreak()
--   2. getDiningAvailabilityMap(gapDates)
--   3. streaks.upsert()
-- Returns one row on success, empty set if date is already confirmed (no-op).

CREATE OR REPLACE FUNCTION public.increment_streak(p_user_id UUID, p_date DATE)
RETURNS TABLE(current_streak INTEGER, longest_streak INTEGER, prev_longest INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_current INTEGER := 0;
  v_longest INTEGER := 0;
  v_last    DATE;
  v_days    INTEGER;
  v_new     INTEGER;
  v_missed  INTEGER;
  v_day     DATE;
  v_avail   BOOLEAN;
BEGIN
  -- Prevent users from updating anyone else's streak
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT s.current_streak, s.longest_streak, s.last_confirmed_date
  INTO v_current, v_longest, v_last
  FROM public.streaks s
  WHERE s.user_id = p_user_id;

  -- No-op: already confirmed this date, or date is before last confirmed
  IF v_last = p_date OR (v_last IS NOT NULL AND p_date < v_last) THEN
    RETURN;
  END IF;

  v_new := 1;

  IF v_last IS NOT NULL THEN
    v_days := p_date - v_last;

    IF v_days = 1 THEN
      v_new := COALESCE(v_current, 0) + 1;
    ELSIF v_days >= 2 THEN
      -- Count gap days where dining was open (or has no record — conservative default)
      v_missed := 0;
      v_day := v_last + 1;
      WHILE v_day < p_date LOOP
        SELECT da.any_open INTO v_avail
        FROM public.dining_availability da
        WHERE da.date = v_day;

        -- NOT FOUND = no record = assume open; any_open != false = open
        IF NOT FOUND OR v_avail IS DISTINCT FROM false THEN
          v_missed := v_missed + 1;
        END IF;
        v_day := v_day + 1;
      END LOOP;

      -- One missed dining day allowed (streak freeze); two or more resets
      v_new := CASE WHEN v_missed <= 1 THEN COALESCE(v_current, 0) + 1 ELSE 1 END;
    END IF;
  END IF;

  INSERT INTO public.streaks (user_id, current_streak, longest_streak, last_confirmed_date)
  VALUES (p_user_id, v_new, GREATEST(v_new, COALESCE(v_longest, 0)), p_date)
  ON CONFLICT (user_id) DO UPDATE
    SET current_streak      = v_new,
        longest_streak      = GREATEST(v_new, public.streaks.longest_streak),
        last_confirmed_date = p_date;

  RETURN QUERY
    SELECT v_new::INTEGER,
           GREATEST(v_new, COALESCE(v_longest, 0))::INTEGER,
           COALESCE(v_longest, 0)::INTEGER;
END;
$$;
