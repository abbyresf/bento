-- Add structured allergen columns to dietary_restrictions.
-- These replace the data gap where dairy_free/nut_free had no menu data to filter on.
-- Allergen data is sourced from Brandeis Dining's allergens_list field per menu item.

alter table public.dietary_restrictions
  add column if not exists milk       boolean default false,
  add column if not exists eggs       boolean default false,
  add column if not exists wheat      boolean default false,
  add column if not exists soy        boolean default false,
  add column if not exists fish       boolean default false,
  add column if not exists shellfish  boolean default false,
  add column if not exists tree_nuts  boolean default false,
  add column if not exists peanuts    boolean default false,
  add column if not exists sesame     boolean default false;
