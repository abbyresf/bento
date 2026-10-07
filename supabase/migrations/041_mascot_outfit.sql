-- Which piece Bento is wearing.
--
-- One short text id per student (see src/data/mascotOutfits.js). Unlocks are not
-- stored: they are worked out from the longest streak and the number of dishes
-- rated, so only the choice needs a column. Null means nothing is worn.
--
-- Safe to run more than once.

alter table public.profiles
  add column if not exists mascot_outfit text;

comment on column public.profiles.mascot_outfit is
  'Id of the cosmetic piece the mascot wears, or null. Unlocks are derived, not stored.';
