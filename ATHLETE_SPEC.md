# Bento Athlete: nutrition for college athletes

Status: design, written 28 Oct 2026. Nothing is built. Not checked against a sports dietitian.

## 1. What this is

Athlete mode is a setting inside Bento. It changes a student's targets and plan around
training and competition. Coaches post games and meets from Bento Pulse. Athletes see
those dates, and the plan adapts. Coaches see team totals and nothing about any
individual.

## 2. Decisions (28 Oct 2026, with the owner)

| Question | Decision |
| --- | --- |
| First customer | Individual athletes. Athletic departments come later |
| What a coach sees | The schedule they posted, plus team aggregates |
| How targets are set | Sport and season presets, adjustable by the athlete |
| App structure | A mode inside Bento. One app, one App Store review |

## 3. Rules

1. **Pulse sees aggregates only.** No rows, no names, no individual meals, weights or
   targets. This is the same rule as the rest of Pulse and the basis for the Apple
   privacy labels.
2. **A coach cannot see an individual athlete.** Not their meals, targets, weight,
   ratings or whether they joined, beyond the team count.
3. **Aggregates need at least 5 athletes.** A team of 3 would let a coach work out who
   did what. Below 5 reporting athletes, Pulse shows nothing for that figure.
4. **Joining a team is the athlete's choice.** A code, like Buddies. An athlete can
   leave at any time, and leaving removes them from every count.
5. **The coach writes dates. Dates never include athlete data.**
6. **No weight-loss framing anywhere.** No body weight goal, no "cut", no deficit
   targets in Athlete mode. See section 8.
7. **Athlete mode is optional and reversible.** Switching it off returns the student
   to their normal targets and deletes nothing.
8. **Nothing here is medical advice.** Presets are starting points and the copy says
   so.

## 4. Phases

### Phase 1: Athlete mode, self-serve (no coach needed)

- Turn on in Settings. Pick a sport group and a season phase.
- Presets set calorie, protein, carb and fat targets. The athlete can edit any number.
- Training load per day: rest, light, heavy, two-a-day. One tap on Today, remembered
  per date.
- Meal shares change with load. A two-a-day shifts weight toward a pre-practice snack
  and a post-practice meal. This reuses `mealShares` and `replanMeals` in
  `src/utils/dayPlan.js`.
- The athlete can add a game or meet by hand: date, time, home or away.

**Done when** an athlete can set a sport, mark a heavy day, and see Today re-plan
around it, with no account other than their own.

### Phase 2: Game-day fueling

- A game or meet in the next 3 days changes the plan:
  - Day before: carbohydrate share up, fat and fiber share down.
  - Game day, 3 to 4 hours before: a full meal, carb forward, low in fat and fiber.
  - Within an hour before: a small snack, or nothing, the athlete's choice.
  - Within an hour after: a protein and carbohydrate snack. Then a full meal.
- Away games and travel days mark meals as "eating out", which uses the existing
  dinner out switch.
- A reminder at the right time for each of these, using the existing push route.
- Dishes are still chosen from the live menu and still pass the allergy and diet
  filter.

**Done when** adding a game 24 hours out visibly changes the day before and the day of.

### Phase 3: Coach accounts and team schedules (Pulse)

- A Bento Coach signs in to Pulse, creates a team, and gets a join code.
- The coach adds events: game, meet, or travel day, with date, time and notes.
- Athletes who joined with the code see those events in Bento, labelled with the team
  name, and the Phase 2 logic applies without the athlete typing anything.
- Pulse shows the coach only team aggregates:
  - how many athletes joined
  - the share who confirmed meals on the day before and the day of an event
  - the most confirmed foods across the team
  - ratings of dining hall dishes, as in the rest of Pulse
- All figures follow rule 3.

**Done when** a coach posts a game and every joined athlete's plan changes, and the coach
can see nothing about any one athlete.

### Phase 4, later (not designed)

- Team dietitian role. Athletic department accounts and billing.
- An athlete choosing to share a summary with their coach. This needs its own consent
  screen, new privacy labels, and a new App Review answer. It is not part of this spec.

## 5. Targets

Presets come from published sports nutrition guidance, not from Bento's own formulas.
The starting reference is the 2016 joint position statement of the Academy of Nutrition
and Dietetics, Dietitians of Canada and the American College of Sports Medicine, which
gives ranges per kilogram of body weight by training load.

| Nutrient | Range in the statement | Used by |
| --- | --- | --- |
| Carbohydrate | about 3 to 12 g per kg per day, by load | rest day low end, heavy and game days high end |
| Protein | about 1.2 to 2.0 g per kg per day | every day |
| Fat | about 20 to 35% of energy | every day |

Before shipping:

- A registered sports dietitian reviews every preset and the copy. The ranges above are
  the owner's starting point, not a verified clinical table.
- Sport groups stay coarse: endurance, strength and power, team and field, skill and
  precision. Presets by individual sport can come later.
- Calorie targets use the existing profile calculation plus a load multiplier by day.
  The multiplier values are open (section 9).
- Presets are shown as a range with an "adjust" control. Bento never says a number is
  right for the person.

## 6. Data model

All tables use `user_id uuid references auth.users(id) on delete cascade`, so
`delete_user()` removes everything. Migrations are idempotent and safe to paste into
the SQL editor.

**Athlete profile** (columns on `profiles`, or one `athlete_profiles` row per user):

| Field | Notes |
| --- | --- |
| `athlete_mode` | boolean, default false |
| `sport_group` | one of four, null when mode is off |
| `season_phase` | off-season, pre-season, in-season, post-season |

**Training days** (`athlete_load_days`): `user_id`, `load_date`, `load`
(rest, light, heavy, double). Primary key on user and date.

**Events** (`athlete_events`):

| Field | Notes |
| --- | --- |
| `id`, `team_id` | `team_id` is null for an event the athlete added by hand |
| `user_id` | set only for a hand added event |
| `kind` | game, meet, travel |
| `starts_at`, `home` | when it starts, and whether it is home |
| `note` | coach text, short, shown to athletes |

**Teams** (`teams`, `team_members`):

- `teams`: `id`, `coach_user_id`, `name`, `join_code`, `created_at`.
- `team_members`: `team_id`, `user_id`, `joined_at`. Only the athlete can insert or
  delete their own row. The coach never reads this table directly.

**Access, using the Buddies pattern:**

- Athletes read events through a `security definer` function that checks membership and
  sets `search_path = ''`.
- Coaches write events and read team aggregates only through functions that return a
  figure or nothing. No function returns a row about a person.
- Every aggregate function returns null unless at least 5 members contributed.
- Test with pglite in the same harness as `scripts/test-duo-sql.mjs`. At minimum:
  a coach cannot read `team_members`, a team of 4 returns null, leaving a team removes
  the athlete from the next count, and an athlete cannot read another team's events.

## 7. Where this lives in the code

- `src/utils/dayPlan.js`: load and event inputs to meal shares and targets.
- `src/lib/mealPrefs.js`: new store for athlete mode and per-day load, same pattern as
  skip breakfast and dinner out. Clear it on sign out like the other account keys.
- `src/components/Settings/Settings.jsx`: Athlete section.
- Today tab: a load picker and an event chip.
- Pulse: team page, event form, aggregate cards.
- `api/send-reminders.js`: event timed reminders.

## 8. Safeguards

- No target below the athlete's resting needs, whatever the athlete types. If an
  entered calorie target is under a floor, the app shows a message and keeps the
  previous value. The floor is open (section 9).
- No streak, badge or quest rewards eating less. Streaks reward confirming meals, as
  today.
- No "deficit", "cut", "lean", or body weight goal copy. The profile goal options in
  Athlete mode are fuel for training, maintain, and gain.
- A short note in Settings with a link to the school's team dietitian or counseling
  services. The wording is set by the owner (section 9).
- Pulse never shows individual intake to anyone, including the coach. This is what
  keeps a coach from using Bento to monitor an athlete's eating.

## 9. Open items

1. Day load multipliers on calories (rest, light, heavy, double). Needs a dietitian.
2. The calorie floor in section 8.
3. Whether the minimum of 5 for aggregates is right, or should be higher.
4. Wording for the support note, and who it points to.
5. How a coach proves they are a coach. Options: a school email on Pulse sign up, or
   a manual approval by the owner at first. Manual is safest for a small start.
6. Whether a coach may be on more than one team, and whether an athlete may be on more
   than one team (two sports).
7. NCAA and school policies on who may hold athlete data. Needs someone who knows them.
   This spec makes no claim about what is permitted.
8. Terms and privacy text for athletes and for coaches.

## 10. App Store and privacy impact

- Same app, same listing. Athlete mode ships in a normal update.
- Privacy labels: Phase 1 adds no new data types, since weight and goals are already
  collected. Phase 3 adds team membership, which is linked to the user and used only for
  the app's function. Re-check every label before submitting.
- App Review notes: explain that coaches use a separate web dashboard, and give a demo
  athlete account. A coach account may be requested, so a demo coach login is needed
  for Phase 3.
- Health and fitness data stays under guideline 5.1.3. The coach view returns only
  aggregates, which keeps that answer the same.

## 11. Order of work

1. Dietitian review of presets and multipliers (can run alongside step 2).
2. Phase 1 migration, store, Settings section, load picker. Tests for the plan math.
3. Phase 2 event logic and reminders.
4. Phase 3 tables, access functions and tests, then Pulse screens.
5. Privacy text, labels and demo accounts. Submit.
