-- Which dining hall a confirmed plate was built from.
--
-- Pulse could report what students ate and how much of it they left, but not
-- where. "Roasted Brussels Sprouts are half-wasted" is interesting; "half-wasted
-- at Usdan and finished at Sherman" is something a dining director can act on,
-- because it points at a station and a cook rather than at a recipe.
--
-- The hall was already known at confirmation time -- MealPlan passes it to the
-- rating sheet -- it just was not being written down. item_rating_aggregates
-- already stores the same short name ('Sherman', 'Usdan', 'Kosher'), so the two
-- can be joined on it without a lookup table.
--
-- Nullable on purpose. Every row confirmed before this migration has no hall
-- and never will; Pulse groups those under "Unattributed" rather than guessing.
-- A nullable column with no default is a catalog-only change in Postgres 11+,
-- so this does not rewrite the table.
--
-- No index: every Pulse query already filters on user_id and confirmed_at and
-- groups by hall in memory over a few thousand rows. An index here would be
-- write cost for no read benefit.
alter table public.meal_history
  add column if not exists dining_hall text;

comment on column public.meal_history.dining_hall is
  'Short name of the hall the plate was built from, e.g. Sherman. Null for rows confirmed before migration 033.';
