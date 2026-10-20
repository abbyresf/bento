# Bento research dashboard and enrolment: build spec

Draft 9, 13 Oct 2026. Extends `RESEARCH_STUDY_PLAN.md`. Where the two disagree,
this file wins, and the disagreements are listed in section 1.

The researchers get their own secure dashboard. It shows every participant's
data in an Excel-style grid, and it updates live. Students opt in with a study
code at signup. Everything a participant does is stored apart from the regular
pool, in a way Bento can still use.

---

## 0. Decisions so far

| | |
| --- | --- |
| **Who runs what** | Students sign the consent form in the researchers' Qualtrics survey, and the researchers give Bento the list of who may join. Bento randomises (13 Oct, migration 059) |
| **Identity** | Emails, and names if the list has them, are stored in Bento and visible to researchers. Reverses the 28 Sep "participant code only" decision |
| **Platform** | The student-facing research features are in the iOS app only. The PWA shows none of it. The researcher dashboard is a website and is the exception (13 Oct) |
| **Who can enrol** | Anyone with the study code, listed or not (20 Oct, migration 063). Students join in waves and the full list arrives later, so the list is compared afterwards, not at the door |
| **Matching** | Done after the fact, by the lower-cased email on the student's Bento account, whenever the list is read. Nothing is stored about the match |
| **Data scope** | Study data, meal plans and confirmations, macros and profile, app usage |
| **Study code** | One shared code for the whole study, plus a list match. Bento adds an enrolment cap and an on/off switch |
| **Who configures** | Researchers edit questions, reminder times and code settings in the dashboard |
| **Grid** | Sortable, filterable, with CSV and XLSX export. Read-only data, live updates |
| **Daily survey** | Push at a set evening time. The survey opens on its own if the app is already open (see 4.3) |
| **Release** | Ships in the next app update. The build in review today has no research UI |
| **Groups** | Group S (snack) and group L (loop and plan). Each gets its own reminder. Surveys may differ by group |
| **Study window** | 21 days from each participant's own enrolment, held per study as `window_days` because it may change. Only research reminders are sent during it. Normal reminders resume afterwards |
| **Group L** | Same 10:30am Eastern reminder as group S. Method: loop the dining hall to see what is offered, plan what you want, then go back and fill your plate |
| **Streaks** | Not frozen. Participants may lose a streak during the window |
| **Control group** | None. Exactly two groups, S and L |
| **Surveys** | Left flexible for now. Per-group questions are supported and not required |
| **Withdrawal** | Stop collection and preserve the data. What else happens is deferred (13 Oct) |
| **Account deletion** | Research rows are not deleted or anonymised. The study is separate and has its own consent form |
| **Consent** | Signed in the researchers' Qualtrics survey. Bento shows no consent text. Students tap one acknowledgement: they completed the consent and are 18 or over |
| **Previous-study materials** | Not shared yet. Every column in section 5 is provisional until they arrive |
| **Bento's own use** | Bento has permission to use the data too. Research rows are tagged so they stay out of the regular pool |

---

## 1. Read this first: what this changes

### 1.1 The identity reversal

The 28 Sep plan stored a random participant code only, with the researchers
holding the code-to-person mapping. That kept names and emails out of Bento.
This spec stores them: the researchers' list carries an email for every
participant, and Bento keeps it. Four things follow.

1. **Consent.** The researchers' Qualtrics consent form must say that email,
   meal data, nutrition and health data, and dietary restrictions go to the
   research team and are also used by Bento. Kosher and halal restrictions are
   religious data under GDPR, so the form names them or the research schema
   leaves them out. Bento cannot check the wording, so ask the researchers to
   confirm the form covers it.
2. **IRB posture.** Bento no longer randomises and no longer collects consent,
   which moves it back toward a data processor. It still holds identifiable data
   about human subjects, so the researchers' ethics approval should name Bento's
   role. This is theirs to settle. The spec only needs the answer.
3. **Privacy policy.** Today it says dining services see anonymized
   aggregates. It needs a research section covering what participants share,
   with whom, for how long, and how to withdraw.
4. **Account deletion.** Decided 13 Oct: research rows survive account
   deletion and are not anonymised, because the study is separate and has its
   own consent form. That has three consequences. The research tables hold
   `user_id` as a plain value with no foreign key to `auth.users`, so deleting
   an account neither cascades into them nor is blocked by them. Email, and the
   name if the list has one, are copied into `research.participants` at
   enrolment, so they outlive the account. And the researchers' consent form,
   the privacy policy and the in-app delete confirmation must all say so, because Apple expects deletion to be honest
   about what is kept (guideline 5.1.1(v)). The researchers' consent form is
   where the retention terms live.

### 1.2 App Store

The iOS submission rests on three statements this feature breaks:

- `IOS_SPEC.md` records on 7 Oct that guideline 5.1.3 (human subject research)
  was dropped because "the app is not itself conducting human subject
  research."
- The privacy labels say nothing is shared with third parties, because "Pulse
  clients see aggregates only."
- `APP_STORE_ANSWERS.md` is written on that basis.

The build in review has no study code field, so it is not affected. **The
update that ships enrolment is.** Before that update is submitted:

- Revisit 5.1.3. Expect Apple to ask for ethics approval evidence.
- Revise the privacy labels for participants. Data linked to a person and
  shared with the research team is a third-party disclosure. Update
  `PrivacyInfo.xcprivacy` to match.
- Give App Review a way to see the flow. Section 3.5 describes a test code.
- Update reviewer notes and the 13+ age rating discussion. The study
  acknowledgement in section 3.3 confirms 18 or over.

IOS_SPEC.md already says to revisit the labels if clients ever get row-level
data. This is that case. It applies to the research cohort only.

### 1.3 Dining Pulse keeps its rule

Dining-services Pulse at `/admin` stays aggregates-only. Nothing in this spec
gives a dining admin a participant's row. The researcher dashboard is a
separate product with separate accounts and its own database role.

---

## 2. Architecture

```
  student app (iOS + web)              researcher dashboard
  ───────────────────────              ──────────────────────
  public schema, as today              research.bentodining.com
         │                                      │
         │ triggers, enrolled users only        │ Supabase auth + MFA
         ▼                                      ▼
  research schema  ◄───── RLS: role "researcher" only ─────┘
    participants, responses, meals, events, ...
         │
         └── Supabase Realtime pushes new rows to the open grid
```

**One Supabase project, a `research` schema.** Same as the plan. 30 to 40
participants is a trivial volume.

**Copy by trigger, not views over `public`.** Triggers on the source tables
copy a row into `research.*` when the user is an active participant. This
gives three things views cannot:

- Collection starts at enrolment and stops at withdrawal, enforced at write
  time rather than filtered at read time. Prior data never enters the study.
- Supabase Realtime works on tables and does not work through views.
- Researchers need no read access to any `public` table.

**Separate site, separate entry point.** The dashboard is not a route inside
the student app. Putting `/research` in the SPA would bundle researcher code
into the iOS app and the public site. It is a second Vite entry deployed to
`research.bentodining.com` from the same repo. The existing `/admin` Pulse
stays where it is.

**Security baseline.**

- Invite-only accounts, reusing the `send-invite` and `validate-invite`
  pattern, in a new `research.researchers` table. Not the dining `admin_users`
  table.
- TOTP multi-factor required at sign-in. Supabase supports it natively.
- A scoped database role. The dashboard can read `research.*` and write only
  the setup tables. It has no access to `public`.
- Every export and every setup change writes to `research.audit_log`
  with who, what, and when. The log is append-only.
- Idle session timeout of 30 minutes.
- No service key in the browser, ever.
- Backups. `RESEARCH_STUDY_PLAN.md` flagged that the free tier takes none, and
  this is now identifiable data nobody can regenerate. **Supabase Pro ($25 a
  month) should be a launch gate.** The existing `backup.yml` workflow is not a
  substitute until someone has restored from it once.

---

## 3. Enrolment

### 3.1 The onboarding step

New step in the signup wizard, after account creation:

> **Are you part of a research study?**
> Yes / No

- **No** skips the step. Nothing is recorded. No row, no flag, no trace.
- **Yes** shows a code field. Then the acknowledgement screen.

The same entry also lives in Settings, as the plan decided, for people who
sign up first and are enrolled later. Settings shows "Join a study" until
enrolment and "Your study" afterwards.

### 3.2 The researchers' list

The researchers consent students in Qualtrics and give you the list, in waves as
students sign up. It lives in `research.roster`: one row per person, with the
email and optionally a name. It carries no group. It is **not a gate**. Anyone
with the study code can enrol. The list is a reference that is compared with
who enrolled, and the comparison is live, so it can be loaded, added to or
corrected at any time. Bento assigns the group at enrolment (3.5).

- **Loading.** From a CSV, in the SQL editor:
  `node scripts/roster-to-sql.mjs <study-id> list.csv | pbcopy`, then paste and
  run. The script prints to the screen only and never writes a file, because the
  list is names and emails and this repository is public. It checks every row
  first. Keep the CSV outside the repo too.
- **Loading again.** Safe, in any number of waves. New people are added and
  existing rows are updated, whether or not the person has enrolled. A `group`
  column in the CSV is ignored and the script says so.
- **Matching, as the list is read.** By the lower-cased email on the student's
  Bento account, copied onto the participant row at enrolment. The roster sheet
  shows, for each listed email, whether someone with it has enrolled. The
  participants sheet has an "On the list" column and fills in the name from the
  list, so "enrolled but not on the list" and "on the list but not joined" are
  each one filter. A student who signed up with a different address from the one
  on the list shows as both. A per-person match key (a code issued in Qualtrics)
  would be the one place to extend: `studies.match_on` and
  `research.account_key()`.
- **Researchers can see the list** in the dashboard, which also shows who on it
  has not enrolled yet.

### 3.3 Redeeming the code

Built in `054_research_foundation.sql`. Two SECURITY DEFINER functions:

1. `research_check_code(code)` returns `ok` and the study name if the code is
   right. It records nothing about them.
2. `research_enroll(code, acknowledged)` runs after the student taps the
   acknowledgement. It assigns the group (3.5), issues the participant
   code and starts the window, in one step under a lock on the study row.

The client never queries the study, list or code tables.

- The code is stored as a hash (sha256 of the code with case, spaces and dashes
  removed). The code itself is only ever typed into the SQL editor when a study
  is created, so it is never in the repository.
- **A wrong code is a wrong code.** `invalid_code` counts as a wrong guess, five
  allowed, then locked. The `not_on_list` answer no longer exists (063): a right code
  enrols whoever holds it. A closed,
  full, unstarted or ended study still looks exactly like a wrong code, so a
  code cannot be probed for its state.
- **iOS only.** Both functions take the platform and return `ios_only` for
  anything but `'ios'`, before any attempt is counted. A client can lie about it,
  so this guards against the PWA doing it by accident. It is not a security
  boundary. The code plus the list is the gate.
- Rate limit: 5 wrong guesses per user per hour. The sixth attempt, including one
  with the right code, returns `too_many_attempts`. Attempts expire after an
  hour.
- Other statuses: `already_enrolled` and `acknowledgement_required`. Forgetting
  the acknowledgement is not a wrong guess.
- Failures come back as a row with a status and not as an exception. An
  exception would roll back the recorded attempt, so wrong guesses would never
  count. Same pattern as `duo_redeem` in migration 043.

The screen after a valid code is one acknowledgement and no consent text:

> I completed the study consent form and I am 18 or over.

Bento stores the tap and its time. It is the only consent-related record Bento
keeps, and it is not a substitute for the researchers' form.

### 3.3a In the app (phase 2, built 13 Oct)

iOS only. Everything below renders nothing on the web or Android, and the calls
return "unavailable" without touching the network. Checked in a browser with the
platform forced to iOS (all four stages, three error cases, Settings in each
state, dark mode) and on the web (no calls made).

| Piece | Where |
| --- | --- |
| Pure wording and checks | `src/data/research.js`, tested in `test/research.test.mjs` |
| Calls | `src/lib/research.js`, `src/lib/useStudyStatus.js` |
| The join flow: ask, code, acknowledgement, done | `src/components/Research/StudyJoin.jsx` |
| The Settings section: join, your study, leave, over | `src/components/Research/StudySection.jsx` |
| Onboarding | A `study` step before the review step, in `OnboardingWizard.jsx`, present only on iOS. Continue is disabled until the student answers Yes or No |
| Delete account | A note in Data Management for participants: deleting the account does not delete study data |
| Settings menu | Settings opens on a vertical menu of sections, each with a one-line description and a chevron. Tapping one opens it with a Back button: Profile (body stats, goals, targets), Food (dietary restrictions, meals), Reminders (meal reminders, buddy alerts), Research (iOS only), Display (appearance, nutrition numbers), Account (sign out, data management). Only Profile and Food show Save. It always opens on the menu, except when returning from the Contact page, which lands back on the same section |

A build that ships before migration 054 is run shows no Settings section. The
onboarding question still appears, and a Yes gets "Studies are not available
yet". Run the migration first.

Push permission after joining uses the existing `subscribeToPush`. Recording a
denial for the researchers waits for phase 4, which can read it from the push
tables.

### 3.4 Notifications

After enrolling, ask for push permission with an explanation. If denied, the
participant stays enrolled. The denial is recorded, because every research
reminder is a push, so a participant with push off receives no intervention in
either group. The researchers need that fact in the data.

### 3.5 Group assignment and the participant code

Bento randomises, at enrolment, in order of arrival. Every two people who join
form a pair that gets one of each group, and which of the two gets which is
random. A person with no partner yet (an odd one out) is assigned at random as
if the groups were already even. This is the same as giving each new person the
group with fewer participants so far, and choosing at random when the two are
level, so it is done that way: count the participants in each group of the
study and take the smaller, breaking a tie at random. The count includes
everyone ever enrolled, whatever their status, so a withdrawal never skews the
split. It runs under the lock on the study row, so two people enrolling at the
same moment cannot both read the same count.

No pair is stored, shown or exported, because it is not useful to the researchers
and the rule needs none. Nobody is told their group: the app never receives it,
the enrolment answer does not carry it, and a student cannot read the participants
table. The researchers see it in the dashboard, since they need it to analyse the
data. If they should be blinded as well, that is a change to the views and not to
this rule.

The group is copied onto the participant row. A database trigger refuses any
later change to the group, the participant code, the user, the list row or the
acknowledgement time.

Groups are S (snack) and L (loop and plan), held in `studies.groups`, so a third
group is a data change and not a code change.

The participant code (`P-001`, `P-002`, ...) is issued in the order students
enrol and shown to the researchers beside the email. It is the key in every
sheet, so exports can be shared without the Participants sheet.

**App Review test study.** A second study row marked `is_test`, with its own
code and a list that contains the reviewer's demo account email, gives App
Review a working flow. Test participants and list rows are excluded from every
researcher view. The code and the demo account go in the reviewer notes.

### 3.6 After enrolment

`profiles.research_cohort` is set true at enrolment and **never cleared**. It
means "was ever a participant", so dining Pulse can skip these students for good,
including the rows they wrote during their window. A client cannot set or clear
it, because a database trigger keeps client writes at the old value. Whether a
student is active now lives in `research.participants.status`, which is what the
push helper in section 4.2 reads.

### 3.7 Withdrawal and completion (provisional)

Withdrawal is deferred to a later conversation (13 Oct), so this is the minimum
that keeps the build safe:

- Settings shows "Leave the study" for an active participant.
- Leaving sets `status = withdrawn` and `withdrawn_at`. Collection and research
  reminders stop at once. Regular reminders return.
- **All rows are preserved.** Nothing is purged and nothing is truncated.
- The People page shows the withdrawn participant and the date, so the
  researchers can decide what to do with their rows.

Completion works the same way, with `status = completed` when the window closes.
Rows collected before either event stay as they are. What happens next is open
question 6.

---

## 4. The participant's experience

### 4.1 What differs by group

| | Group S (snack) | Group L (loop and plan) |
| --- | --- | --- |
| Research reminder, 10:30am Eastern, daily | Eat your snack now, 30 minutes before lunch service opens | Loop the dining hall to see what is offered, plan what you want, then go back and fill your plate. **Wording to be written** |
| End-of-day questions | Group S set | Group L set. May differ, not decided |
| Regular Bento reminders | Off for the study window | Off for the study window |
| Everything else in the app | Same | Same |

**Timing.** Both groups get their reminder at the same time, decided 13 Oct.
From the plan: 10:30am Eastern works seven days a week because every
lunch-equivalent service opens at 11am. One send time means one scheduled job
and one comparable delivery record for both groups. Still stored per group in
`reminder_schedules`, so it can diverge later without a code change.

**Reminders are a table, not code.** `research.reminder_schedules` holds, per
group: send time, days of the week, title, body, and an active flag. The
researchers edit it in Setup. A different reminder for each group, or a third
group later, needs no deploy. One scheduled job reads the table each minute and
sends what is due.

**Both groups get a survey.** Whether the question sets are identical is open.
The data model allows either (section 4.3), and the dashboard shows response
rate per group beside every figure either way.

You said participants may get other small differences in their app experience.
**Beyond the two reminders and the survey, none are specified yet.** The
mechanism is ready: `research.arm_flags`, a table of flag name, group and
value, read once at launch. See open question 5.

### 4.2 Interaction with existing notifications

Decided 13 Oct: participants receive **only research reminders for the duration
of the study** (about 3 weeks). Every other push stops.

That covers all of these existing senders, which each need one new check:

| Sender | File |
| --- | --- |
| Daily meal reminders | `api/send-reminders.js` |
| Evening streak nudge | `api/_streakNudge.js` |
| Buddy and Duo notifications | `api/duo-notify.js` |
| Any push added later | Route recipients through `withoutActiveParticipants` in `api/_research.js` |

Built. `withoutActiveParticipants(admin, ids)` asks the database
(`research_active_user_ids`, service role only) which of the ids are active
participants and drops them. Meal reminders and the streak nudge share
`send-reminders.js`, so one call covers both, and buddy alerts call it inside
`deliver` in `duo-notify.js`. A one-account delivery test is exempt. The reminder
response reports `heldBack`.

If the database call fails, the fallback is the `research_cohort` flag, which holds
back everyone who has ever been in a study until the database answers. That can mute
a student whose study ended, for a while. It cannot send a regular reminder to
someone in the middle of one. If that fails too, it sends unfiltered rather than
silencing every student. A database with no study set up holds nobody back.

The helper returns false while the user has an active, unwithdrawn row in
`research.participants` whose study window is open. Putting the check in one
function matters, because a new sender added next month would otherwise start
messaging participants silently.

**When it ends.** The window closes 21 days after the participant's own enrolment
(`studies.window_days`, which may change). At close the participant is marked `completed`, research
reminders and collection stop, and regular reminders resume. Their rows stay.
The app tells them the study is over. A participant who withdraws also gets
their regular reminders back.

**Streaks are not frozen** (decided 13 Oct). Suppressing the streak nudge and
meal reminders may lower normal engagement for three weeks, and a participant
may lose a streak. Streak logic is left exactly as it is.

### 4.3 The end-of-day survey

Delivery, in order:

1. A native push at the configured evening time, through APNs. Web push for
   web users.
2. **If the app is already open at that time**, the survey opens by itself. No
   tap on a notification.
3. **If the app is closed**, iOS cannot launch it for you. The survey opens when
   the participant taps the push, or on their next launch that evening.
4. A survey missed one day is offered once more the next day, marked late, until
   that day's own survey comes due. Then it lapses, so a student is never asked
   for yesterday's and today's one after the other. The late flag is stored.

The researchers should hear item 3 plainly. A closed app cannot be forced open.
Response rate, which drives compensation, depends on this.

**A separate path.** The existing survey system (`034_surveys.sql`) caps one
survey per university per week and hides identity from admins by design.
Both rules are right for dining services and wrong here. Research surveys
live in `research.questions` and `research.responses` and must not consume or
inherit that cap.

**Questions can differ by group.** Each question carries a `groups` list. Empty
means every group, `{S}` or `{L}` means only that group. So the survey can be
identical, partly shared, or fully separate without a code change, and the
decision can wait until the researchers make it. In the Data sheet, a shared
question is one column across everyone. A group-only question is blank for the
other group, which is correct and not missing data.

**The researchers' survey is loaded** (draft of 7 Oct 2026, "Dining daily survey").
`research.seed_daily_survey(<study id>)` adds it and the intro line above it, and
does nothing if the study already has questions. PRELOAD is group S and LOOP&PLAN
is group L.

| For | Question |
| --- | --- |
| Everyone | Did you eat lunch in Usdan or Sherman all-you-care-to-eat (AYCTE) dining hall today? Yes - in Usdan, Yes - in Sherman, No |
| Group L | Did you use the "loop and plan" strategy before getting food? 1 Not at all to 5 Completely |
| Group S | Did you eat the snack given to you before lunch today? Yes or No |
| Group S, only after Yes | How long before lunch did you eat the snack? 0-20, 21-60 or more than 1 hour |
| Everyone | To what extent were your lunch choices today consistent with your eating goals? 1 Not at all to 5 Completely |
| Everyone | How much food was left at the end of your meal? Little or None, 1/4, 1/2, 3/4, 1 or 1+ plate |

Decisions made while loading it:

- **The email question is left out.** Bento already knows who each participant is,
  which is what it was for.
- **Everyone gets the lunch questions even after answering No** to the first, as the
  draft says. Asking a student who ate nowhere how much food was left over is odd. If
  they should skip the rest, those questions get a `show_if` on the first one.
- **Dinner is off.** The researchers are debating it. Pass `true` as the second
  argument to add a dinner block: a gate question, then the dinner loop question for
  group L, the goals question and the leftovers question, each only after an answer
  other than No. The draft's dinner block repeats the lunch snack question, which
  cannot apply to dinner, and its dinner loop question says "lunch", so those were not
  copied over as written.
- **The leftovers question is text options** (Little or None through 1+ plate). The
  researchers asked whether to show pictures. Pictures are not built.
- A double "you" in the loop question was corrected.

**Follow-up questions and scale labels.** A question can have a `show_if`: shown only
after one answer, or after any answer except some. The follow-up is not answered when
it is not shown, and the database refuses an answer to one that was not shown, so the
data never holds an answer to a question the student did not see. A rating can carry
labels for 1 and for 5, shown under the numbers.

**Question formats.** Reuse the four existing ones: `multiple_choice`,
`short_answer`, `rating`, `yes_no`. A closed set renders without interpreting
free-form config. The researchers will probably want more. Add formats only on
request, such as a slider or a multi-select.

**Questions are versioned.** Editing a question creates a new version and
leaves the old one in place. Every response stores the question version it
answered. The dashboard warns before a mid-study edit and the audit log records
it. Without this, a changed question quietly mixes two different instruments in
one column.

---

## 5. Data model

All tables are in the `research` schema. Provisional until the previous-study
materials arrive.

| Table | Holds |
| --- | --- |
| `studies` | One row per study. Name, code hash, groups, `match_on`, cap, `is_open`, `is_test`, `window_days`, start and end dates |
| `roster` | The researchers' list. Study, match key (lower-cased email), optional name. `claimed_by` and `claimed_at` are no longer used (063) |
| `participants` | `user_id` (plain uuid, **no foreign key**, see 1.1), `participant_code`, `group` (S or L), `roster_id`, `full_name` (from the list, may be empty), `email`, `enrolled_at`, `window_ends_at`, `status` (active, completed, withdrawn), `withdrawn_at`, `acknowledged_at`, `platform`, `push_status`, `install_state` |
| `reminder_schedules` | Study, group, send time, days, title, body, active |
| `questions` | Study, version, text, format, options, `groups`, position, active, edited by, edited at |
| `responses` | Participant, question version, answer, `answered_at`, `late` |
| `meals` | Copied from `meal_history` after enrolment. Date, meal, hall, items, confirmed, macros |
| `plates` | Per-plate consumption and waste, from the existing consumption feature |
| `profile_snapshots` | TDEE, targets, restrictions, weight, height, age, sex. A new row on every change, never an overwrite |
| `events` | App opens, streaks, favorites, notification sent and opened, install state changes |
| `prompts` | Every research reminder and survey prompt, with its group. Sent at, delivered or failed, opened at, answered at |
| `arm_flags` | Per-group app settings from 4.1 (table keeps the name `arm_flags`, the column is `group`) |
| `researchers` | Dashboard accounts and roles |
| `audit_log` | Exports and setup edits. Append-only |

**Snapshots, not overwrites.** A participant who changes their calorie target
mid-study should leave both values in the data. Row history is cheap here and
cannot be rebuilt later.

**Two tracks stay separate.** From the plan: `participant_activity` carries
compensation (days enrolled, prompts sent, prompts answered, plates logged,
reports filed) and no food data. `meals`, `plates` and `profile_snapshots`
carry behaviour and no compensation metrics. Both key on `participant_code`. It
is a view over `prompts`, `responses` and `plates`, not a stored table.

**Response rate per group** is a first-class sheet and a header card. The plan
explains why. It is the control that makes the waste figure defensible.

---

## 6. The dashboard

### 6.1 Pages

| Page | What it does |
| --- | --- |
| **Live** | Enrolled against cap, group balance (S and L), today's survey response rate per group, days left in each participant's window, prompts delivered and failed, a feed of the latest events, participants with push off |
| **Data** | The spreadsheet. One tab per sheet |
| **Compensation** | The activity view. One row per participant, response rate per group beside it, export |
| **Setup** | Code on or off, cap, reminder time, survey time, questions, and the list (view, with who has not enrolled). Everything here is audited |
| **People** | Participants with identity, status, withdrawal, push state. The only page that shows names |
| **Audit** | Read-only log |

### 6.2 The grid

Sheets as tabs: Participants, Responses, Meals, Plates, Profiles, Events,
Prompts, Activity, and a Data Dictionary that lists every column with its type,
source, and meaning.

Behaviour, matching what Excel users expect:

- Frozen header row and a frozen first column (participant code)
- Click a header to sort, shift-click for a second key
- Per-column filters: text, number range, date range, set
- Show and hide columns, drag to reorder, resize
- Quick search across the sheet
- Select cells and copy to the clipboard as tab-separated values
- Row count and "last updated" in the footer
- Virtualised, so ten thousand rows scroll smoothly
- New rows arrive live and flash briefly. The grid does not re-sort or move
  under the cursor. A "3 new rows" chip applies them on request when the
  user has sorted or filtered

**Read-only.** No cell editing, no formulas. Researchers analyse in Excel or R
after export. An editable grid is a much larger build and raises data
integrity problems.

**Library.** AG Grid Community (MIT) covers sort, filter, pinning, virtual
scroll and CSV export. Its XLSX export is a paid tier, so XLSX comes from
SheetJS or ExcelJS, which also lets one workbook hold every sheet. Decide in
phase 5 after a prototype against 5,000 rows. Avoid anything that needs a
licence key in a public repo.

**Export.** CSV for one sheet. XLSX for one sheet or the whole workbook. Both
use the filters currently applied, with a checkbox for "ignore filters". Every
export writes an audit row with the filter state and a row count. Exports
that include the People sheet are labelled "contains identities" in the file
name.

### 6.3 Roles

| Role | Can |
| --- | --- |
| `researcher` | View all sheets and identity. Export. Edit setup |
| `owner` | Everything above, plus invite and remove researchers. That is you |

The researchers asked to edit questions and settings, so no read-only role
exists yet. Add one if a collaborator should see data without touching setup.

---

## 6a. The dashboard as built (phase 5)

Built 13 Oct, tested against made-up data and not yet against a real study. Source
is `src/research/`, built apart from the student app by `vite.research.config.js`:
`npm run dev:research` and `npm run build:research`. Nothing in the student build
imports from it, and the iOS bundle was checked to contain none of it.

What is there:

| Page | What it does |
| --- | --- |
| Sign in | Email and password, then a code from an authenticator app. First time, the dashboard walks the researcher through adding the app. A password alone never reaches the data, in the screen and in the database |
| Live | Enrolled against the cap, group balance, survey response rate per group, what was sent today, who cannot be reached, and a feed of the latest activity. Counts and codes only. No name or email on this page |
| Data | Nine sheets as tabs: Participants, Roster, Survey answers, Meals, Plate items, Profiles, App usage, Reminders sent, Activity. Sort, a filter on every column, search across all columns, frozen header and first column, show and hide columns, resize, reorder, and a live row count. Rows arrive live without losing the sort, filters or scroll |
| Compensation | The Activity sheet with response rate per group at the top |
| Audit | Owners only. Every export and sign in |
| Export | One sheet as CSV or Excel, what is filtered or every row, or all sheets as one Excel file with a Data Dictionary sheet |

Decisions and limits:

- **Every export is recorded first.** If the log refuses, no file is made. A file with
  names or emails says so in its file name, and so does an export that was filtered.
  The all-sheets file leaves out the two sheets with names unless asked.
- **Opening a sheet of names or emails is recorded**, once a session.
- **Spreadsheet formulas typed by participants are defused in CSV**, because free-text
  survey answers could otherwise run when a researcher opens the file.
- **The People page is the Participants and Roster sheets.** They hold names and
  emails, so they are tagged and audited. There is no separate page.
- **Read-only, no formulas.** AG Grid Community has no range selection or range copy
  (those are paid). A cell copies, rows can be selected, and Export covers the rest.
- **Idle sign-out after 30 minutes**, and the session ends when the tab closes.
- **Not built:** inviting researchers from the page (see below), the Setup page
  (phase 6), and a "N new rows" chip when a sorted sheet gets new rows. New rows go
  straight into place.
- **Not benchmarked precisely.** About 9,000 rows searched, sorted and scrolled
  without delay, with 26 rows in the page at a time.
- **The security headers in `vercel.research.json` are untested** until the site is
  deployed. If the page loads blank, look at the browser console for a blocked
  resource first.

Look at it without a database: `npm run dev:research`, then open
`http://localhost:5210/research.html?stub=researcher`. Other stubs: `owner`, `nomfa`
(the code is 123456), `enroll`, `student`, `signedout`. Add `&rows=8000` to try a big
sheet. The stub is development only and is not in the production build.

**Setting it up for real**

1. Apply migrations 057 and 058.
2. Supabase, Settings, API, Exposed schemas: add `research`. The dashboard reads the
   `research` schema directly, so without this every sheet fails.
3. Supabase, Authentication, Sign In / Providers, Multi-Factor: turn on TOTP.
4. Create the Vercel project from `vercel.research.json`, add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`, and point `research.bentodining.com` at it.
5. Add yourself as an owner: invite yourself under Authentication, Users, then
   `select research.add_researcher('<your email>', 'owner');`
6. Add each researcher the same way, with `'researcher'`. To turn one off at once:
   `select research.remove_researcher('<email>');`
7. Sign in, set up the authenticator app, and check Live, then Data.

## 6b. The Setup page (phase 6)

Built 13 Oct, in the dashboard under Setup. Researchers and owners both use it. It is
migration 058, `src/research/SetupPage.jsx` and its logic in `setup.js`.

| Part | What a researcher can do |
| --- | --- |
| The study | Open or close enrolment, the cap, the number of days in the study, an enrolment start and end date in Eastern time, and the line above the end-of-day questions |
| Study code | Replace it. It is stored scrambled, so it cannot be shown back. The old one stops at once and people already in are unaffected |
| Times | Edit a reminder or survey time, its days, how late it may arrive, and its words. Switch one off and on. Add a new one for a group or for everyone |
| Questions | Add one, change one, retire and restore one. Follow-ups, scale labels and group limits are all there. Each question shows how many answers it has |
| The list | Counts of who is on it, enrolled and not yet, with a link to the Roster sheet |

**How it is protected.** A researcher cannot write to any research table. Every change
goes through a database function that:

- refuses anyone who is not an active researcher on a multi-factor session, by raising
  an error, so a refusal is never mistaken for a save;
- refuses the App Review test study, which researchers cannot see;
- checks every value, so a bad one is an error and not a surprise mid-study;
- writes one audit entry saying who changed what, from what, to what. A save that
  changes nothing writes nothing. The study code is never written down, only the fact
  that it changed, and neither is the text of the intro or a message body.

**What cannot be changed here, on purpose:** the wording of a question that has been
asked, a participant's group, the researchers' list, and which group or kind a time
belongs to.

**Changing a question never strands its follow-ups.** A follow-up that depends on a
question which is no longer asked would simply never appear, and nothing would say so.
Testing the page found this. So in the database:

- changing a question adds a new one and retires the old, and its follow-ups, and
  theirs, are copied to follow the new one in the same transaction;
- retiring a question retires its follow-ups with it, and says how many;
- a change the follow-ups could not survive is refused whole, with nothing saved: a
  different kind of answer, a pick-one choice a follow-up names, or a position that
  puts the question after its follow-up;
- a follow-up cannot be brought back while its question is retired.

The page says all of this before the change is made, including how many answers a
wording has and how many follow-ups will move.

**A mid-study edit mixes two questions in one column.** The page warns of that every
time. It is the researchers' decision, and it is in the audit log.

Not on this page: loading or editing the researchers' list (it is loaded from their
file by whoever runs Bento), and creating a study.

## 7. Bento's own use of the data

Bento has permission to use the data too. The distinction from the regular pool is
two rules:

1. **Research rows live in `research.*`.** They are never mixed into `public`
   tables and the app code keeps working as it does today.
2. **Dining Pulse excludes the cohort.** Built. Behaviour of participants in either
   group is shaped by the study and would otherwise leak into the numbers Brandeis
   sees. The earlier draft of this spec said one helper covers everything. It does
   not, so there are three places:
   - `getUserIdsForUniversity` in `src/lib/pulseDb.js`, which scopes the overview,
     engagement, meal split, waste, top items, halls and dietary breakdown, and the
     two profile counts, which now use the same filter. If a database has no
     `research_cohort` column yet, the read is repeated without it.
   - The `item_rating_aggregates` view, redefined in migration 055.
   - `get_survey_results`, redefined in migration 055. Participants still see and
     answer dining survey popups. Their answers are kept and not counted.

   Not covered: the anonymous suggestion box, which has no user on its rows.

Bento's own analysis goes through the `owner` role in the same dashboard and
exports, so every use is audited. That is the cleanest answer to "can we prove
what we used it for."

---

## 8. Build order

Each phase ships on its own. Phases 1 and 2 have no dependencies and can start
now. The study cannot launch until the enrolment update is live on the App
Store, which depends on section 1.2.

| Phase | Work | Needs |
| --- | --- | --- |
| 1 | **Built 13 Oct, not yet applied to Supabase.** `054_research_foundation.sql` and `scripts/test-research-sql.mjs` (37 tests). Schema, RLS, researcher role, `studies`, `roster`, `participants`, list loader and `scripts/roster-to-sql.mjs`, code check and enrol functions, rate limit, leave, window close | Nothing |
| 2 | **Built 13 Oct, iOS only.** Onboarding step and Settings entry, code screen, one-tap acknowledgement, push permission, leave flow. The `is_test` study for App Review is created from the SQL editor, not in code | Phase 1. Nothing from the researchers |
| 3 | **Built 13 Oct, not yet applied to Supabase.** `055_research_collection.sql`. Triggers copy meals (with consumption), profile snapshots and events for active participants only, and can never block a student's own write. `research.plate_items` flattens a plate to one row per item. Dining Pulse exclusion in three places (section 7). Column list is provisional until the researchers' materials arrive | Phase 1 |
| 4 | **Built 13 Oct, not yet applied to Supabase.** `056_research_reminders_and_survey.sql`, `api/research-send.js`, `api/_research.js`, `.github/workflows/research-send.yml`, the survey screens and the check in the three existing senders. 79 SQL tests, 18 sender tests. Reminder wording for group L is a draft, and there are no survey questions or survey time yet (section 8a) | Phases 1 and 3 |
| 5 | **Built 13 Oct, not yet applied or deployed.** `057_research_dashboard.sql`, `src/research/`, `vercel.research.json`. Sign in with MFA, Live, nine-sheet Data grid, Compensation, Audit, CSV and Excel export with audit, live updates. Researchers are added from SQL, not from the page (section 6a) | Phases 1 to 4 |
| 6 | **Built 13 Oct, not yet applied.** `058_research_setup.sql`, `SetupPage.jsx`. Study settings and code, reminder and survey times, questions with follow-ups, the list summary. Every change is audited. 114 SQL tests, 28 for the page logic | Phase 5 |
| 7 | App Store update: labels, manifest, reviewer notes, 5.1.3 | Phase 2 |
| 8 | Launch checks: Pro plan, restore drill, dry run with test participants | All |

**Tests.** The repo already tests SQL in `scripts/test-duo-sql.mjs`. Add the
same for research. The ones that matter:

- A non-participant's rows never appear in `research.*`
- Data from before `enrolled_at` never appears
- Data after `withdrawn_at` never appears
- A `researcher` cannot select from any `public` table
- A student cannot select from any `research` table, including their own rows
- A dining admin cannot select from `research` at all
- A wrong code, a closed study and a full cap return the same message, and a right code from an unlisted student returns a different one
- Only `'ios'` can check a code or enrol
- Six wrong codes in an hour lock the sixth attempt
- Each pair in order of arrival gets one of each, the first of a pair and the odd person out are random, withdrawn people still count, and a group on the list is ignored
- A list row can be taken once, and a taken row cannot change who it matches
- A list load that fails adds nothing
- Deleting an auth user leaves every `research` row for that user intact
- An active participant receives no meal reminder, streak nudge or Duo push
- A completed or withdrawn participant receives them again
- A group S question never appears for a group L participant
- A question edit leaves earlier responses pointing at the old version
- Test-study participants never appear in researcher views or counts

---

## 8a. Scheduling, and getting ready to launch

**Timing is the weak point.** The snack reminder is meant to land at 10:30, thirty
minutes before lunch opens, and it is worth nothing much after 11:00. The only
schedulers wired up are the weakest ones available:

- Vercel's Hobby plan runs a cron once a day, at a time it does not promise.
- GitHub's scheduler is best effort. This repo's own notes (`meal-reminders.yml`)
  record runs arriving minutes to hours late and some not arriving. Five minutes is
  the shortest interval it allows.

What is built: `.github/workflows/research-send.yml` calls `/api/research-send`
every five minutes. The database claims what is due before anything is sent, and
drops a reminder that is more than its late window (30 minutes by default) past its
send time. So a late run can cost a missed reminder and can never send a stale one
or a duplicate. Treat it as a backstop.

**For delivery you can rely on, add pg_cron.** It fires on the minute from inside
Supabase. Enable the `pg_cron` and `pg_net` extensions (Database, Extensions), then
run this once in the SQL editor with the real secret in place of the placeholder.
Running it alongside the workflow is safe, because the claim cannot double-send:

```sql
select vault.create_secret('<the CRON_SECRET value>', 'research_cron_secret');

select cron.schedule('research-send', '* * * * *', $$
  select net.http_get(
    url     := 'https://www.bentodining.com/api/research-send',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'research_cron_secret'))
  );
$$);
```

To stop it: `select cron.unschedule('research-send');`

**Launch checklist.** Everything below runs in the Supabase SQL editor unless it
says otherwise. Nothing here is in the repository, because the code, the list and
the questions must not be.

1. Apply migrations 054, 055 and 056. 054 is done. Pushing to main applies the rest.
2. Move Supabase to Pro for backups, and restore from one once before launch.
3. `select research.create_study('<name>', '<the study code>', 40);` Note the id.
4. `select research.seed_default_reminders('<id>');` adds each group's reminder 30 minutes before lunch (10:30) and before dinner (16:30 by default, a placeholder: pass the real time as a second argument).
   **The wording is a draft.** Edit `title` and `body` in `research.reminder_schedules`.
5. Add the survey schedule. The time is not decided:
   `select research.add_schedule('<id>', null, 'survey', '<HH:MM>', 'Today''s questions');`
6. Load the questions: `select research.seed_daily_survey('<id>');` adds the
   researchers' survey. To add or change one by hand use
   `research.add_question('<id>', '<text>', '<format>', ...)`. Formats: `yes_no`,
   `rating` (1 to 5, optionally with two labels as `'["Low","High"]'`),
   `multiple_choice` (give `'["a","b"]'` as the options) and `short_answer`. Pass
   `array['S']` or `array['L']` to limit one to a group, and a last argument such as
   `'{"question":"<id>","any_of":[true]}'` for a follow-up. To change a question, add
   the new one with the old id as `p_replaces`.
7. Load the researchers' list: `node scripts/roster-to-sql.mjs <id> list.csv | pbcopy`.
8. Create a second study with `p_is_test := true` for App Review and for your own
   account, and walk through it on a real phone first. No push has been seen
   arriving on a device end to end yet (`IOS_SPEC.md`).
9. Turn on pg_cron.
10. Open the study: `update research.studies set is_open = true where id = '<id>';`
11. Ship the iOS update, after the App Store items in section 1.2.

## 9. Open questions

Resolved: regular reminders are off for the window, account deletion leaves
research rows alone, consent lives in the researchers' Qualtrics survey, the
researchers supply the list and Bento randomises (pairs in order of arrival),
group L's reminder time (same as group S), the window length (21 days from each
person's enrolment, held as data), streaks (not frozen), and the number of
groups (two, no control group). What is left:
1. **The list.** Arrives in waves after people have enrolled. Which email will it
   hold, the one students use for Bento or one from Qualtrics? Anyone whose
   addresses differ will show as enrolled but not on the list.
2. **Previous-study materials.** Not shared yet. Every column list above is
   provisional until they arrive. Ask for them first.
3. **Group L wording.** The method is known (loop the hall, plan, then fill your
   plate). The reminder text is not written. Needed before phase 4.
4. **Survey questions.** Identical for both groups, partly shared, or separate?
   Left flexible for now. Also needed: the evening send time, the questions,
   and the formats. If they need a format beyond the four existing ones, say
   which.
5. **Other differences in the app.** Beyond the reminders and the survey, does
   anything else change for participants? Each item becomes a flag.
6. **Withdrawal, deferred.** For now: the participant can leave from Settings,
   collection stops, the status becomes `withdrawn`, regular reminders return,
   and all rows are preserved. Whether rows are later purged, truncated to the
   withdrawal date, or kept is to be decided with the researchers. Their consent
   form has to say which.
7. **Retention.** How long after the study ends does Bento hold identifiable
   data, and who deletes it? With deletion-proof rows and no purge, this needs
   an owner.
8. **Dietary restrictions.** The plan deferred them. If included, the
   researchers' consent form must name religious data explicitly.
9. **Who is the data controller.** The researchers, Bento, or jointly. It
   changes the privacy policy wording and the App Store label answer. The
   deletion decision points toward the researchers being the controller of the
   study data.
10. **Researcher accounts.** How many, and who pays for seats if the number
   grows. The invite flow handles any count.
11. **Multiple devices.** If a participant signs in on two devices, both get
    the push. Say if that is wrong.
12. **Second study.** Still open from the plan. The spec supports several
    `studies` rows but the rest assumes one cohort at a time.
13. **Survey send time.** The schedule is data, so a default is not needed in code,
    but none exists yet. Which evening time, and on which days?
14. **Dining survey popups for participants.** Participants still see and answer
    the dining team's survey popups, and their answers are kept and not counted. Is
    that right during a study, or should the popup be switched off for them? It is
    a small change either way.
15. **Reminder timing precision.** Is a snack reminder that can arrive a few
    minutes either side of 10:30 acceptable? If not, pg_cron is not optional.
16. **Dinner.** Ask about dinner too? The block is written and switched off. It adds
    about three questions to a daily survey that is meant to take a minute.
17. **Food left over.** Keep the plate-size text options, or show pictures? Bento
    already records, per item, how much of a plate a student says they ate. That is in
    the meals sheet, so the survey question may be a second measure of the same thing.
18. **Skip the lunch questions after No?** See section 4.3.

## 10. The survey sheet in the researchers' format (migration 060)

The researchers' May 2026 export (Qualtrics, one row per submission, one column per
question, answers as numeric codes: `lunchYN`, `lunch_loop`, `lunch_waste` and the
dinner twins) is the reference for how the data should look. The dashboard has a
sheet, "Survey (research format)", in that shape. The long "Survey answers" sheet
stays for reading the wording.

- **Rows.** One per participant per day. Fixed columns: `ResponseId`, `id` (the
  participant code, in place of the typed email prefix), `group`, `for_date`,
  `RecordedDate`, `late`. Then one column per question, named by the question's
  column name and filled with its code. Bento does not record a start time, a
  duration, an IP address or a location, so those Qualtrics columns are not there.
- **Column names and codes** are labels on a question (`questions.column_key` and
  `questions.codes`), edited in Setup, and never need a database change. A pick-one
  answer is its choice's code (the place from 1 when none is set), yes is 1 and no
  is 0 unless set, a rating is its own number. A replacement question keeps the
  column name and codes of the one it replaces, so a column carries on across a
  wording change. Past rows are re-labelled when read.
- **Built in the browser** from `grid_survey_wide` (each day's raw answers keyed by
  question id) plus the questions, so a new question appears as a column with no
  deploy. The data dictionary in an export has a line per column with the wording
  and what each number means.
- **Highlights** above the grid: submissions, participants answering, share late,
  submissions per group and the average of each rating.
- **Guessed, to confirm with the researchers.** The May `lunchYN` held 0, 1 and 2.
  The seed assumes 1 Usdan, 2 Sherman, 0 No, and says so in the migration. Their
  loop scale was 1 to 7 and Bento's rating is 1 to 5. Their "why leftover"
  question (check all that apply, with an Other text column `_5_TEXT`) and "how
  many plates" are not in the October draft and have no question type here.
