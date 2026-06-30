-- Tracks whether any dining location was open on a given date.
-- Shared across all users — one record per calendar day.
-- Used by streak logic to distinguish a missed day from a closed campus day.
CREATE TABLE IF NOT EXISTS dining_availability (
  date       DATE        PRIMARY KEY,
  any_open   BOOLEAN     NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dining_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read dining availability"
  ON dining_availability FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert dining availability"
  ON dining_availability FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update dining availability"
  ON dining_availability FOR UPDATE
  USING (auth.uid() IS NOT NULL);
