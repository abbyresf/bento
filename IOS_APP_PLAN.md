# Bento iOS — build plan

Living document. Update the status boxes as things land. Every fact with a
"verified" note was checked against a live source or this machine on the date
given, rather than recalled.

**Approach: Capacitor.** Bento is React 19 + Vite 7. Capacitor wraps the
existing build in a native shell, so the entire app is reused. React Native or
Swift would mean rebuilding every screen for the same product.

The strategic prize is bigger than distribution. Native push through APNs
removes the iOS web-push limitation completely. Today notifications reach only
students who added Bento to the home screen, which caps meal reminders, weakens
the Brandeis pitch, and would silently break the research study's snack
intervention for any participant who never installed. A native app fixes all
three at once. Android comes nearly free from the same scaffold later.

---

## Phase 0 — Make this machine capable of iOS development

**This is the critical path. Nothing in Phase 2 onwards can start until it is
done, and none of it is work I can do for you.**

Verified on this machine, 28 Sep 2026:

| | Current | Needed |
| --- | --- | --- |
| Mac | MacBook Air M1, 8 GB RAM | Supported. No new hardware |
| macOS | **13.5 Ventura** | **15.6.1 or newer** |
| Xcode | **15.2** | **26.0 or newer** |
| Free disk | **1.8 GB of 228 GB** | **~80 GB** |
| Node | 22.16.0 | 22+ ✓ |

Why Xcode 26 specifically: since **28 April 2026** Apple requires every App
Store Connect submission to be built with Xcode 26+ against the iOS 26 SDK.
This is not optional and not a Capacitor choice. Capacitor 8 independently
requires Xcode 26.0 as its minimum.

- [x] **0.1 Free ~80 GB.** *Partly done, 28 Sep.* Removed The Sims 4 and its
      packs, four Downloads installers, and the Messages and Chrome caches:
      **57.7 GB reclaimed, 1.6 GB → 59.4 GB free.** Deleting the old Xcode 15.2
      needs sudo and is still to do (`sudo rm -rf /Applications/Xcode.app`),
      which takes it to roughly 65 GB. That is enough to upgrade macOS first,
      then install Xcode, though the Xcode install peak of 45–60 GB is tight.
      More is available from ~/Library/Containers and Application Support if
      needed.
- [ ] **0.2 Upgrade macOS** to 15.6.1+ (or 26). The M1 supports it.
- [ ] **0.3 Install Xcode 26** from the App Store, then
      `xcode-select --install` and accept the licence.
- [ ] **0.4 Install one iOS simulator runtime.** None are installed today.

Note on the hardware: an 8 GB M1 Air will build this fine, but Xcode plus a
simulator plus a dev server on 8 GB is not comfortable. Workable, not pleasant.

---

## Phase 1 — Apple Developer Program (run in parallel with Phase 0)

$99/year. **No longer gated on external wait**, since enrolment is as an
individual. Can be completed the same day.

- [x] **1.1 Entity type decided, 28 Sep: enrol as INDIVIDUAL now.**
      Bento is not incorporated, so organization enrolment is not available
      yet. Verified that this is reversible at no cost: Apple supports a
      **"Convert to Organization"** request from Membership Details at
      developer.apple.com/account, and **apps carry over** with no per-app
      transfer and no second membership fee. Conversion later needs the
      D-U-N-S number plus articles of incorporation, and Apple phones to
      verify within about two weeks.
      Do NOT open a separate organization account later instead: that costs a
      second $99 and every app has to be transferred one at a time.
      Tradeoff accepted: the App Store seller name is a personal legal name
      until conversion.
- [ ] **1.2 D-U-N-S number — DEFERRED until Bento incorporates.** Not on the
      critical path any more, because enrolment is proceeding as an individual.
      Needed only at conversion time.
      **Prerequisite: Bento must be a registered legal entity.** D&B asks for
      registration documents. If Bento is not incorporated, this path is
      blocked and the choice is to incorporate first or enrol as an individual.
      Process, verified 28 Sep: look up at
      `developer.apple.com/enroll/duns-lookup/` with the legal entity name,
      HQ address, mailing address and work contact. Request free from the same
      page if nothing is found. Up to 7 business days total, 5 with D&B and 2
      for Apple to receive it. Paying to expedite does not shorten Apple's
      side. Escalation queue: `support.dnb.com/?CUST=APPLEDEV`.
- [ ] **1.3 Enrol and pay.**
- [ ] **1.4 Create the App ID / bundle identifier**, e.g. `com.bentodining.app`.
      Once chosen it cannot be changed, so decide deliberately.
- [ ] **1.5 Create the app record in App Store Connect.**

---

## Phase 2 — Capacitor scaffold

- [ ] **2.1 Install** `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`.
- [ ] **2.2 `capacitor.config.ts`** — appId, appName, `webDir: 'dist'`.
- [ ] **2.3 `npx cap add ios`.** Capacitor 8 uses Swift Package Manager by
      default, so CocoaPods is no longer required.
- [ ] **2.4 Build and run on the simulator**, then on a physical device.
- [ ] **2.5 Router — do NOT switch globally.** *Claim corrected 28 Sep.* The
      first draft of this plan said to move to `HashRouter`. That would have
      been damaging: web URLs would become `bentodining.com/#/...`, which
      breaks existing links, the `/admin/join/:token` invite links, and the SEO
      work already done (sitemap, canonical, JSON-LD, Search Console).
      Capacitor serves from a real local origin and history routing generally
      works, so this is something to TEST in the shell rather than pre-empt.
      If it does misbehave, the fix is a runtime choice that leaves the web
      untouched:
      `const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter`.
      Not implemented, because implementing it untested would be guessing.
- [ ] **2.6 Service worker.** VitePWA's generated SW is pointless inside the
      native shell and can serve stale assets. Disable it for native builds
      while keeping it for the web build.
- [ ] **2.7 Environment split.** The native build needs its own env handling;
      `import.meta.env` values are baked in at build time.

---

## Phase 3 — Native capabilities

This is the phase that earns the app its place on the App Store.

- [ ] **3.1 APNs push** via `@capacitor/push-notifications`. Register for a
      token on the device, store it alongside the existing web-push
      subscriptions.
- [ ] **3.2 Server send path.** `api/send-reminders` currently speaks web-push
      only. It needs to send to APNs for native devices and keep web-push for
      browser users. Both, not one replacing the other.
- [ ] **3.3 Sign in with Apple.** **Mandatory.** Bento offers Google sign-in
      (`signInWithGoogle` in `src/lib/db.js`), and Apple's guideline 4.8
      requires an equivalent privacy-preserving option wherever third-party
      login is offered. Submission will be rejected without it. Supabase
      supports Apple as a provider; needs a Services ID and key from Phase 1.
- [ ] **3.4 Deep linking / OAuth return.** Google OAuth has to return into the
      native shell rather than a browser tab.
- [ ] **3.5 Native niceties** that also help clear guideline 4.2: haptics,
      status bar styling, splash screen, safe-area handling, share sheet.

---

## Phase 4 — Clear guideline 4.2, "minimum functionality"

The largest rejection risk. Apple rejects apps that are "simply a web site
bundled as an app," and a naive Capacitor wrap is exactly that.

- [x] **4.0 Safe areas and cover mode.** *Done, 28 Sep.* `index.html` lacked
      `viewport-fit=cover`, which meant iOS reported every `env(safe-area-inset-*)`
      as zero — so the five stylesheets already using insets (BottomNav, the
      sheets, onboarding) had never actually done anything on a notched iPhone.
      Every one of those rules was also bottom-only, so cover mode alone would
      have put headers under the status bar. Added cover mode plus a top inset
      on `.app` and `.pulse-header`. Verified: 0px on desktop, so a no-op on
      the web, and 47px when an inset exists. Uncommitted, and **still needs
      checking on a real notched iPhone.**
- [ ] **4.1 Nothing may look like a browser.** No visible chrome, no
      long-press callouts, no text selection on tappable UI, no bounce
      scrolling where it reads as a web page.
- [ ] **4.2 Offline behaviour.** Opening with no network must show the cached
      plate, not a dead webview.
- [ ] **4.3 App icon and launch screen**, native, all required sizes.
- [ ] **4.4 Real native integration beyond push**, ideally something visible:
      a home-screen widget showing today's plate would be the strongest single
      answer to a 4.2 reviewer.

Assume one rejection round regardless. First submissions usually get one.

---

## Phase 5 — Compliance

- [ ] **5.1 Privacy nutrition labels** in App Store Connect. Bento collects
      email, dietary restrictions, allergies and nutrition goals. Dietary and
      allergy data is health-adjacent and must be declared honestly.
- [ ] **5.2 Privacy manifest** (`PrivacyInfo.xcprivacy`) for the app and any
      SDK requiring one.
- [x] **5.3 Account deletion in-app.** *Done, 28 Sep.* Deletion was already
      built in `Settings.jsx`, but `privacySections.jsx` told users to email
      instead. Both the retention and rights sections now say deletion is
      available in Settings and takes effect immediately. Uncommitted.
- [ ] **5.4 Guideline 5.1.3, human subject research.** The research study runs
      through this app, and Bento is health-adjacent already. Apple requires
      participant consent and approval from an independent ethics review
      board, with proof on request. The study's IRB approval covers it, but
      the timing now affects submission as well as the study.
- [ ] **5.5 Age rating**, support URL, marketing URL, privacy policy URL.
- [ ] **5.6 Export compliance.** Standard HTTPS only; answer accordingly.

---

## Phase 6 — TestFlight, for OUR testing only

**Decided 28 Sep: the study does NOT ship on TestFlight.** Research
participants download from the public App Store like any other app, because
most people have never heard of TestFlight and an unfamiliar install path costs
participation.

TestFlight stays in the pipeline anyway, as the internal step before every
submission. It is not a distribution choice: you upload a build, install it on
a real device, confirm it works, then submit that same build. Skipping it means
submitting untested and spending review rounds finding out.

- [ ] **6.1 Archive and upload a build.**
- [ ] **6.2 Internal testing** (up to 100 team devices, no review needed).
      Enough for us. External TestFlight is not required.
- [ ] **6.3 Crash reporting** wired and watched before submitting.

---

## Phase 7 — Submission

- [ ] **7.1 Screenshots** at every required device size.
- [ ] **7.2 App Store copy**: name, subtitle, description, keywords.
- [ ] **7.3 Reviewer notes** — give them a working demo account. A reviewer
      who cannot get past the login rejects the app.
- [ ] **7.4 Submit**, expect a round of feedback, resubmit.
- [ ] **7.5 Phased release** rather than all-at-once.

---

## Phase 8 — After launch

- [ ] Version and build numbering discipline.
- [ ] A release checklist so web and native stay in step.
- [ ] Android via the same scaffold, when wanted.

---

## What the App Store route costs, versus TestFlight

Recorded so the trade is visible rather than rediscovered:

- **Full App Review, not Beta App Review.** Stricter, and guideline 4.2
  (minimum functionality) becomes a real risk for a Capacitor wrap rather than
  a theoretical one. Phase 4 is now load-bearing.
- **Store listing required**: screenshots at every device size, description,
  subtitle, keywords, support URL, age rating, privacy nutrition labels,
  export compliance.
- **The app name must be unique.** "Bento" is almost certainly taken. Reserve
  a name in App Store Connect early.
- **Budget one rejection round.** First submissions usually get one.

Net effect on the research study: the study cannot start until the app is
approved and live, so App Review is on the study's critical path.

## Order of work, and why

Phase 1 is no longer a wait. Enrolling as an individual removes the D-U-N-S
delay entirely, so the developer account, bundle ID, certificates and the App
Store Connect record can all exist the same day.

That leaves **Phase 0 as the only blocker**: macOS 15.6.1+, then Xcode 26.
Phases 2 through 5 are strictly sequential behind it. Phase 6 must not be
skipped.

Realistic estimate once Phase 0 is done: **4–6 weeks to live.** Phase 0 itself
is the unknown, because it depends on how quickly ~80 GB can be freed and an OS
upgrade scheduled.

## Costs

| | |
| --- | --- |
| Apple Developer Program | $99/year |
| D-U-N-S number | Free |
| Hardware | None. The M1 Air is adequate |
| Disk | Free space, or an external drive for archives |

## Sources checked, 28 Sep 2026

- Capacitor environment setup: Node 22+, Xcode 26.0 minimum, SPM default in
  Capacitor 8 — capacitorjs.com/docs/getting-started/environment-setup
- Xcode 26 requirement for App Store submissions from 28 April 2026 —
  capawesome.io and capgo.app
- Xcode 26 requires macOS 15.6.1+; ~35 GB installed, 45–60 GB during install
- Local environment read directly from this machine
