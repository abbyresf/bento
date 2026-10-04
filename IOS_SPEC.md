# Bento iOS — specification and build order

Authoritative document for the iOS app. `IOS_APP_PLAN.md` is superseded and
kept only for its research trail.

Every fact marked *verified* was read from this machine or a live source on the
date given, not recalled. Everything else is a decision or an estimate, and is
labelled as one.

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

## 2. Verified state, 4 Oct 2026

| | State | Needed | OK |
| --- | --- | --- | --- |
| macOS | 27.0.1 (26A434) | 15.6.1+ | yes |
| Free disk | 47 GB | ~45–60 GB during Xcode install | tight but yes |
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
submission must be built with Xcode 26+ against the iOS 26 SDK, and Capacitor 8
independently sets Xcode 26.0 as its minimum.

---

## 3. Over-the-air updates: decided, 4 Oct 2026

**Decided: the native app ships web assets over the air.**

Capacitor bundles `dist/` into the binary. Bento ships to the web two or three
times a week, so without live updates the native app freezes at whatever was
submitted and a one-word copy fix costs an App Review round of one to three
days. Web and native would diverge immediately and permanently.

The deciding argument was rollback. A bad web deploy is corrected in two
minutes. A bad App Store build cannot be rolled back at all, only superseded by
a newer build that has itself been reviewed. For a student-facing app carrying
a research study, "wait for Apple" is not an acceptable worst case.

Apple permits this under guideline 3.3.2 for interpreted code that does not
change the app's primary purpose. Web assets qualify. **Native** changes still
require a submission, always.

### Provider

**Appflow is out, and not by preference.** Ionic announced the wind-down of its
commercial products after joining OutSystems. Appflow stopped accepting new
apps on **1 October 2026** and reaches end of life on **31 December 2027**, with
Ionic warning that apps still on it may hit build failures and live-update
whitescreens. Ionic now points customers at Capawesome. Microsoft CodePush is
also gone, retired with App Center on 31 March 2025.

That leaves two live options:

| | Capgo | Capawesome Cloud |
| --- | --- | --- |
| Status | independent, plugin is open source | Ionic's officially recommended successor |
| Entry price | from about $12/month | flat, higher |
| Also covers | OTA plus a small number of native builds | OTA, native builds, store publishing |
| Lock-in | lower: the update server can be self-hosted | normal SaaS |

**Recommendation: Capgo**, on sustainability grounds rather than price. Two
update services have now died under this exact use case inside eighteen months,
and this project has to outlive its founder. An open-source plugin with a
self-hostable backend means a vendor wind-down costs a migration rather than a
dead app. Capawesome is the reasonable alternative and would also absorb much of
step 4, since it does native builds and store publishing too.

Caveat on the evidence: most comparisons of these two are published by one of
the two. The Appflow dates above are from Ionic's own announcement. The
feature and price claims are vendor-stated and worth confirming at signup.

**Still to choose.** The plugin SDK differs per provider, so this blocks step 3.

### What this changes downstream

- Step 3 installs the chosen provider's plugin and sets a channel per
  environment.
- Step 4 may shrink if the provider also does native builds and uploads.
- A live update is a release. It gets the same clean-worktree discipline as a
  web deploy, and the same tag, or the three surfaces drift.
- Bug fixes during the research study no longer need an App Review round.

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

Create the App ID `com.bentodining.app`, the App Store Connect record, and
**reserve the app name early**. "Bento" is almost certainly taken, so a name
has to be chosen and held.
**Done when:** the app record exists and the name is reserved.

### Step 3 — Decide §3, then scaffold
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
- **Guideline 5.1.3, human subject research.** The study runs through this app.
  Apple requires participant consent and approval from an independent ethics
  review board, with proof on request. The study's IRB approval covers it, and
  its timing is now on the submission's critical path too.
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
7. **Test coverage is one file.** `test/mealPlan.test.mjs` covers the meal
   optimizer. Nothing else has automated tests. On the web a bad deploy is
   fixed in minutes; in a binary it is days. At minimum the meal algorithm and
   the auth gates deserve tests before submission.
8. **6 lint errors are shipping-relevant.** All are
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

The research study cannot start until the app is approved, so **App Review is
on the study's critical path**.

---

## 9. Costs

| | |
| --- | --- |
| Apple Developer Program | $99/year |
| Live updates (Capgo) | from about $12/month |
| Crash monitoring | free tier is adequate at this scale |
| Hardware | none, the M1 Air is adequate |
| D-U-N-S | free, and only needed at organization conversion |

---

## 10. Open questions

1. **Live-update provider: Capgo or Capawesome.** The approach is decided;
   the vendor is not, and the SDK differs. Blocks step 3.
2. **App name**, since "Bento" is likely taken. Blocks step 2.
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
