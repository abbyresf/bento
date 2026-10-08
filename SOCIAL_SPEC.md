# Bento Duo: friends and roommates

Status: design, checked against the code on 7 Oct 2026. Nothing is built.
Supersedes the short design in `IOS_SPEC.md` section 11, which now points here.

Phase 1 database work is written: `supabase/migrations/043_duo_foundation.sql`,
tested by `scripts/test-duo-sql.mjs` (29 checks on a real Postgres engine, run with
`npm i --no-save @electric-sql/pglite && node scripts/test-duo-sql.mjs`). It has not
been run on the live database. The app, push route and screens are not started.

**Naming (decided 8 Oct 2026):** the feature is called **Buddies** in the app, after
the Bento buddy mascot. Code and database names still say friends and duo.

## 1. What this is

Friends can connect, see each other's "I'm here", keep a shared streak, do paired
quests and earn matching closet pieces. It stays small: no feed, no chat, no
public profiles, no search by name.

## 2. Rules (decided with the owner)

1. **Nothing is shared automatically.** A friend sees a hall and meal only after
   you tap "I'm here", and you choose which friends get it. Plans stay private.
2. **Personal progress never depends on a friend.** Personal streaks, quests and
   goals are untouched by anything in Duo.
3. **If one person quits, duo items end quietly.** The other person's personal
   progress does not change. Rewards already earned stay with their owner.
4. **A plate quest counts when at least one person confirms.**
5. **Allergens and diet are checked before a friend's suggestion is shown.** See
   issue A1, which changes how this is built.
6. **Honor system** for Rainbow plate and Bento plate. No color or food group data.
7. **No calories, macros or amounts** anywhere in Duo.
8. **Pulse sees aggregates only.** Duo data is never exposed to Pulse.

## 3. Quests

| Quest | Needs | Counts when |
| --- | --- | --- |
| Plate swap | both build a plate for the other | at least one confirms |
| Mystery plate | friend picks 1 item, you build the rest | you confirm |
| Bento plate | one plate, protein + vegetable + grain | at least one confirms and both tap "yes it has all three" |
| Rainbow plate | friend picks a color, you pick an item | you confirm and tap "yes" |
| Match the plate | both build the same plate | both confirm, bonus if both rate |
| Taste test | both rate the same new dish | both rated, quest asks whether you agreed |
| Pick of the week | each nominates a favorite from their ratings | each rates the other's pick |
| Review duo | five ratings between you | 5 rated dishes from confirmed meals |
| Daily duo | both confirm a meal the same day | feeds the duo streak |
| Cover for me | nudge before 8pm | friend confirms after the nudge |
| Week of dinners | both confirm dinner | five nights |
| Twin day | both approve | a day |
| Outfit swap | both approve | a day |

Dropped: Table for two, New hall duo.

## 4. Data model

All new tables use `user_id uuid references auth.users(id) on delete cascade`, so
`delete_user()` removes everything with no extra step. Every migration is
idempotent and written to be pasted into the SQL editor (see issue B1).

```
friendships
  id uuid pk
  user_a uuid, user_b uuid      -- stored ordered, a < b, unique pair
  requested_by uuid
  status text                   -- 'active' | 'ended' | 'blocked' (a redeemed code is the acceptance, so no pending state)
  blocked_by uuid null
  started_at, ended_at timestamptz
  share_here_a boolean, share_here_b boolean   -- per-friend "I'm here" switch

friend_invites
  id, inviter uuid, code_hash text unique, expires_at, used_by uuid null, used_at

here_pings
  user_id, friend_id, hall text, meal text, meal_date date, created_at
  -- one row per recipient. Expires 90 minutes after created_at.

duo_quests
  id, friendship_id, quest_id text, week_start date, state jsonb, created_at
  -- per pair per week. state holds picks (item ids, color) and the two yes taps.

duo_claims
  user_id, quest_id, week_start, claimed_at   -- same shape as quest_claims

twin_days
  friendship_id, day date, mode text ('twin' | 'swap'), a_ok, b_ok, ended_at

profiles (new columns)
  display_name text           -- see issue C3
  push_social_enabled boolean default false
```

Duo streak and quest progress are **derived on read**, not stored, the same way
`src/data/quests.js` works. Only choices, approvals and claims are stored.

## 5. Access rules (RLS and functions)

Every existing table is own-row only: `meal_history`, `item_ratings`, `streaks`,
`profiles`, `dietary_restrictions`. A friend cannot read any of them, and **no
policy should be added to change that**. Everything a friend may see goes through
`security definer` functions that return only the fields named here, with
`set search_path = ''` and an `auth.uid()` check at the top, copying
`increment_streak` and `delete_user`.

| Function | Returns | Checks |
| --- | --- | --- |
| `duo_friends()` | friend id, display name, status, duo streak | caller is a party |
| `duo_pair_progress(friend, week)` | counts per quest | active friendship |
| `duo_friend_outfit(friend)` | outfit id | active twin day only |
| `duo_create_invite()` / `duo_redeem(code)` | code / status row (`ok`, `invalid_code`, `too_many_attempts`, `friend_limit`) | limits in section 9. Redeem returns a status instead of raising, because a raised error rolls back the attempt count |
| `duo_ping_here(hall, meal, friends[])` | rows written | friends are active |
| `duo_end(friend)` / `duo_block(friend)` | none | caller is a party |

New tables get **no** Pulse admin policy. Migration 009 gave admins read access
to other tables; do not copy that pattern (issue D1).

## 6. Server and push

- **Nudges and "I'm here" alerts need a new route**, `api/duo-notify.js`. It
  verifies the caller's Supabase JWT, checks the friendship in the database,
  rate-limits, then sends through the existing `sendApns` and web push code in
  `api/_apns.js` and `api/send-reminders.js`. It must never take a recipient id
  from the client without checking the friendship.
- `api/` has five routes, so the new one stays well under the Hobby plan's limit.
- Social pushes use their own switch, `push_social_enabled`, separate from
  `push_enabled`, so someone can keep meal reminders and mute friends.
- Every push has an in-app twin. The Today screen reads pending pings and nudges
  on open and on return to the app (issue B3).

## 7. App changes

Decided 8 Oct 2026: Friends is its own tab, second after Today. Today stays free of
friends content for now (no slim line).

- **Friends tab** (`src/components/Friends/FriendsTab.jsx`): "Out now" (who is at a
  hall, with hall, meal and time), a full-width "I'm here" button, then every friend
  with the streak you share and a Manage button for sharing, remove and block. With no
  friends it is one invitation: "Invite a friend" and "Have a code?". A dot appears on
  the tab when a friend is out. The tab is hidden until migration 043 exists.
- **Settings:** your name, the friend-alert switch, and a link to the tab.
- **Quests:** a Duo section on the Friends tab, with claims in `duo_claims`.
- **Closet:** a new unlock type `duo` in `src/data/mascotOutfits.js`, derived from
  how many `duo_claims` rows exist, alongside `streak`, `rated`, `quests`, `quest`.
  `unlockProgress` and `closetOrder` must handle it.
- **Mascot:** the `Mascot` component already renders any outfit id, so a friend's
  Bento on Twin day needs no new art.
- **Local caches** use the `bento_` prefix and must be added to
  `ACCOUNT_LOCAL_KEYS` in `src/lib/db.js` (issue B4).

## 7b. Bento colors and buddy quests (decided 8 Oct 2026)

- **Colors.** Claiming one buddy quest unlocks Bento's color schemes: classic (navy) plus
  cherry, tangerine, sunny, matcha, sky, grape and bubblegum. A scheme recolors the body,
  arms, feet, the two food shapes and the eye ink. Accessories are unchanged. The choice is
  `profiles.mascot_color` (migration 045) and the schemes live in `src/data/mascotColors.js`.
  Ids are never renamed, because a buddy's phone draws classic for an id it does not know.
- **Buddies see your Bento.** `duo_friends` now returns each buddy's outfit and color, and the
  Buddies tab draws them. This replaces the earlier rule that an outfit is visible only on Twin
  day. The picture is cosmetic and carries nothing private.
- **Starter quests, so the unlock is reachable now.** Daily duo (both confirm a meal on 4 days
  in a week) and Week of dinners (both confirm dinner on 5 nights), per buddy. Progress is
  derived from both people's meals by `duo_quests`. `duo_claim` re-checks it and stores a row
  in `duo_claims`. A claim does not use a foreign key to the buddy, so a buddy deleting their
  account cannot take a reward back. The week may be this one or the one before.
- **Widget.** The student's own Bento on the widget is drawn in their color. A buddy list
  widget is described in 7a.

## 7a. "I'm here": how a friend finds out

Decided 8 Oct 2026. Tapping "I'm here" picks a hall and meal, then reaches the
friends you have switched on in three ways:

1. **A push notification:** "Maya is at Usdan". Fixed phrases only.
2. **A row on Today** in the app, which is the version that always works.
3. **The widget:** a small list of friends who are at a dining hall now, with the
   hall and the time, like "Maya, Usdan, 12:42".

Rules:
- It shares a hall name the person chose, never GPS. No location permission.
- The sender chooses how long it lasts: 30 minutes, 1 hour (the default) or 90
  minutes. The database accepts 15 to 120. It ends by itself at that time, with
  nobody doing anything, and "I've left" ends it sooner. The sender sees "You are at
  Usdan until 1:45" with the button next to it. Added in migration 044.
- It is sent per friend. Nothing goes to someone you did not switch on.
- No history is shown, and pings are deleted after 24 hours.
- Limit: 6 pings a day, so it cannot be used to watch someone.

How the widget gets it. A widget cannot receive a push and cannot reuse the app's
login safely, so:
- The app gives the widget a **read-only widget token** that can do one thing,
  list the caller's friends who are currently at a hall. The server stores only its
  hash. It lives in the app group, and `clearWidget()` and sign-out delete it.
- A new route, `api/duo-widget.js`, takes the token and returns that list.
- WidgetKit refreshes on its own schedule, not on demand, so the widget can be
  minutes behind. It shows the time of each ping so a stale row is obvious, and it
  drops any row older than 90 minutes by itself. The app also reloads the widget
  whenever it opens or receives a push.
- Built 8 Oct 2026 as a second widget, "Buddies at the hall" (small and medium),
  in `BentoWidget.swift`. Migration 046 holds the tokens, `api/duo-widget.js` answers
  the widget, and the app writes the token and one picture per buddy outfit and color
  into the app group. The widget keeps the last answer for no signal and adds a timeline
  entry at each tap's end so a buddy leaves the list on time. Not yet seen on a phone.
  WidgetKit decides how often it refreshes, so the list can be minutes behind.

## 8. Phases

**Phase 1: foundation.** Migrations 043 and 044 (friendships, invites, pings, `display_name`,
`push_social_enabled`). Functions in section 5. Invite by code. Friends list,
block, remove. "I'm here" with per-friend switch, shown on Today and by push. Duo
streak, Daily duo, Week of dinners. Privacy policy and App Store answer updates.
Reviewer demo pair. **Push must be verified first** (issue B3).

**Phase 1b: widget presence.** Widget token, `api/duo-widget.js`, the friends list
on the widget (section 7a).

**Phase 2: plate and rating quests.** `duo_quests`, `duo_claims`, the plate flow,
the rating quests, and the on-device allergen check (A1).

**Phase 3: collectibles.** Matching closet pieces, duo badge, Twin day, Outfit
swap.

**Phase 4: widget pair.** Friend pictures in the app group, a pair on the widget.

Each phase ends with a TestFlight build and a real two-phone test.

## 9. Limits and abuse

- Invite codes: 8 characters, expire in 24 hours, single use, hashed at rest.
  Sent as a link through the share sheet, and also typeable (issue B6).
- At most 20 friends, 5 pending invites, 1 nudge per friend per day.
- Same university only (`profiles.university`).
- Blocking is silent. The blocked person sees the friendship as ended.
- Names are free text, 20 characters. Report goes to the existing feedback path.

## 10. Checked against the current app: issues and things to keep in mind

### A. Changes to what I told you earlier

**A1. The allergen check cannot run on the server.** I proposed filtering plates
on the server against the recipient's profile. The server holds menu HTML only.
Items are parsed in the browser (`src/services/brandeisParse.js`), and the
allergen filter runs in the app. So the check runs **on the recipient's phone**
against their own restrictions, using the same filter the meal plan uses. Rules:
- The sender never sees the recipient's restrictions.
- The check **fails closed.** An item with no allergen data is not shown as a
  suggestion.
- A suggestion that contains a blocked item shows the safe items only, and the
  recipient is told. The sender is not told which item was removed.
- Show the standing caveat from `CLAUDE.md`: labels only, cross-contact unknown.
- Treat this as safety code. It needs tests with real allergen cases before
  phase 2 ships.

**A2. Duo quests cannot be derived from one person's rows.** Personal quests are
computed from the caller's own `meal_history` and `item_ratings`. Pair progress
needs both people's rows, which row-level security forbids. It has to be a
`security definer` function returning counts only.

### B. Things in the current app that shape the build

**B1. Migrations are run by hand.** The migration workflow fails on a bad
`SUPABASE_ACCESS_TOKEN`, and `increment_streak` was missing in production because
of it. Every Duo migration must be safe to run twice, and the app must hide Duo
cleanly when a function or table is missing (error codes `PGRST202`, `42P01`),
the way the closet already tolerates a missing `mascot_outfit` column.

**B2. Offline confirmations arrive late.** A queued meal keeps its original
`confirmed_at` and `meal_date` but reaches the database after sync. Duo progress
reads `meal_date`, never the sync time, and the derived streak can change after
the fact. Show a late-arriving day as pending, and fire a celebration only the
first time a streak value is reached. "I'm here" is the opposite case: do not
queue it. A ping that arrives an hour late is wrong, so it needs a connection.

**B3. Push has never been seen arriving end to end.** Nudges and alerts depend on
it, and iOS needs the real production APNs path. Build every Duo feature so it
works without push, and treat push as a bonus until verified on two real phones.

**B4. Sign-out clears an explicit key list.** `clearAccountLocalData` removes the
keys in `ACCOUNT_LOCAL_KEYS`, plus menu caches by prefix. A new `bento_duo_*`
cache that is not added to that list would show one account's friends to the next
person on the same phone.

**B5. Names do not exist yet.** `profiles` has no name column, and sign-in can be
Apple's hidden email. Friends need a display name, so Duo adds one. Free text means
user-generated content, which brings Apple's guideline 1.2 expectations: a way to
report, a way to block, and a response process. Everything else in Duo is fixed
phrases and item ids, so names are the only free text.

**B6. Invites go out through the iOS share sheet, as a link that opens the app.**
*Status 8 Oct 2026: the entitlement, the site file (`public/.well-known/apple-app-site-association`),
the `vercel.json` rewrite and header, and a CI check for the entitlement are written.
Still needed: the Associated Domains capability switched on for the App ID in the
developer portal, then a deploy, then a build. On the web, `/join/CODE` sends the
person to the web app, where the join sheet appears after sign in, so Safari users
without the app are covered.*
Decided 8 Oct 2026, so the inviter just picks a friend in Messages. The app builds
a message with a link like `https://www.bentodining.com/join/ABCD2345` and hands it
to the share sheet (`@capacitor/share`), where Messages is the first choice. That
link only opens the app if the app has the associated-domains setup it lacks today:
- The `com.apple.developer.associated-domains` entitlement with
  `applinks:www.bentodining.com`.
- The Associated Domains capability turned on for the App ID `com.bentodining.app`
  by hand in the developer portal, as with the App Groups. Cloud signing cannot add
  it. Provisioning profiles then need regenerating.
- A file at `/.well-known/apple-app-site-association` on the site, served as JSON
  with no redirect. `vercel.json` currently rewrites every non-API path to the app,
  so `.well-known` has to be excluded from that rewrite.
- An `appUrlOpen` handler in the app. One already exists for sign-in
  (`src/lib/nativeAuth.js`), and the join link needs its own branch.
- A web page for `/join/<code>` for anyone without the app: who invited you and a
  link to get Bento. The page never redeems anything. Redeeming happens only inside
  the app after a confirm, so a link preview bot cannot use up a code.
The typed code stays as a fallback. The existing `send-invite` and `redeem-invite`
functions are for Pulse admins, so do not reuse them.

**B13. Two accounts for one person is a risk, not a current fact.** An earlier
version of this note said the live database had one person on two accounts. That was
a misreading: the push table showed two subscriptions (web and iOS) under one account,
and a check on 8 Oct 2026 found no email that appears twice in `auth.users`.
Friendships belong to an account, so if it did happen, an invite accepted on the wrong
account would look lost. About 60 web accounts exist and those people will likely sign
in on iOS. Auth offers email and password, Google and Apple, and an Apple sign-in can
hide the real email, so the same person could still arrive as a different account.
Needed before Duo ships:
- Re-run the duplicate-email check before launch, and again after the web users move.
- Tell web users to sign in the way they did before, so the iOS app opens their
  existing account, with its streak, ratings and history.
- Settings shows which account is signed in (email) and the join screen says
  "Signed in as <email>" with a confirm, so a mismatch is obvious before accepting.
- Do not auto-merge accounts. A merge moves meals, ratings and streaks and is hard to
  undo, so any merge is a deliberate, per-person action.

**B7. No realtime today.** The app does not use Supabase Realtime. Friend state
loads on open and on return to the app, with push as a nudge to open it. Add
Realtime only if that proves too slow, and check the free-tier connection limit
first.

**B8. Time zones.** `meal_date` is the phone's local date and quests use local
weeks. Both schools are Eastern, and reminders already use Eastern. Compute pair
weeks and the 8pm cutoff in `America/New_York`.

**B9. Item ids are safe to compare.** Menu item ids are recipe-based
(`bh_<recipeId>`, `tu_<id>`) and the same for every student. Taste test and Pick of
the week can match on id. A dish served at two halls has the same id.

**B10. Streak rules.** `increment_streak` forgives one missed dining day and checks
`dining_availability`. A duo streak should use the same rule and the same table so
the two numbers feel consistent. Count only days after the pairing started, and keep
the duo streak read-only for clients (no client-writable counter, as with the
personal one).

**B11. The widget holds one picture and no friend data.** It stores only the
student's own Bento and plate, in the app group. Presence needs the token and
route in section 7a. Friend pictures mean new files and size limits, phase 4.

**B12. Reminders are not reliable today, which affects "I'm here" pushes.** Between
17 Sep and 8 Oct GitHub's scheduler never ran the dinner entries and ran the evening
entries late, and the exact-hour gate then skipped every send for six days. That is
fixed in `ce0fe34` by accepting any run inside a window. The lunch reminder runs on
Vercel's cron and has not been confirmed arriving on a phone. "I'm here" pushes would
be sent by the app's own route at the moment of the tap, so they do not depend on a
scheduler, but they use the same APNs path, which is still unverified end to end.

### C. Safety, privacy and review

**C1. Pulse numbers must not move.** Duo confirms use the same `meal_history`
rows, so Pulse counts stay the same. Check that no Duo write adds meal rows.

**C2. Account deletion.** `delete_user()` deletes the auth user and relies on
foreign keys. Every Duo table needs `on delete cascade` to `auth.users`, and the
other person's view must end the friendship quietly, with no error and no message
about deletion.

**C3. Gamification pressure.** Shared streaks create social pressure around eating.
Keep Duo about confirming and showing up, never amounts. The nudge uses fixed,
friendly phrases and no countdown language. Someone who ends a friendship must not
be asked why.

**C4. App Store.** *Done 8 Oct 2026 in `APP_STORE_ANSWERS.md`, the privacy policy page and
`PrivacyInfo.xcprivacy` (Name added). A Report button on each buddy opens the feedback sheet
with the name filled in. The demo pair of accounts for review is still to do.*
 The Social Media answer in `APP_STORE_ANSWERS.md` flips from No.
The privacy labels gain Name (linked, app functionality) and the policy needs a
Friends section. "I'm here" shares a hall name the person chose, not GPS, so no
location permission and no Location label. Reviewers need a pair of accounts, so
seed a demo friend with `scripts/seed-demo-user.mjs`.

### D. Existing issue found while checking

**D1. Pulse admins can read raw student rows at the database level.** Migration 009
gave any active admin `SELECT` on `profiles`, `meal_history` and
`dietary_restrictions` for their university. The dashboard may only display
aggregates, but the database permits more. The statement that clients see
aggregates only, which the privacy labels and policy rely on, is true of the UI but
not of the access rules. This is outside Duo, but Duo adds friend names and links to
the same database, so decide whether to tighten it before Duo ships. Duo tables must
not copy those policies.

## 11. Test plan

- Pure logic (pair week, quest state, closet unlock for `duo`) in `test/*.test.mjs`,
  added to the `test:copy` list in `package.json`, like `quests.test.mjs`.
- SQL functions tested by a script run in the SQL editor against a scratch project,
  because CI has no database. Cover: stranger blocked, blocked friend blocked, ended
  friendship, deleted account, double redeem, expired code.
- Allergen check: tests with real label data, including an item with no data.
- Two real phones for invites, "I'm here", nudges, Twin day and push.
- Offline: confirm a meal offline and check the duo streak after sync.
- Dark mode and Dynamic Type pass on every new screen.

## 12. Open questions

- Is the friend limit of 20 right, or should it be smaller?
- Should "I'm here" also be visible to friends who have not shared back?
- Should Tufts and Brandeis ever connect? The spec says same university only.
- Decide on D1 before phase 1 ships.
