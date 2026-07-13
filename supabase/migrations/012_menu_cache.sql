-- Menu cache: shared server-side store for scraped Brandeis HTML
-- The Vercel proxy writes here (service role), all reads bypass RLS the same way.
-- Public SELECT policy lets anon clients read if ever needed (no harm, no secrets).

CREATE TABLE IF NOT EXISTS public.menu_cache (
  slug         TEXT        NOT NULL,
  date         DATE        NOT NULL,
  html_content TEXT        NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (slug, date)
);

ALTER TABLE public.menu_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu cache public read"
  ON public.menu_cache FOR SELECT
  USING (true);
