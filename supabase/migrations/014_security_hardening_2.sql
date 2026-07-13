-- Security hardening pass 2.
--
-- 1. Lock dining_availability writes to today only — prevents any authenticated
--    user from back-dating or forward-dating entries to manipulate streak logic.
--
-- 2. Restrict pulse_invites public read — anon callers only need id + university
--    to redeem; email should not be readable without authentication.
--
-- 3. Length constraints on university_requests free-text columns.

-- ── dining_availability: tighten write policies ────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert dining availability" ON dining_availability;
DROP POLICY IF EXISTS "Authenticated users can update dining availability" ON dining_availability;

CREATE POLICY "Authenticated users can insert today dining availability"
  ON dining_availability FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND date = current_date);

CREATE POLICY "Authenticated users can update today dining availability"
  ON dining_availability FOR UPDATE
  TO authenticated
  USING  (auth.uid() IS NOT NULL AND date = current_date)
  WITH CHECK (date = current_date);

-- ── pulse_invites: drop wide-open anon read ────────────────────────────────────
-- Client code only needs to verify the invite exists; it should select specific
-- columns (id, university, expires_at) — email never needs to leave the DB.

DROP POLICY IF EXISTS "public read valid invite" ON pulse_invites;

CREATE POLICY "public read valid invite"
  ON pulse_invites FOR SELECT
  TO anon
  USING (used_at IS NULL AND expires_at > now());

-- Note: enforce column restriction on the client by calling
-- .select('id, university, expires_at') — Postgres doesn't support
-- per-column RLS policies, but the client must not request email.

-- ── university_requests: length guards ────────────────────────────────────────

ALTER TABLE public.university_requests
  DROP CONSTRAINT IF EXISTS university_requests_name_length,
  DROP CONSTRAINT IF EXISTS university_requests_university_length,
  DROP CONSTRAINT IF EXISTS university_requests_referral_length;

ALTER TABLE public.university_requests
  ADD CONSTRAINT university_requests_name_length
    CHECK (name IS NULL OR char_length(name) <= 120),
  ADD CONSTRAINT university_requests_university_length
    CHECK (char_length(university) <= 120),
  ADD CONSTRAINT university_requests_referral_length
    CHECK (referral IS NULL OR char_length(referral) <= 500);
