# Bento iOS — specification and build order

Authoritative document for the iOS app. `IOS_APP_PLAN.md` is superseded and
kept only for its research trail.

Every fact marked *verified* was read from this machine or a live source on the
date given, not recalled. Everything else is a decision or an estimate, and is
labelled as one.

---

## 0. Progress, 7 Oct 2026

Read against §5. "Verified" means seen working on the simulator or a phone,
"built" means the code exists and passes CI but was not seen working end to end.

| Step | State | Notes |
| --- | --- | --- |
| 1. Toolchain | **Done** | Xcode installed, simulator runtime installed. CI runs Xcode 26.6 / iOS SDK 26.5 |
| 2. Account, identifiers, name | **Done** | Individual enrolment, `com.bentodining.app`, app record exists. Store name is **Bento Dining** after error 90129 |
| 3. Scaffold | **Done** | Runs on the simulator and on a real phone. Service worker and Vercel Analytics are off in native builds. **Routing changed from the spec:** history routing failed in the shell, so native builds use `HashRouter` and the web is untouched |
| 4. Signing and CI | **Done, one gap** | `ios-release.yml` archives signed with cloud-managed signing (App Store Connect API key, Admin role), uploads to TestFlight, then polls Apple for the processing verdict. Build number is `run_number.run_attempt`. **Gap:** every run so far was a manual dispatch. A pushed tag has never been tried |
| 5. Native capabilities | **Built** | APNs sender and device tokens, Sign in with Apple, Google return by URL scheme. Sign in with Apple and the Google return were each confirmed working once. **Push delivery to a phone has not been seen end to end** |
| 6. Guideline 4.2 | **Partly done** | Done: icon on the logo cream, safe areas, no install prompt, edge-to-edge layout, haptics, motion system, mascot and closet, weekly quests, launch animation. **Not done:** offline launch is untested, no home-screen widget |
| 7. Compliance | **Partly done** | Done: privacy policy and support pages on their own URLs, in-app account deletion, export compliance flag. **Not done:** `PrivacyInfo.xcprivacy`, privacy nutrition labels, age rating |
| 8. TestFlight, internal | **Running** | Builds 7.1 to 15.1 uploaded. Apple lists them as valid |
| 9. Submit | Not started | Needs screenshots, store copy, reviewer notes with a demo account |
| 10. Operate | Not started | Crash monitoring still has no tool |

**Beyond the spec.** Native layout for iOS, the motion system, onboarding with
the mascot, Bento's closet, weekly quests, the evening streak nudge and the
"Your voice" card were all built after step 5. None of it is required for
submission. The streak, confirmation-saving and sign-out fixes found during
phone testing are listed in the git log from `1aaf346` onward.

**Decision, 7 Oct 2026: guideline 5.1.3 is dropped.** Bento is a dining app.
BentoPulse clients use its data for their own research, and the app is not
itself conducting human subject research. The ethics-review and participant
consent items in step 7 and §8 no longer apply. Privacy labels, the privacy
manifest and the age rating still do, because every app needs them.

**Privacy label basis, 7 Oct 2026.** `NSPrivacyTracking` is false: Apple's
"tracking" means linking app data with other companies' data for advertising or
sharing with data brokers, and Bento does neither. Data collection is declared
as collected and linked to the account (email, user ID, push token, dietary and
health data, usage, community posts). Per the owner, BentoPulse clients see
aggregates only, never individual rows, so Pulse adds no "shared with third
parties" declaration. If clients are ever given row-level data, revisit this and
the App Store Connect labels together.

**Still open:** push delivery check, tag-triggered release, offline launch,
widget, `PrivacyInfo.xcprivacy`, nutrition labels, age rating, crash
monitoring, the Supabase migration workflow's invalid `SUPABASE_ACCESS_TOKEN`,
and the account-owner question in §10.

---

## 1. What is being built, and why

Bento is React 19 + Vite 7. **Capacitor 8 wraps the existing web build in a
native shell**, so the product is reused rather than rebuilt. React Native or
Swift would mean reimplementing every screen for the same app.

Distribution is not the main prize. **Native push through APNs is.** iOS web
push only reaches students who added Bento to their home screen, which caps
meal reminders, weakens the Brandeis pitch, and would silently drop the
research study's snack intervention for any participant who never installed.
One native app fixes all three. Android comes nearly free from the same
scaffold later.

---

## 2. Verified state, 4 Oct 2026 (historical, see §0 for today)

| | State | Needed | OK |
| --- | --- | --- | --- |
| macOS | 27.0.1 (26A434) | 15.6.1+ | yes |
| Free disk | 39 GB after Xcode | see note | yes |
| Node | 22.16.0 | 22+ | yes |
| Xcode | **not installed** (Command Line Tools only) | 26.0+ | **no** |
| iOS simulator runtimes | **0** | at least 1 | **no** |
| Capacitor | 8.5.2 core, cli, ios | 8.x | yes |
| `capacitor.config.ts` | written, `com.bentodining.app` | — | yes |
| `ios/` native project | **does not exist** | — | blocked on Xcode |
| CI | `ci.yml`: lint + build, web only | — | partial |
| Tests | 1 file, `test/mealPlan.test.mjs` | — | thin |
| Lint | **6 errors**, all `react-hooks/set-state-in-effect` | 0 before submitting | **no** |
| Release tags | `v1.0.0` | — | yes |

**Xcode is the only hard blocker.** Install it from the App Store, then
`sudo xcodebuild -license accept` and add one simulator runtime. Everything
from §5 step 3 onward is behind that and none of it is work I can do for you.

Xcode 26 is required, not preferred: since 28 Apr 2026 every App Store Connect
submission must be built with Xcode 26+ against the current iOS SDK, and
Capacitor 8 independently sets Xcode 26.0 as its minimum. **Installed: Xcode
27.0 (27A266a)**, which satisfies both. Confirm which SDK a submission must
target before step 9, since that requirement moves with each release.

**Disk, corrected 4 Oct.** Earlier drafts of this plan said Xcode needs ~35 GB
installed and 45–60 GB during install, and that drove a 57 GB cleanup.
Measured: **Xcode.app is 3.7 GB.** Current Xcode ships slim and downloads
platform SDKs and simulator runtimes separately, which is the multi-gigabyte
part, so budget roughly 10–15 GB total rather than 60.

---

## 3. Over-the-air updates: not for v1

**Decided, 4 Oct 2026: ship binary-only. No live-update provider.**

This reverses an earlier recommendation in this file, which argued for buying a
live-update service. That recommendation rested on two claims that do not hold.

**"Bento ships two or three times a week, so the native app freezes."** Most of
that cadence is the marketing site: landing pages, the carousel, typography,
contrast. None of it is what a native user sees, because they land in the
logged-in app. The churn rate of app-screen code is far lower than the deploy
rate.

**"It changes the scaffold, so decide before step 3."** Also wrong. Adding a
live-update plugin later is additive. Install it, check for a bundle at
startup. It is not a rewrite and it does not lock the architecture.

And the point that was under-weighted: **Bento's content is already live.**
Menus come from the API at runtime, as do ratings, surveys and everything in
Pulse. A frozen bundle does not mean a stale menu. The bundle is the UI shell,
not the data.

Against that, OTA buys exactly two things: shipping web-asset changes without
App Review, and instant rollback. Native changes need a submission regardless.
For a project with no budget, neither is worth a subscription and a vendor
dependency yet, and §7 of this document argues that every recurring obligation
is a liability for a project that has to outlive its founder.

### What to do instead when a fix is urgent

**Apple's expedited review request.** Free, built for exactly this, and
typically answered inside 24 hours. Use it sparingly, because the goodwill is
finite, and keep step 8's TestFlight pass so urgent fixes stay rare.

### If this is revisited later

The approach stays open at no architectural cost. Two paths, both cheap:

- **Capgo free tier**, enough for a small user base.
- **Self-host Capgo.** Plugin is MPL-2.0, backend AGPL-3.0, no licence cost.
  Bundles would sit on infrastructure Bento already runs.

What is *not* an option: **Appflow**. Ionic is winding down its commercial
products after joining OutSystems. Appflow stopped accepting new apps on
1 October 2026 and reaches end of life on 31 December 2027, with Ionic warning
of build failures and live-update whitescreens for anything still on it.
Microsoft CodePush died with App Center in March 2025. Two services in this
exact category have now closed inside eighteen months, which is its own
argument for not depending on one.

Revisit when there is evidence of the pain: a release the team actually needed
out in hours rather than days.

---

## 4. Principles this follows

1. **One codebase.** The native app ships whatever `npm run build` produced.
   No second copy of any screen.
2. **The pipeline exists before the features.** Signing and automated builds
   are set up early, not after launch, so no release is ever blocked on one
   laptop at the worst moment.
3. **Nothing ships that one person alone can ship.** Certificates, build
   numbers and upload credentials live somewhere the project owns.
4. **Every claim in the store listing is one the app can defend**, in the same
   way the marketing copy was corrected to say what Pulse measures.

---

## 5. Order of work

Order matters more than the list. Each step is placed where it is because the
step after it depends on it.

### Step 1 — Toolchain *(blocker, yours)*
Xcode 26 from the App Store, licence accepted, one simulator runtime
installed. Nothing proceeds without this.
**Done when:** `xcodebuild -version` prints 26.x and `xcrun simctl list devices
available` shows at least one iPhone.

### Step 2 — Account and identifiers *(parallel with step 1)*
Enrol in the Apple Developer Program as an **individual**, $99/year. Bento is
not incorporated, so organization enrolment is not open yet, and Apple supports
converting later from Membership Details with apps carrying over and no second
fee. Do not open a separate organization account later: that costs another $99
and every app transfers one at a time.

**Name decided, 4 Oct 2026: Bento Dining.** "Bento" alone is taken several
times over, by a focus timer, a creator tool, a design app and an Asian
kitchen app. None of them is campus dining, so the adjacent namespace is open.

Three separate fields. The original plan said only the first has to be unique.
**Apple disagreed, 5 Oct 2026.** Uploads of builds 4.1 and 5.1 both passed the
upload step and then failed processing with error 90129, "The bundle uses a
bundle name or display name that is already taken". The display name was
"Bento", which several apps hold. The display name and bundle name are now the
store name. Apple has not yet accepted a build under the new name.

| Field | Limit | Unique | Value |
| --- | --- | --- | --- |
| App Store name | 30 | yes | **Bento Dining** |
| Subtitle | 30 | no | **Today's menu, built for you** |
| `CFBundleDisplayName` | ~12 shown | **yes in practice** | **Bento Dining** |
| `CFBundleName` | | **yes in practice** | **Bento Dining** |

The home-screen label is 12 characters and may shorten on some phones. That is
the cost of a name Apple accepts. `appName` in `capacitor.config.ts` matches.

Rejected, so it is not relitigated:

- *Bento - by BentoPulse* inverts the hierarchy. Pulse is the dashboard inside
  Bento and the thing sold to universities, so making the student app "by" it
  makes the child the parent. Apple also reads "by X" as metadata padding.
- *Bento University* reads as a university named Bento, and contradicts the
  disclaimer Bento already ships, that it is "not affiliated with, endorsed by,
  or sponsored by any university".

**No fallback name reserved.** Each app record needs its own bundle ID, so
holding a second name means a throwaway identifier and a decoy record in the
account forever. Apple's documentation states no reservation period at all, and
the New App dialog reports a collision immediately, so picking again costs
thirty seconds.

Steps, from Apple's own documentation:

1. The Account Holder signs the latest agreement in App Store Connect →
   Business. **No app record can be created until this is done.**
2. developer.apple.com → Certificates, Identifiers & Profiles → Identifiers →
   **+** → App IDs → App. Explicit bundle ID `com.bentodining.app`. Tick
   **Push Notifications** and **Sign in with Apple** now, since both are needed
   in step 5 and enabling them later means regenerating profiles.
3. App Store Connect → Apps → **+** → New App. Platform iOS, name
   **Bento Dining**, primary language English (U.S.), the bundle ID above, SKU
   `bento-dining-ios`, Full Access. Creating the record is what reserves the
   name. There is no separate reserve button.

**Done when:** the app record exists.

### Step 3 — Scaffold
`npx cap add ios`, then build and run on the simulator and on a real device.
Capacitor 8 uses Swift Package Manager by default, so CocoaPods is not needed.

Two things to settle in the same change:
- **`.gitignore` for the native project.** Commit `ios/` itself, ignore
  `ios/App/build`, `DerivedData`, `xcuserdata`, `*.xcworkspace/xcuserdata`.
  Decide before the first commit or the history starts dirty.
- **Routing.** Do *not* switch to `HashRouter` globally. That would make web
  URLs `bentodining.com/#/...`, breaking existing links, the
  `/admin/join/:token` invites and the SEO work already shipped. Capacitor
  serves from a real local origin and history routing usually works. Test it in
  the shell. Only if it misbehaves, make it a runtime choice that leaves the
  web alone:
  `const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter`.
- **Service worker.** VitePWA's worker is pointless inside the shell and will
  serve stale assets. Disable it for native builds, keep it for web.

**Done when:** the app runs on a physical iPhone from a local build.

### Step 4 — Signing and CI, before any feature work
This is the step most likely to be skipped and the most expensive to add late.

- Code signing that is not trapped on one machine. Either Xcode Cloud's managed
  signing or Fastlane Match with certificates in a private encrypted repo.
- A macOS CI job that archives and uploads to TestFlight on a tag.
- Extend `ci.yml`, which today runs lint and build for web only.
- **Build numbering tied to the existing tags.** `CFBundleShortVersionString`
  follows the semver tag from `RELEASING.md`; `CFBundleVersion` must increase
  on every single upload, so derive it from the CI run number rather than
  typing it.

**Found 6 Oct 2026: the archive must be signed.** CI first archived unsigned,
because the team had no registered device and Apple would not issue a
development profile. That cannot carry the push and Sign in with Apple
entitlements, which are restricted and exist only in a profile-signed build.
Registering one iPhone fixes it. Registration happened when Xcode first ran the
app on a phone, and the archive step now signs and verifies the entitlements.

**Done when:** pushing a tag produces a TestFlight build with no laptop
involved.

### Step 5 — Native capabilities
The reason the app deserves to exist.

- **APNs push** via `@capacitor/push-notifications`. Store device tokens
  alongside the existing web-push subscriptions.
- **Server send path.** `api/send-reminders` speaks web-push only today. It
  needs to send to APNs for native devices *and* keep web-push for browsers.
  Both, not one replacing the other.
- **Sign in with Apple. Mandatory.** Bento offers Google sign-in
  (`signInWithGoogle` in `src/lib/db.js`), and guideline 4.8 requires an
  equivalent privacy-preserving option wherever third-party login is offered.
  Submission is rejected without it. Supabase supports Apple as a provider and
  needs a Services ID and key from step 2.
- **Deep linking** so Google OAuth returns into the shell, not a browser tab.

### Step 6 — Clear guideline 4.2, "minimum functionality"
The largest rejection risk. Apple rejects apps that are "simply a web site
bundled as an app," which is exactly what a naive wrap is.

- Nothing may read as a browser: no long-press callouts, no text selection on
  tappable UI, no bounce where it reads as a web page. `capacitor.config.ts`
  already sets `contentInset` and a background colour for this reason.
- Opening with no network shows the cached plate, not a dead webview.
- Native app icon and launch screen at every required size.
- **One visible native integration beyond push.** A home-screen widget showing
  today's plate is the strongest single answer to a 4.2 reviewer.
- Safe areas are already handled (`viewport-fit=cover` plus the inset work),
  but **still need checking on a real notched iPhone**.

Assume one rejection round regardless.

### Step 7 — Compliance
- Privacy nutrition labels. Bento collects email, dietary restrictions,
  allergies and nutrition goals. Dietary and allergy data is health-adjacent
  and must be declared honestly.
- `PrivacyInfo.xcprivacy` for the app and any SDK that requires one.
- ~~Guideline 5.1.3, human subject research.~~ **Dropped 7 Oct.** Bento is
  not a research app. BentoPulse clients use its data for their own research.
- Age rating, support URL, marketing URL, privacy policy URL, export
  compliance (standard HTTPS only).
- Account deletion in-app: **already done**, and the privacy copy was corrected
  to say so.

### Step 8 — TestFlight, internal only
**The study does not ship on TestFlight.** Participants install from the public
App Store like any other app, because an unfamiliar install path costs
participation.

TestFlight stays as the step before every submission: upload, install on a real
device, confirm, then submit that same build. Skipping it means finding out
during review.

### Step 9 — Submit
Screenshots at every required size, store copy, and **reviewer notes with a
working demo account**. A reviewer who cannot get past the login rejects the
app. Use phased release.

### Step 10 — Operate
See §7. This is where most app projects quietly die.

---

## 6. Audit against normal practice

Read against how a team would normally ship and keep an iOS app. Findings, not
compliments.

**Resolved by this spec**

1. **Pipeline was scheduled after launch.** The old plan put version
   discipline and release checklists in "Phase 8 — after launch". Normal
   practice is signing and automated builds before feature work, so a release
   is never blocked at the worst moment. Moved to step 4.
2. **The OTA question was never asked.** For a Capacitor app shipping to web
   two or three times a week it is the single most consequential decision, and
   it affects the scaffold. Now §3, before any code.
3. **No rollback story.** Web rollback is two minutes, App Store rollback does
   not exist. The asymmetry was unacknowledged and drives the §3 recommendation.
4. **Build numbering undefined.** `CFBundleVersion` must increase on every
   upload. Now tied to CI and to the `v1.0.0` tagging set up in
   `RELEASING.md`.
5. **`ios/` gitignore undecided.** Nothing in `.gitignore` covers Xcode output.
   Decided in step 3, before the directory exists.

**Open, and genuinely risky**

6. **Crash monitoring has no owner or tool.** The old plan said "wired and
   watched" and named nothing. Pick one before TestFlight. Sentry has a
   Capacitor SDK and is the default choice. Without it, a native crash is
   invisible: there is no console to check and no server log to read.
7. **Test coverage was one file, now 39 tests across 6 files** (meal plan, APNs, copy rules, streak nudge, closet, quests). Auth gates are still untested. Original finding: `test/mealPlan.test.mjs` covers the meal
   optimizer. Nothing else has automated tests. On the web a bad deploy is
   fixed in minutes; in a binary it is days. At minimum the meal algorithm and
   the auth gates deserve tests before submission.
8. ~~**6 lint errors are shipping-relevant.**~~ **Fixed 5 Oct (`af38751`), lint is at 0 errors.** Original finding: All are
   `react-hooks/set-state-in-effect`, in `MealCard`, `CommunityTab` and
   `PulseDashboard`. They are real behavioural findings about cascading
   renders, deliberately left for their own change. A webview on an 8 GB
   device is less forgiving of render loops than a desktop browser. Fix before
   step 8.
9. **No minimum iOS version or device matrix.** Decide and write it down, since
   it affects what APIs are usable and what has to be tested.
10. **Bus factor of one.** Everything here assumes one person with one laptop,
    one Apple ID and one set of certificates. Step 4 reduces this but does not
    remove it. If Bento outlives your time at Brandeis, the account and signing
    material need an owner that is not a person.

---

## 7. Sustainability: what recurs, and what breaks silently

Web apps do not expire. **iOS apps do.** An app that misses these is removed
from sale with little warning, and each one fails quietly rather than loudly.

| Obligation | Interval | What happens if missed |
| --- | --- | --- |
| Apple Developer Program | annual, $99 | Apps are removed from the App Store |
| Distribution certificate | ~1 year | Cannot sign or upload a build |
| Provisioning profiles | ~1 year | Builds stop installing |
| APNs key | does not expire, but is losable | Push silently stops |
| Build with the current iOS SDK | roughly annual | Submissions rejected |
| Capacitor major version | roughly annual | Falls behind the required Xcode |
| Xcode and macOS | annual | Cannot build at all, which is today's blocker |

Two implications worth stating plainly.

**Calendar these.** All of them fail at a distance from the action that caused
them, which makes them hard to diagnose when they bite.

**Decide who owns the account.** The Apple account, signing material and APNs
key should not live only in one person's keychain. This is the difference
between a project that outlives its founder and one that does not.

---

## 8. Estimate

**4–6 weeks from Xcode installed to live**, assuming one rejection round and
that §3 is decided quickly. Steps 5 to 7 are the bulk. App Review itself is
typically 24–48 hours per round.


---

## 9. Costs

| | |
| --- | --- |
| Apple Developer Program | $99/year |
| Live updates | none, not for v1 |
| Crash monitoring | free tier is adequate at this scale |
| Hardware | none, the M1 Air is adequate |
| D-U-N-S | free, and only needed at organization conversion |

---

## 10. Open questions

1. ~~Live-update provider.~~ **Closed: binary-only for v1, see §3.** Nothing
   to buy and nothing blocking step 3.
2. ~~App name.~~ **Closed: Bento Dining. See step 2.**
3. **Minimum iOS version.**
4. **Who owns the Apple account** if Bento outlives your time at Brandeis.
5. **Crash monitoring tool.** Default to Sentry unless there is a reason not to.

---

## Sources

- Capacitor environment: Node 22+, Xcode 26.0 minimum, SPM default in
  Capacitor 8 — capacitorjs.com/docs/getting-started/environment-setup
- Xcode 26 required for App Store submissions from 28 Apr 2026
- Xcode 26 requires macOS 15.6.1+; ~35 GB installed, 45–60 GB during install
- Apple guideline 4.2 minimum functionality, 4.8 Sign in with Apple,
  5.1.3 human subject research, 3.3.2 interpreted code
- Local environment read from this machine, 4 Oct 2026
