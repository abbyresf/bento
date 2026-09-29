# Bento research study — build spec

Randomised controlled trial run through Bento. Primary outcome is **food
waste**, comparing a treatment arm advised to eat a small snack before lunch
against a control arm.

Living document. Decisions confirmed 28 Sep 2026 unless noted.

---

## Settled

| | |
| --- | --- |
| **Participants** | 30–40 total, both arms |
| **Enrolment** | Study code entered at signup or in Settings, then a consent screen |
| **Randomisation** | **Bento does it**, at enrolment, recorded once and immutable |
| **Identity** | Bento stores a random participant code only. No name, no email. The researchers hold the code-to-person mapping |
| **Prior data** | Does not enter the study. Collection starts at enrolment |
| **Isolation** | A `research` schema in the existing Supabase project. No second database |
| **Dashboard** | Pulse-like, on its own site, cohort-scoped |
| **Scope** | Built for this one study |
| **Not our responsibility** | Recruitment, onboarding, offboarding, or checking that students actually ate the snack |

### Instruments, and who owns each

| Instrument | Owner | Cadence |
| --- | --- | --- |
| Entry survey | **Qualtrics** (researchers) | Once, at start |
| Snack reminder, treatment arm only | **Bento** | Daily, including weekends |
| Post-meal experience survey | **Bento** | Daily, after lunch and/or dinner |
| Food waste logging | **Bento** | Per plate, existing consumption feature |
| Exit survey | **Qualtrics** (researchers) | Once, at end |

Bento owns everything in the middle. Qualtrics owns the two endpoints.

---

## The snack reminder: 10:30am every day

The intervention is a prompt 30 minutes before lunch service opens. Checked
against the live Brandeis feeds:

| Day | Service | Opens |
| --- | --- | --- |
| Weekday | Lunch, all three halls | 11:00am |
| Saturday | Brunch, second sitting, Sherman | 11:00am |
| Sunday | Lunch, Sherman | 11:00am |

Every lunch-equivalent service starts at 11:00am, so **a single 10:30am Eastern
send works seven days a week.** No per-day or per-hall logic needed.

Worth telling the researchers: **Usdan publishes no weekend menu at all.** On
Saturday and Sunday, Sherman is the only option. That is a property of Brandeis
dining, not of the study, but it means weekend behaviour is not comparable to
weekday behaviour for reasons unrelated to the intervention.

Delivery risk: on iOS, web push only reaches students who installed Bento to
the home screen. A participant who never installs receives no intervention and
silently sits in the treatment arm untreated. Until the native app ships, home
screen install should be an enrolment requirement, and install state must be
recorded per participant so undelivered cases can be excluded from a
per-protocol analysis.

---

## Two tracks of data, deliberately separate

The researchers want response consistency tracked **separately** from eating
behaviour, because consistency drives compensation.

That separation is worth more than it first appears. The same per-participant
response-rate figure is also the control for the study's single largest
threat to validity:

> The treatment arm is told to change its behaviour, which makes it more
> engaged, and more engaged participants report consumption more often. Its
> waste figure would then be computed from a more conscientious slice of its
> plates than the control's, biasing the result toward the hypothesis.

So response rate must be reported **per arm**, alongside every waste figure,
and an acceptable imbalance agreed before launch. One table serves both
compensation and scientific defensibility.

**Design:** `research.participant_activity` holds participant code, days
enrolled, prompts sent, prompts answered, plates logged, consumption reports
filed. It carries no food data. `research.plates` and the rest carry behaviour
and no compensation metrics. Both key on participant code.

---

## Open questions

- **Post-meal survey timing.** After lunch, after dinner, or end of day? And is
  it the same instrument each day or does it vary?
- **Does the post-meal survey go to both arms?** It must, or its response rate
  becomes an arm-dependent artifact of its own.
- **Dietary restrictions in the research schema?** Deferred. Religious data
  under GDPR, so consent must name it explicitly if included.
- **Withdrawal.** The researchers do not handle offboarding, but a participant
  who wants out still needs a mechanism and the consent form must describe it.
  Minimum: stop collection, and decide whether prior rows are purged or kept to
  the withdrawal date.
- **Second study?** Still open. Only changes hard-wired versus generic.

---

## Infrastructure

**Supabase.** One project, `research` schema. 30–40 participants over a
semester is a trivial data volume, so size is not the concern. The concern is
that the free tier takes **no automated backups**, and this is the first data
Bento will hold that cannot be regenerated. Losing it mid-study costs
participants their time and the relationship. Pro is $25/month. Flagged;
decision is Abigail's.

**Vercel.** No Pro needed for this project, agreed. The separate question of
Bento being commercial under Hobby terms predates the research work and is
unaffected by it.

---

## Delivery: the native iOS app, from the App Store

**Decided 28 Sep.** The researchers expect the study to run through the native
iOS app, not the website, and participants install it from the public App Store
rather than TestFlight.

Two consequences:

1. **The study cannot start until the app is approved and live.** App Review is
   on the study's critical path, not beside it. See `IOS_APP_PLAN.md`; the
   blocker there is macOS 15.6.1+ and Xcode 26 on Abigail's machine.
2. **Native push replaces web push for the snack reminder.** This is the good
   news: APNs reaches every participant who installed the app, so the delivery
   gap that would have silently untreated any participant who never added the
   PWA to their home screen disappears.

The web app keeps working throughout. The native shell runs the same build.

## Build order

1. Study code, consent screen, `study_participants`, arm assignment. No
   dependencies, can start now.
2. `research` schema, scoped read-only role, projection from `public`.
3. Snack reminder: daily 10:30am Eastern send to the treatment arm only.
   Reuses the existing web push stack and the reminder cron.
4. Post-meal survey. **Needs its own path.** The existing survey system caps one
   survey per university per week, which is right for dining services and wrong
   for a daily research instrument. Research surveys must not consume that slot
   and must not inherit that cap.
5. Activity tracking for compensation.
6. The researcher dashboard.
