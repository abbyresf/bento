# Bento Duo: friends and roommates

Status: design, checked against the code on 7 Oct 2026. Nothing is built.
Supersedes the short design in `IOS_SPEC.md` section 11, which now points here.

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
  status text                   -- 'pending' | 'active' | 'ended' | 'blocked'
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
| `duo_create_invite()` / `duo_redeem(code)` | code / new friendship | limits in section 9 |
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

- **Today:** a friends row under the header. A friend with a live ping shows
  "Maya, Usdan, lunch". An "I'm here" button appears on the meal being confirmed.
- **Settings:** Friends section for invites, the friend list, per-friend sharing,
  block, remove, and the social push switch.
- **Quests card:** a Duo tab beside the personal quests. Claims write `duo_claims`.
- **Closet:** a new unlock type `duo` in `src/data/mascotOutfits.js`, derived from
  how many `duo_claims` rows exist, alongside `streak`, `rated`, `quests`, `quest`.
  `unlockProgress` and `closetOrder` must handle it.
- **Mascot:** the `Mascot` component already renders any outfit id, so a friend's
  Bento on Twin day needs no new art.
- **Local caches** use the `bento_` prefix and must be added to
  `ACCOUNT_LOCAL_KEYS` in `src/lib/db.js` (issue B4).

## 7a. "I'm here": how a friend finds out

Decided 8 Oct 2026. Tapping "I'm here" picks a hall and meal, then reaches the
friends you have switched on in three ways:

1. **A push notification:** "Maya is at Usdan". Fixed phrases only.
2. **A row on Today** in the app, which is the version that always works.
3. **The widget:** a small list of friends who are at a dining hall now, with the
   hall and the time, like "Maya, Usdan, 12:42".

Rules:
- It shares a hall name the person chose, never GPS. No location permission.
- It expires after 90 minutes, and "I've left" clears it sooner.
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
- Before the widget is built, check that the extension may make network calls from
  a timeline and what refresh budget it gets.

## 8. Phases

**Phase 1: foundation.** Migration (friendships, invites, pings, `display_name`,
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

- Invite codes: 8 characters, expire in 24 hours, single use, hashed at rest,
  hand-typed so no universal link is needed in phase 1.
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

**B6. Invite links need a domain setup the app does not have.** The app has no
associated-domains entitlement. A tapped link would open the website, not the app.
Phase 1 uses typed codes. Links can come later with an
`apple-app-site-association` file on `bentodining.com`. The existing
`send-invite` and `redeem-invite` functions are for Pulse admins. Do not reuse them.

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

**C4. App Store.** The Social Media answer in `APP_STORE_ANSWERS.md` flips from No.
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
