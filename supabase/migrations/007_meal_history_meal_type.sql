-- Add meal_type and meal_date to meal_history so each (user, date, meal) is a single upsertable row.
-- This prevents multiple rows accumulating when a user re-confirms the same meal on the same day.

ALTER TABLE meal_history
  ADD COLUMN IF NOT EXISTS meal_type text CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  ADD COLUMN IF NOT EXISTS meal_date date;

ALTER TABLE meal_history
  ADD CONSTRAINT IF NOT EXISTS meal_history_user_date_type_key
  UNIQUE (user_id, meal_date, meal_type);
