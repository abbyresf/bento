-- Per-user control over which nutrition numbers are shown.
--
-- Bento is used by students with a history of disordered eating, and by people
-- who simply do not want to count anything. Each metric can be hidden
-- independently: hiding calories while keeping protein is a common and
-- legitimate combination.
--
-- Defaults are true so existing users see no change.

alter table public.profiles
  add column if not exists show_calories boolean not null default true,
  add column if not exists show_protein  boolean not null default true,
  add column if not exists show_carbs    boolean not null default true,
  add column if not exists show_fat      boolean not null default true;
