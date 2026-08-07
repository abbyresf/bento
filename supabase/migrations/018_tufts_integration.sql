-- ============================================================
-- 018_tufts_integration.sql
-- Multi-school support additions for Tufts integration.
--
-- NOTE: suggestions + submit_suggestion RPC already have
-- university support from migration 016. This migration handles
-- the remaining three tables: menu_cache, item_ratings,
-- dining_availability.
-- ============================================================

-- 1. menu_cache -----------------------------------------------
-- Create fresh with university column if it doesn't exist yet,
-- or add the column if it already exists from an earlier apply.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'menu_cache'
  ) THEN
    CREATE TABLE public.menu_cache (
      university   TEXT        NOT NULL DEFAULT 'brandeis',
      slug         TEXT        NOT NULL,
      date         DATE        NOT NULL,
      html_content TEXT        NOT NULL,
      fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT menu_cache_university_slug_date_key UNIQUE (university, slug, date)
    );

    ALTER TABLE public.menu_cache ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "menu cache public read"
      ON public.menu_cache FOR SELECT
      USING (true);

  ELSE
    -- Table exists — add university column if missing
    ALTER TABLE public.menu_cache
      ADD COLUMN IF NOT EXISTS university TEXT NOT NULL DEFAULT 'brandeis';

    -- Drop old primary key or unique constraint and replace with university-scoped one
    ALTER TABLE public.menu_cache DROP CONSTRAINT IF EXISTS menu_cache_pkey;
    ALTER TABLE public.menu_cache DROP CONSTRAINT IF EXISTS menu_cache_slug_date_key;
    ALTER TABLE public.menu_cache DROP CONSTRAINT IF EXISTS menu_cache_university_slug_date_key;

    ALTER TABLE public.menu_cache
      ADD CONSTRAINT menu_cache_university_slug_date_key UNIQUE (university, slug, date);
  END IF;
END $$;

-- 2. item_ratings — add university column ----------------------

ALTER TABLE public.item_ratings
  ADD COLUMN IF NOT EXISTS university TEXT NOT NULL DEFAULT 'brandeis';

CREATE INDEX IF NOT EXISTS item_ratings_university_idx ON public.item_ratings (university);

-- 3. item_rating_aggregates — rebuild view with university -----

DROP VIEW IF EXISTS public.item_rating_aggregates;

CREATE VIEW public.item_rating_aggregates AS
SELECT
  item_id,
  MIN(item_name)                    AS item_name,
  university,
  ROUND(AVG(rating)::NUMERIC, 1)    AS avg_rating,
  COUNT(*)::INTEGER                 AS rating_count
FROM public.item_ratings
GROUP BY item_id, university;

-- 4. dining_availability — add university, update primary key --

ALTER TABLE public.dining_availability
  ADD COLUMN IF NOT EXISTS university TEXT NOT NULL DEFAULT 'brandeis';

-- Drop the old single-date primary key and replace with (date, university)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_name = 'dining_availability'
       AND constraint_type = 'PRIMARY KEY'
       AND constraint_name = 'dining_availability_pkey'
  ) THEN
    -- Check if the PK is already the composite one we want
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.key_column_usage
       WHERE table_name = 'dining_availability'
         AND constraint_name = 'dining_availability_pkey'
         AND column_name = 'university'
    ) THEN
      ALTER TABLE public.dining_availability DROP CONSTRAINT dining_availability_pkey;
      ALTER TABLE public.dining_availability ADD PRIMARY KEY (date, university);
    END IF;
  ELSE
    ALTER TABLE public.dining_availability ADD PRIMARY KEY (date, university);
  END IF;
END $$;
