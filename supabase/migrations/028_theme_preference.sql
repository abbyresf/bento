-- Theme preference: 'system' (default), 'light', or 'dark'.
--
-- This column is a convenience, not the source of truth. The app reads the
-- preference from localStorage before first paint, because reading it from
-- Supabase would flash the wrong theme on every load while the request is in
-- flight. This exists so the choice follows someone to a second device.
--
-- The app tolerates this column not existing, so running it is safe at any time
-- and skipping it degrades to per-device preferences rather than breaking.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system';

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_theme_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_theme_check
  CHECK (theme IN ('system', 'light', 'dark'));
