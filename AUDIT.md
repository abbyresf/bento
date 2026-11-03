# Bento code audit

Written 3 Nov 2026 against `main` at `56948d4` (one commit ahead of origin, not yet pushed).
Read-only. Nothing in the app was changed for this audit.

## How this was done, and what it does not cover

Checked by reading code and measuring a production build: file sizes, bundle contents, every timer, every
request made at startup, GitHub workflows, `npm audit`, an import scan for unused files, and a pglite repro
of the quest bug. **Not done:** profiling on a real phone, `EXPLAIN` on the live database, a row level
security review, an accessibility pass, and the Pulse and research code beyond how it is bundled. Numbers
marked "estimated" come from reading the code, not from measuring a device.

## A. Bugs a student can feel

**A1. Three tabs go stale after their first visit.** `App.jsx:483-505` keeps every visited tab mounted and
only hides it. Each tab loads its data once, in a `useEffect` with `[]`, so it never refreshes.
- **Insights** (`InsightsPanel.jsx:215`): six queries on first open and never again. Confirm lunch, open
  Insights, and the streak, weekly totals and daily goals show the old numbers until the app is restarted.
- **Community** (`CommunityTab.jsx:247`): suggestions, upvotes and flags load once.
- **Buddies** had the same bug. Fixed in `56948d4` (not pushed).
Fix: one small hook, `useRefreshOnShow(load)`, that re-runs a loader when the tab comes into view or the
app returns to the front, with a minimum gap (for example 20 seconds) so flicking between tabs does not
refetch each time. Apply to Insights and Community. About 40 lines.

**A2. Expired quests showed a dead "I did it" button.** Fixed in `56948d4` and migration 068, which is
run. Other features that use `expires_at` (Mystery plate, Cover for me, I'm here) were not checked for the same shape.

**A3. Errors are mostly swallowed.** 119 `catch {` blocks and 13 `.catch(() => {})`. Most are
deliberate (cosmetics, widgets) and the comments say why. The risk is the ones that are not: a failed
meal confirm, rating, or quest tap should say so. I did not review all 119. This is the largest unaudited
surface, and the quest bug above was this exact pattern, an error message too quiet to notice.

**A4. The new Buddies refresh is heavier than it should be.** My change polls every 30 seconds while the
tab is showing, and each pass runs `duo_quests` twice per buddy (this week and last) plus a streak call.
Fine for 2 buddies, heavy for 15. Change it to refresh on show, after a rating or confirm, and every 90
seconds at most. Proposed with the fix for A1 so there is one refresh rule.

## B. Things that take longer than they should

**B1. Every database helper asks Supabase Auth who you are, over the network.** `db.js` has 38 calls to
`uid()`, and `uid()` calls `supabase.auth.getUser()`, which is a round trip to Supabase Auth each time.
The comment above it is right that `getSession()` must not replace it. The fix keeps `getUser()` and shares
the answer: remember the result for about 30 seconds and let concurrent callers wait on one request. This
alone removes most of the startup requests (see B2). Clear the cached value on sign out and on any auth
change. About 15 lines in `db.js`. Highest value, lowest risk.

**B2. Startup reads the same `profiles` row about nine times.** Each of these makes its own request, and
most start with their own `getUser()`: `isOnboardingComplete` and `isTermsAccepted` (two queries for two
columns, `db.js:919,931`), `loadOutfit`, `loadMascotColor`, `loadMealPrefs`, `loadAthlete`,
`getUserProfile` (twice in `MealPlan.jsx`), plus push and widget helpers. Estimated 20 or more requests
before the first plate shows. Fix: one `getProfileRow()` that fetches `*` once and caches it for the
session, and have all of these read from it. Estimated to cut startup requests by more than half. Same
file area as B1, so do both together.

**B3. One 1.39 MB JavaScript file (409 KB gzipped).** There is no route level code splitting; only the
bento box art is lazy loaded. Student devices download and parse code they never run:
- **Pulse** (the client dashboard, about 1,900 lines plus `recharts`) and the **research setup and grid**
  (`ag-grid-community`, `ag-grid-react`, `write-excel-file`) ship inside the student app.
- The **landing site**, **onboarding** and **admin** routes are in the same file.
Fix: `React.lazy` the Pulse, research and landing routes. A sensible target is the student bundle under
about 700 KB uncompressed. This is the biggest speed win for first load, especially for the PWA on weak
campus wifi. Needs a quick check that the pre-render for SEO still works.

**B4. `duo_quests` is expensive per call.** One call computes all 13 quests with about 30 subqueries, and
the app calls it twice per buddy on every refresh. Not measured on the live database. Check with
`EXPLAIN ANALYZE` once there are real users with several buddies, and consider returning only the three
quests that are in rotation this week (the app already hides the rest).

**B5. `MealPlan.jsx` is 1,206 lines with 17 effects.** Hard to reason about, and it is where regressions
have landed (the replan loop, the servings replan). Not slow by itself, but I would not add more to it
without splitting. See D.

## C. Wasted resources

**C1. The web app precaches marketing images.** The service worker downloads 5.6 MB on first visit and on
each update, including Pulse screenshots, the team photo (721 KB) and the Pulse logo (276 KB). A student
using the PWA does not need any of those. Fix: restrict `globPatterns` in `vite.config.js` to the app
shell and exclude `screenshots/` and the team photos. Saves about 3 MB per install and per update.

**C2. `public/logo.png` is 2 MB** and `team-abigail.png` is 739 KB. The logo is only used as the share
image and in structured data, so it is fetched by crawlers, but a 2 MB share image is slow to preview in
messages. Resize to 1200 by 630 (about 100 KB) and compress the team photo. In the iOS app these also sit
inside the shipped bundle for nothing.

**C3. GitHub Actions minutes.** If the repository is private, these run constantly: study reminders every
5 minutes (about 8,600 runs a month), uptime every 30 minutes, menu cache warm hourly, backup every 6
hours, and the meal reminders. That is roughly 11,000 billed minutes a month, well past the free 2,000.
I do not know whether the repository is private. If it is, move the 5 minute job to a Vercel cron or a
Supabase scheduled function (both free at this scale) and keep the rest. Note: each macOS release run
is billed at 10 times, so about 50 minutes per build. Failed builds like #38 waste that, which is why
a check for "this version number was already approved" before archiving would pay for itself.

**C4. Polling that continues when it should not.** `MealPlan.jsx:299` polls quest hints every two minutes
even with Today hidden or the app in the background. `friendsStore.js` already checks visibility; hints
should too. Minor.

**C5. Dead code.** Not referenced anywhere: `src/components/Landing/LandingFAQ.jsx` and CSS,
`src/components/TabBar/TabBar.jsx`, `src/components/Onboarding/SwipeOnboarding.jsx` and its 376 line CSS,
`src/utils/storage.js`, and the abandoned `Badges/BentoBadge.jsx` (untracked). About 1,000 lines. Safe to
delete after a final search for dynamic imports.

**C6. `npm audit`: 9 vulnerabilities (3 high, 6 moderate)** in production dependencies, including `ws`.
Most are transitive. Run `npm audit fix` on a branch and run the tests. Do not use `--force`.

## D. Reorganization worth doing, in order

1. **Split `db.js` (1,182 lines)** into `profile`, `meals`, `ratings`, `community`, `quests` modules with the
   shared `uid()` in one place. Do it together with B1 and B2 since they touch the same code.
2. **Split `MealPlan.jsx`** into the hooks it already contains in spirit: confirmed meals sync, quest hints,
   offline queue flush, widget sync. Each is a `useEffect` block with its own refs today.
3. **Rename `data/mockMenu.js`.** It holds real constants (meal times, station names, dietary tags) and is
   imported by production code. The name invites someone to delete it, or hides a real mock behind it.
4. **Fix migration numbering.** `064` and `065` each exist more than once (three files named `065_`).
   They sort and run fine when pasted by hand, but a future tool that orders by number will pick wrongly.
   Renumber going forward and add a short `supabase/migrations/README` listing what has been applied.
5. **Update the PWA manifest.** It still says "Bento – Brandeis Meal Planner". Bento now serves more than
   one school. Same for `index.html` and structured data copy if they say Brandeis only.
6. **Pulse into its own entry.** It already has a separate research build config. Making Pulse a lazy route
   (B3) is the first step. A separate deploy is the end state, and not necessary now.

## E. Suggested order of work

| # | Change | Effort | Risk | Win |
| --- | --- | --- | --- | --- |
| 1 | B1 `getUser` sharing + B2 one profile read | small | low | faster open, fewer requests |
| 2 | A1 refresh-on-show hook for Insights and Community, A4 refresh rule | small | low | stale tabs gone |
| 3 | C1 and C2 precache and image sizes | small | low | 3 MB less per install |
| 4 | B3 lazy routes | medium | medium | much faster first load |
| 5 | C5 dead code, C6 `npm audit fix` | small | low | tidy |
| 6 | A3 review of swallowed errors on confirm, rate, quest | medium | low | fewer silent failures |
| 7 | D1 and D2 splits | large | medium | maintainability |
| 8 | C3 move the 5 minute job | small | low | saves money if the repo is private |

Items 1 to 3 together are a day of work and can ship in one build. Item 4 needs a quick regression pass
on the landing pages and SEO pre-render. Items 7 and 8 should wait until after the Halloween build is out.

## F. Questions for the owner

1. Is the GitHub repository private? This decides how urgent C3 is.
2. Do you want the refactors (D) done now, or only the fixes (A, B, C), with D after the next release?
3. Is deleting the dead files (C5) fine, including `BentoBadge.jsx`, which has sat untracked since September?

## G. Status after the first round of fixes (3 Nov 2026)

Done in the working tree, committed locally, not pushed:
- **B1** one shared `getUser` answer (`src/lib/userIdResolver.js`, `authId.js`), used by `db.js`, outfit, color, meal
  settings, athlete, and the two Buddies setters. Eight unit tests.
- **B2** the startup profile reads share one request (`src/lib/coalesce.js`, `readProfileRow`). Every write to the
  profile row drops the shared read, so a read after a write is fresh.
- **A1 and A4** `useRefreshOnShow` for Insights, Community and Buddies. Buddies now refreshes at most every 90 seconds
  while showing, not 30.
- **C1** the service worker no longer precaches screenshots, the team photo or the Pulse logo (5.5 MB down to 2.7 MB,
  49 entries down to 40). **C2 in part:** `team-abigail.png` (739 KB) became a 67 KB JPEG. `logo.png` is untouched, see below.
- **C5** deleted `LandingFAQ`, `TabBar`, `SwipeOnboarding`, `utils/storage.js` and `BentoBadge.jsx`. `LandingFAQ` was
  a dead duplicate of the FAQ in `LandingHome.jsx`, and the Boston University launch edited the dead copy. The live
  FAQ already names both schools.
- **C6** `npm audit fix` (no `--force`): production findings went from 9 (3 high) to 4 moderate. 194 packages moved by
  patch versions. Tests, lint and the production build pass.
- **D5** the PWA manifest no longer says "Brandeis Meal Planner".

Not done yet, in order: B3 lazy routes (needs a regression pass on the landing pages and the SEO pre-render), A3 the
review of swallowed errors on confirm, rate and quest, B4 `EXPLAIN` on `duo_quests`, D1 to D4 and D6.

**`logo.png` needs a decision.** It is a 1536 by 1024 transparent PNG with a faint grey haze around the mark, which is
why it weighs 2 MB. Flattened to clean flat colors it is 14 KB and looks like the mark on white. It is only the share
image and the structured data logo, but it is your brand file, so I left it alone.

**The repository is public.** I scanned all of git history for private keys, tokens and service keys and found none.
Two things to know: `scripts/seed-demo-user.mjs` contains a demo password (`demo@bento.app`), so confirm that account
does not exist in production, or delete it. And before making the repository private, move the 5 minute study
reminder job and the other scheduled workflows off GitHub Actions, or they will use up the free private minutes.
