-- Track whether a student has installed Bento to their home screen.
--
-- The app already detects this on every load (display-mode: standalone, or
-- navigator.standalone on iOS) but never recorded it, so install rate was
-- unknowable. It gates the whole notification workstream: iOS delivers web
-- push only to a PWA installed to the home screen, never to a Safari tab.
--
-- Platform is stored alongside because push viability differs by it — Android
-- and desktop can receive push from the browser, iOS cannot.

alter table public.profiles
  add column if not exists is_installed        boolean,
  add column if not exists installed_at        timestamptz,
  add column if not exists install_platform    text,
  add column if not exists last_install_check  timestamptz;

comment on column public.profiles.is_installed is
  'Whether the app was last seen running as an installed PWA (standalone display mode).';
comment on column public.profiles.installed_at is
  'First time this account was ever seen running standalone. Never cleared, so uninstalls stay distinguishable from never-installed.';
comment on column public.profiles.install_platform is
  'ios | android | desktop | other — push delivery differs by platform.';
