// Runs supabase/migrations/054_research_foundation.sql against a real Postgres (pglite)
// with a stand-in for the Supabase pieces it relies on, then checks the rules in
// RESEARCH_DASHBOARD_SPEC.md section 8.
//
//   npm i --no-save @electric-sql/pglite && node scripts/test-research-sql.mjs
//
// Not covered here: that a researcher sees only their own rows in the public
// schema. That comes from the existing row-level security on those tables, which
// this stand-in does not reproduce.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { SHEETS, AUDIT_SHEET } from '../src/research/sheets.js';

const dir = process.env.MIGRATIONS_DIR
  ? process.env.MIGRATIONS_DIR
  : new URL('../supabase/migrations/', import.meta.url).pathname;
const migrations = ['054_research_foundation.sql', '055_research_collection.sql', '056_research_reminders_and_survey.sql',
  '057_research_dashboard.sql', '058_research_setup.sql', '059_research_randomisation.sql', '060_research_wide_survey.sql', '061_research_roster_views.sql', '062_research_dinner_reminders.sql', '063_research_open_enrolment.sql']
  .map((f) => readFileSync(`${dir}/${f}`, 'utf8'));
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, university text,
    weight numeric, weight_unit text, height_feet integer, height_inches integer, age integer, sex text,
    activity_level text, goal text, skip_breakfast boolean default false, push_enabled boolean default false,
    mascot_color text);
  create table public.nutrition_targets (id uuid primary key default gen_random_uuid(),
    user_id uuid unique references public.profiles(id) on delete cascade,
    calories numeric, protein numeric, carbs numeric, fat numeric);
  create table public.dietary_restrictions (id uuid primary key default gen_random_uuid(),
    user_id uuid unique references public.profiles(id) on delete cascade,
    vegetarian boolean default false, vegan boolean default false, halal boolean default false,
    kosher boolean default false, allergies jsonb default '[]', updated_at timestamptz default now());
  create table public.meal_history (id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    confirmed_at timestamptz default now(), items jsonb not null default '[]',
    meal_type text, meal_date date, dining_hall text, unique (user_id, meal_date, meal_type));
  create table public.favorites (id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    item_id text not null, name text, unique (user_id, item_id));
  create table public.streaks (id uuid primary key default gen_random_uuid(),
    user_id uuid unique not null references public.profiles(id) on delete cascade,
    current_streak integer default 0, longest_streak integer default 0, last_confirmed_date date);
  create table public.push_subscriptions (id uuid primary key default gen_random_uuid(),
    user_id uuid not null, endpoint text unique not null, apns_token text);
  create table public.item_ratings (user_id uuid not null references auth.users(id) on delete cascade,
    item_id text not null, item_name text not null, rating smallint not null, university text,
    dining_hall text, primary key (user_id, item_id));
  create view public.item_rating_aggregates as
    select item_id, min(item_name) as item_name, university, round(avg(rating)::numeric, 1) as avg_rating,
      count(*)::integer as rating_count,
      case when count(distinct dining_hall) filter (where dining_hall is not null) = 1
           then min(dining_hall) filter (where dining_hall is not null) else null end as dining_hall
    from public.item_ratings group by item_id, university;
  create table public.admin_users (user_id uuid primary key, university text, is_super_admin boolean default false,
    is_active boolean default true);
  create table public.surveys (id uuid primary key default gen_random_uuid(), university text, question text,
    format text, options jsonb default '[]', target_restrictions text[] default '{}',
    published_at timestamptz default now(), closes_at timestamptz default now() + interval '7 days',
    is_active boolean default true);
  create table public.survey_responses (survey_id uuid references public.surveys(id), user_id uuid,
    status text, choice text, text_answer text, answered_at timestamptz default now());
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant execute on all functions in schema auth to authenticated, anon;
`);
for (const m of migrations) { await db.exec(m); await db.exec(m); } // each is safe to run twice

let seq = 0;
const user = async (email) => {
  seq++;
  const { rows } = await db.query('insert into auth.users (email) values ($1) returning id',
    [email ?? `student${seq}@example.edu`]);
  const id = rows[0].id;
  await db.query('insert into public.profiles (id, university) values ($1, $2)', [id, 'brandeis']);
  return id;
};
const emailOf = async (id) => (await db.query('select email from auth.users where id = $1', [id])).rows[0].email;
const as = async (id, aal) => {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id ?? '']);
  await db.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify(id ? { sub: id, ...(aal ? { aal } : {}) } : {})]);
};
const call = async (id, sql, params = [], { aal, role = 'authenticated' } = {}) => {
  await db.exec('reset role');
  await as(id, aal);
  await db.exec(`set role ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
};
const check  = async (u, code, platform = 'ios') =>
  (await call(u, 'select * from public.research_check_code($1,$2)', [code, platform]))[0];
// Bento assigns groups at random, so most tests, which need a student in a known
// group, ask for one when they put the student on the list (see `listed`) and the
// helper below moves them there after enrolment. `rawEnroll` does not, and the
// randomisation tests use it.
const rawEnroll = async (u, code, ack = true, platform = 'ios') =>
  (await call(u, 'select * from public.research_enroll($1,$2,$3)', [code, ack, platform]))[0];
const wanted = new Map();
const forceGroup = async (u, grp) => {
  await owner('alter table research.participants disable trigger participants_guard');
  await owner('update research.participants set grp = $2 where user_id = $1', [u, grp]);
  await owner('alter table research.participants enable trigger participants_guard');
};
const enroll = async (u, code, ack = true, platform = 'ios') => {
  const r = await rawEnroll(u, code, ack, platform);
  if (r.status === 'ok' && wanted.has(u)) await forceGroup(u, wanted.get(u));
  return r;
};
const status = async (u) => (await call(u, 'select * from public.research_my_status()'))[0];
const owner = async (sql, params = []) => (await db.query(sql, params)).rows;

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('ok', n, name); };

const CODE = 'MAPLE-2026';
const newStudy = async ({ code = CODE, cap = 40, open = true, test: isTest = false, window = 21 } = {}) => {
  const [{ create_study: id }] = await owner(
    'select research.create_study($1,$2,$3,array[\'S\',\'L\'],$4,$5)', ['Study', code, cap, window, isTest]);
  if (open) await owner('update research.studies set is_open = true where id = $1', [id]);
  return id;
};
// Puts a student on the researchers' list. Returns the user id.
// The list carries no group. `grp` is only the group the test wants the student
// to end up in (see `enroll`); pass grp: null to leave assignment to Bento.
const listed = async (study, { grp = 'S', name, email } = {}) => {
  const u = await user(email);
  await owner('select research.add_roster($1,$2::jsonb)',
    [study, JSON.stringify([{ email: await emailOf(u), ...(name ? { name } : {}) }])]);
  if (grp) wanted.set(u, grp);
  return u;
};

const study = await newStudy();

await test('the code is stored as a hash and never in the clear', async () => {
  const [row] = await owner('select * from research.studies where id = $1', [study]);
  assert.notEqual(row.code_hash, CODE);
  assert.equal(row.code_hash.length, 64);
  assert.ok(!JSON.stringify(row).includes('MAPLE'));
});

await test('a code too short to be safe is refused', async () => {
  await assert.rejects(owner(`select research.create_study('x','abc',10)`), /code_too_short/);
});

await test('clients cannot create studies or load the list', async () => {
  const u = await user();
  await assert.rejects(call(u, `select research.create_study('x','ABCDEFGH',10)`), /permission denied/);
  await assert.rejects(call(u, `select research.add_roster($1,'[]'::jsonb)`, [study]), /permission denied/);
});

await test('anon cannot call the student functions', async () => {
  await assert.rejects(call(null, `select * from public.research_check_code($1,'ios')`, [CODE], { role: 'anon' }), /permission denied/);
  await assert.rejects(call(null, `select * from public.research_enroll($1,true,'ios')`, [CODE], { role: 'anon' }), /permission denied/);
  await assert.rejects(call(null, 'select * from public.research_my_status()', [], { role: 'anon' }), /permission denied/);
});

await test('a signed-out call is refused', async () => {
  await assert.rejects(call(null, `select * from public.research_check_code($1,'ios')`, [CODE]), /not_signed_in/);
});

await test('a closed, full, unstarted or ended study looks exactly like a wrong code', async () => {
  const closed = await newStudy({ code: 'CLOSED-9999', open: false });
  const full   = await newStudy({ code: 'FULLFULL-1', cap: 1 });
  const early  = await newStudy({ code: 'EARLY-7777' });
  await owner(`update research.studies set starts_at = now() + interval '1 day' where id = $1`, [early]);
  const ended  = await newStudy({ code: 'ENDED-5555' });
  await owner(`update research.studies set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where id = $1`, [ended]);
  assert.equal((await enroll(await listed(full), 'FULLFULL-1')).status, 'ok');

  // Each probe is a student who IS on the list for the study they try, so the
  // only difference between them is why the code fails.
  const shape = async (code, study_) => JSON.stringify(await check(study_ ? await listed(study_) : await user(), code));
  const wrong = await shape('NOPE-0000');
  assert.equal(await shape('CLOSED-9999', closed), wrong);
  assert.equal(await shape('FULLFULL-1', full), wrong);
  assert.equal(await shape('EARLY-7777', early), wrong);
  assert.equal(await shape('ENDED-5555', ended), wrong);
  assert.equal(JSON.parse(wrong).status, 'invalid_code');
  assert.equal(JSON.parse(wrong).study_name, null);
});

await test('anyone with the right code gets in, on the list or not, and a wrong code is told apart', async () => {
  const stranger = await user();
  const r = await check(stranger, CODE);
  assert.equal(r.status, 'ok');
  assert.ok(r.study_name);
  assert.equal((await check(await user(), 'NOPE-0000')).status, 'invalid_code');
  assert.equal((await enroll(stranger, CODE)).status, 'ok');
  assert.equal((await status(stranger)).enrolled, true);
  assert.equal((await owner('select roster_id from research.participants where user_id = $1', [stranger]))[0].roster_id, null, 'nothing is matched at enrolment');
});

await test('a right code is never counted as a wrong guess', async () => {
  const u = await user();
  for (let i = 0; i < 8; i++) assert.equal((await check(u, CODE)).status, 'ok');
  assert.equal((await owner(`select count(*)::int c from research.redeem_attempts where user_id = $1`, [u]))[0].c, 0);
});

await test('only the iOS app can check a code or enrol', async () => {
  const u = await listed(study);
  for (const platform of [null, 'web', 'android', 'IOS', '']) {
    assert.equal((await check(u, CODE, platform)).status, 'ios_only', String(platform));
    assert.equal((await enroll(u, CODE, true, platform)).status, 'ios_only', String(platform));
  }
  assert.equal((await owner(`select count(*)::int c from research.redeem_attempts where user_id = $1`, [u]))[0].c, 0, 'not a wrong guess');
  assert.equal((await status(u)).enrolled, false);
  assert.equal((await check(u, CODE, 'ios')).status, 'ok');
});

await test('being on the list for another study does not open this one', async () => {
  const other = await newStudy({ code: 'OTHER-1234' });
  const u = await listed(other);
  assert.equal((await check(u, 'OTHER-1234')).status, 'ok');
  assert.equal((await check(u, 'WRONG-9999')).status, 'invalid_code');
});

await test('the code ignores case, spaces and dashes', async () => {
  assert.equal((await check(await listed(study), ' maple 2026 ')).status, 'ok');
});

await test('list matching ignores case in the email', async () => {
  const u = await user('Maya.Cohen@Example.EDU');
  await owner('select research.add_roster($1,$2::jsonb)', [study, JSON.stringify([{ email: ' maya.cohen@example.edu ' }])]);
  assert.equal((await check(u, CODE)).status, 'ok');
});

await test('five wrong codes are allowed, the sixth attempt is locked', async () => {
  const u = await listed(study);
  for (let i = 0; i < 5; i++) assert.equal((await check(u, 'WRONG-' + i)).status, 'invalid_code');
  assert.equal((await check(u, 'WRONG-6')).status, 'too_many_attempts');
  assert.equal((await check(u, CODE)).status, 'too_many_attempts', 'the right code is locked out too');
  assert.equal((await enroll(u, CODE)).status, 'too_many_attempts');
  await owner(`update research.redeem_attempts set at = now() - interval '2 hours' where user_id = $1`, [u]);
  assert.equal((await check(u, CODE)).status, 'ok', 'attempts expire after an hour');
});

await test('a listed student with the right code gets the study name and nothing about the group', async () => {
  const r = await check(await listed(study, { grp: 'L' }), CODE);
  assert.equal(r.status, 'ok');
  assert.equal(r.study_name, 'Study');
  assert.deepEqual(Object.keys(r).sort(), ['status', 'study_name']);
});

await test('checking a code records nothing about the student', async () => {
  const u = await listed(study);
  await check(u, CODE);
  assert.equal((await owner('select count(*)::int c from research.participants where user_id = $1', [u]))[0].c, 0);
  assert.equal((await owner(`select count(*)::int c from research.roster where claimed_by = $1`, [u]))[0].c, 0);
  assert.equal((await status(u)).enrolled, false);
});

await test('enrolling needs the acknowledgement, and a missing one is not a wrong code', async () => {
  const u = await listed(study);
  assert.equal((await enroll(u, CODE, false)).status, 'acknowledgement_required');
  assert.equal((await enroll(u, CODE, null)).status, 'acknowledgement_required');
  assert.equal((await status(u)).enrolled, false);
  assert.equal((await owner(`select count(*)::int c from research.redeem_attempts where user_id = $1`, [u]))[0].c, 0);
});

await test('enrolling assigns a group and starts the window, and the list names them once it is matched', async () => {
  const u = await listed(study, { grp: null, name: 'Maya Cohen' });
  const r = await enroll(u, CODE);
  assert.equal(r.status, 'ok');
  assert.match(r.participant_code, /^P-\d{3}$/);
  assert.deepEqual(Object.keys(r).sort(), ['participant_code', 'status', 'window_ends_at'], 'the group is never returned');
  const [p] = await owner('select * from research.participants where user_id = $1', [u]);
  assert.ok(['S', 'L'].includes(p.grp));
  assert.equal(p.full_name, null, 'no name is taken at enrolment');
  assert.equal((await owner('select full_name from research.grid_participants where email = $1', [p.email]))[0].full_name, 'Maya Cohen', 'the list gives the name when read');
  assert.equal(p.email, await emailOf(u));
  assert.equal(p.status, 'active');
  assert.equal(p.platform, 'ios');
  assert.ok(p.acknowledged_at);
  assert.equal((new Date(p.window_ends_at) - new Date(p.enrolled_at)) / 86400000, 21);
  assert.equal((await owner('select research_cohort from public.profiles where id = $1', [u]))[0].research_cohort, true);
  const s = await status(u);
  assert.deepEqual([s.enrolled, s.status, s.days_left], [true, 'active', 21]);
  assert.equal((await enroll(u, CODE)).status, 'already_enrolled');
  assert.equal((await check(u, CODE)).status, 'already_enrolled');
});

await test('a list with no name shows no name', async () => {
  const u = await listed(study);
  assert.equal((await enroll(u, CODE)).status, 'ok');
  assert.equal((await owner('select full_name from research.grid_participants where email = $1', [await emailOf(u)]))[0].full_name, null);
});

const split = async (code, k) => {
  const s = await newStudy({ code });
  const seq = [];
  for (let i = 0; i < k; i++) {
    const u = await listed(s, { grp: null });
    assert.equal((await rawEnroll(u, code)).status, 'ok');
    seq.push((await owner('select grp from research.participants where user_id = $1', [u]))[0].grp);
  }
  return seq;
};

await test('people who join are paired in order of arrival: each two get one of each', async () => {
  const seq = await split('PAIRS-00001', 30);
  for (let i = 0; i < 30; i += 2) assert.notEqual(seq[i], seq[i + 1], `people ${i + 1} and ${i + 2} are in different groups`);
  assert.equal(seq.filter((g) => g === 'S').length, 15);
});

await test('an odd person out is a coin flip against groups already even, and the next pair is one of each again', async () => {
  const firsts = new Set();
  for (let r = 0; r < 12; r++) {
    const seq = await split(`ODD-${String(r).padStart(6, '0')}`, 5);
    assert.equal(seq.slice(0, 4).filter((g) => g === 'S').length, 2, 'the first four are balanced');
    firsts.add(seq[4]);
  }
  assert.equal(firsts.size, 2, 'the odd person lands in both groups across runs');
});

await test('which group comes first in a pair is random, not always the same', async () => {
  const firsts = new Set();
  for (let r = 0; r < 14; r++) firsts.add((await split(`FIRST-${String(r).padStart(5, '0')}`, 1))[0]);
  assert.equal(firsts.size, 2);
});

await test('a pair is not stored anywhere and the group never reaches the student', async () => {
  const cols = (await owner(`select table_name, column_name from information_schema.columns where table_schema = 'research' and (column_name ilike '%pair%' or column_name ilike '%block%')`));
  assert.deepEqual(cols, []);
  const s = await newStudy({ code: 'HIDDEN-0001' });
  const u = await listed(s, { grp: null });
  const r = await rawEnroll(u, 'HIDDEN-0001');
  assert.deepEqual(Object.keys(r).sort(), ['participant_code', 'status', 'window_ends_at']);
  assert.ok(!JSON.stringify(await status(u)).match(/grp|group/i));
  assert.deepEqual(await call(u, 'select grp from research.participants'), [], 'a student cannot read participants, so not their own group');
});

await test('withdrawn people still count toward the balance', async () => {
  for (let r = 0; r < 10; r++) {
    const code = `COUNTS-${String(r).padStart(4, '0')}`;
    const s = await newStudy({ code });
    const a = await listed(s, { grp: null });
    await rawEnroll(a, code);
    const ga = (await owner('select grp from research.participants where user_id = $1', [a]))[0].grp;
    await owner(`update research.participants set status = 'withdrawn', withdrawn_at = now() where user_id = $1`, [a]);
    const b = await listed(s, { grp: null });
    await rawEnroll(b, code);
    assert.notEqual((await owner('select grp from research.participants where user_id = $1', [b]))[0].grp, ga);
  }
});

await test('a group named on the list is ignored', async () => {
  const s = await newStudy({ code: 'IGNORED-001' });
  const emails = [];
  for (let i = 0; i < 6; i++) { const u = await user(); emails.push({ u, email: await emailOf(u) }); }
  await owner('select research.add_roster($1,$2::jsonb)', [s, JSON.stringify(emails.map((e) => ({ email: e.email, group: 'S' })))]);
  assert.deepEqual((await owner('select distinct grp from research.roster where study_id = $1', [s])).map((r) => r.grp), [null]);
  for (const e of emails) assert.equal((await rawEnroll(e.u, 'IGNORED-001')).status, 'ok');
  assert.equal((await owner(`select count(*)::int c from research.participants where study_id = $1 and grp = 'S'`, [s]))[0].c, 3);
});

await test('the window length is per study and read at enrolment', async () => {
  const s = await newStudy({ code: 'SHORT-0001', window: 7 });
  const u = await listed(s);
  assert.equal((await enroll(u, 'SHORT-0001')).status, 'ok');
  assert.equal((await status(u)).days_left, 7);
});

await test('40 enrolments are numbered in order and the 41st listed student is refused', async () => {
  const s = await newStudy({ code: 'FORTY-4040', cap: 40 });
  const codes = [];
  for (let i = 0; i < 40; i++) {
    const r = await enroll(await listed(s, { grp: i % 2 ? 'L' : 'S' }), 'FORTY-4040');
    assert.equal(r.status, 'ok', `enrolment ${i + 1}`);
    codes.push(r.participant_code);
  }
  assert.deepEqual(codes, Array.from({ length: 40 }, (_, i) => `P-${String(i + 1).padStart(3, '0')}`));
  assert.equal((await enroll(await listed(s), 'FORTY-4040')).status, 'invalid_code');
});

await test('the list is compared by email afterwards, in either order, and follows the list as it grows', async () => {
  const st = await newStudy({ code: 'LATE-LIST-01' });
  const early = await user('early@example.edu');
  assert.equal((await enroll(early, 'LATE-LIST-01')).status, 'ok');
  const asked = async () => (await owner(`select email, on_list, full_name from research.grid_participants where email in ('early@example.edu', 'wave2@example.edu') order by email`));
  assert.deepEqual((await asked()).map((r) => [r.email, r.on_list]), [['early@example.edu', false]], 'before the list: not on it');
  await owner('select research.add_roster($1,$2::jsonb)', [st, JSON.stringify([{ email: 'Early@Example.edu ', name: 'Early Bird' }, { email: 'wave2@example.edu' }])]);
  const rows = await asked();
  assert.deepEqual(rows.map((r) => [r.email, r.on_list, r.full_name]), [['early@example.edu', true, 'Early Bird']], 'the list arrives later and matches, ignoring case and spaces');
  const wave2 = await user('wave2@example.edu');
  assert.equal((await enroll(wave2, 'LATE-LIST-01')).status, 'ok');
  const roster = await owner(`select email, enrolled, participant_code from research.roster_status where study_id = $1 order by email`, [st]);
  assert.deepEqual(roster.map((r) => [r.email, r.enrolled, !!r.participant_code]), [['early@example.edu', true, true], ['wave2@example.edu', true, true]]);
  await owner('select research.add_roster($1,$2::jsonb)', [st, JSON.stringify([{ email: 'later@example.edu' }])]);
  assert.equal((await owner(`select enrolled from research.roster_status where email = 'later@example.edu'`))[0].enrolled, false, 'on the list and not joined yet');
});

await test('who, group and acknowledgement are fixed after enrolment', async () => {
  const [p] = await owner(`select id from research.participants limit 1`);
  for (const col of ["grp = 'X'", "participant_code = 'P-999'", "user_id = gen_random_uuid()",
                     "roster_id = gen_random_uuid()", "acknowledged_at = now()", "enrolled_at = now()"]) {
    await assert.rejects(owner(`update research.participants set ${col} where id = $1`, [p.id]), /participant_fixed_at_enrolment|violates foreign key/);
  }
  await owner(`update research.participants set full_name = 'Corrected Name' where id = $1`, [p.id]);
});

await test('loading the list adds and updates, even for people already enrolled, and rolls back on a bad row', async () => {
  const s = await newStudy({ code: 'LOADED-0001' });
  const load = async (rows) => (await owner('select research.add_roster($1,$2::jsonb) r', [s, JSON.stringify(rows)]))[0].r;
  assert.deepEqual(await load([{ email: 'a@example.edu' }, { email: 'b@example.edu', name: 'B' }]),
    { added: 2, updated: 0, skipped_enrolled: 0 });
  const a = await user('a@example.edu');
  assert.equal((await enroll(a, 'LOADED-0001')).status, 'ok');
  assert.deepEqual(await load([{ email: 'a@example.edu' }, { email: 'b@example.edu', name: 'B2' },
                                { email: 'c@example.edu' }]),
    { added: 1, updated: 2, skipped_enrolled: 0 });
  assert.equal((await owner(`select full_name from research.roster where match_key = 'b@example.edu' and study_id = $1`, [s]))[0].full_name, 'B2', 'an unenrolled row can change name');
  await assert.rejects(load([{ email: 'd@example.edu' }, { email: 'not an email' }]), /bad_email/);
  await assert.rejects(owner(`select research.add_roster($1,'{"a":1}'::jsonb)`, [s]), /rows_must_be_an_array/);
  const rows = (await owner(`select match_key from research.roster where study_id = $1`, [s])).map((r) => r.match_key).sort();
  assert.deepEqual(rows, ['a@example.edu', 'b@example.edu', 'c@example.edu'], 'failed loads added nothing, not even their good rows');
});

await test('a student cannot read or write any research table, including their own rows', async () => {
  const u = await listed(study);
  assert.equal((await enroll(u, CODE)).status, 'ok');
  for (const t of ['participants', 'roster', 'researchers']) {
    assert.equal((await call(u, `select * from research.${t}`)).length, 0, t);
  }
  assert.equal((await call(u, 'select id, name from research.studies')).length, 0);
  await assert.rejects(call(u, 'select * from research.redeem_attempts'), /permission denied/);
  await assert.rejects(call(u, 'select code_hash from research.studies'), /permission denied/);
  await assert.rejects(call(u, `insert into research.roster (study_id, match_key, grp) values ($1, 'me@example.edu', 'S')`, [study]), /permission denied/);
  await assert.rejects(call(u, `update research.roster set grp = 'L'`), /permission denied/);
  await assert.rejects(call(u, `update research.participants set status = 'withdrawn'`), /permission denied/);
});

await test('a student cannot set or clear their own cohort flag', async () => {
  const u = await listed(study);
  await call(u, 'update public.profiles set research_cohort = true where id = $1', [u]);
  assert.equal((await owner('select research_cohort from public.profiles where id = $1', [u]))[0].research_cohort, false);
  assert.equal((await enroll(u, CODE)).status, 'ok');
  await call(u, 'update public.profiles set research_cohort = false where id = $1', [u]);
  assert.equal((await owner('select research_cohort from public.profiles where id = $1', [u]))[0].research_cohort, true);
  const { rows } = await db.query('insert into auth.users (email) values (null) returning id');
  await call(rows[0].id, 'insert into public.profiles (id, university, research_cohort) values ($1, $2, true)', [rows[0].id, 'tufts']);
  assert.equal((await owner('select research_cohort from public.profiles where id = $1', [rows[0].id]))[0].research_cohort, false);
});

const researcher = await user();
const outsider = await user();
const owner1 = await user();
await owner(`insert into research.researchers (user_id, email, role) values ($1,'r@example.edu','researcher'), ($2,'o@example.edu','owner')`, [researcher, owner1]);

await test('a researcher needs a multi-factor session to see anything', async () => {
  for (const t of ['participants', 'roster']) {
    assert.equal((await call(researcher, `select * from research.${t}`)).length, 0, `${t}: no aal at all`);
    assert.equal((await call(researcher, `select * from research.${t}`, [], { aal: 'aal1' })).length, 0, `${t}: aal1`);
    assert.ok((await call(researcher, `select * from research.${t}`, [], { aal: 'aal2' })).length > 0, `${t}: aal2`);
  }
  const rows = await call(researcher, 'select * from research.participants where email is not null', [], { aal: 'aal2' });
  assert.ok(rows[0].email, 'identity is visible');
});

await test('a signed-in user who is not a researcher sees nothing, even with aal2', async () => {
  for (const t of ['participants', 'roster']) {
    assert.equal((await call(outsider, `select * from research.${t}`, [], { aal: 'aal2' })).length, 0);
  }
});

await test('a deactivated researcher sees nothing', async () => {
  const gone = await user();
  await owner(`insert into research.researchers (user_id, email, is_active) values ($1,'x@example.edu', false)`, [gone]);
  assert.equal((await call(gone, 'select * from research.participants', [], { aal: 'aal2' })).length, 0);
});

await test('researchers cannot read the code hash or the attempt log, and cannot write', async () => {
  const opt = { aal: 'aal2' };
  assert.ok((await call(researcher, 'select id, name, cap, window_days from research.studies', [], opt)).length > 0);
  await assert.rejects(call(researcher, 'select code_hash from research.studies', [], opt), /permission denied/);
  await assert.rejects(call(researcher, 'select * from research.redeem_attempts', [], opt), /permission denied/);
  await assert.rejects(call(researcher, `update research.studies set cap = 999`, [], opt), /permission denied/);
  await assert.rejects(call(researcher, `update research.roster set grp = 'L'`, [], opt), /permission denied/);
  await assert.rejects(call(researcher, `insert into research.roster (study_id, match_key, grp) values ($1, 'z@example.edu', 'S')`, [study], opt), /permission denied/);
  await assert.rejects(call(researcher, `update research.participants set full_name = 'x'`, [], opt), /permission denied/);
  await assert.rejects(call(researcher, `delete from research.participants`, [], opt), /permission denied/);
});

await test('only an owner sees the whole researcher list', async () => {
  assert.equal((await call(researcher, 'select * from research.researchers', [], { aal: 'aal2' })).length, 1, 'just their own row');
  const all = (await owner('select count(*)::int c from research.researchers'))[0].c;
  assert.ok(all > 1);
  assert.equal((await call(owner1, 'select * from research.researchers', [], { aal: 'aal2' })).length, all);
});

await test('test-study participants and list rows never appear in researcher views', async () => {
  const t = await newStudy({ code: 'REVIEW-0001', test: true });
  const rev = await listed(t, { name: 'App Reviewer' });
  const revEmail = await emailOf(rev);
  assert.equal((await enroll(rev, 'REVIEW-0001')).status, 'ok');
  const opt = { aal: 'aal2' };
  assert.equal((await call(researcher, `select * from research.participants where email = $1`, [revEmail], opt)).length, 0);
  assert.equal((await call(researcher, `select * from research.grid_participants where email = $1`, [revEmail], opt)).length, 0);
  assert.equal((await call(researcher, `select * from research.roster where study_id = $1`, [t], opt)).length, 0);
  assert.equal((await call(researcher, `select id from research.studies where id = $1`, [t], opt)).length, 0);
  assert.equal((await owner(`select count(*)::int c from research.participants where email = $1`, [revEmail]))[0].c, 1, 'the row exists');
});

await test('deleting an account leaves every research row in place', async () => {
  const u = await listed(study, { name: 'Leaving Student' });
  assert.equal((await enroll(u, CODE)).status, 'ok');
  const before = (await owner('select count(*)::int c from research.participants'))[0].c;
  const email = await emailOf(u);
  await owner('delete from auth.users where id = $1', [u]);
  assert.equal((await owner('select count(*)::int c from public.profiles where id = $1', [u]))[0].c, 0, 'profile gone');
  assert.equal((await owner('select count(*)::int c from research.participants'))[0].c, before);
  const [p] = await owner(`select email from research.participants where user_id = $1`, [u]);
  assert.equal(p.email, email);
  assert.equal((await owner(`select full_name from research.grid_participants where email = $1`, [email]))[0].full_name, 'Leaving Student', 'the list still names them');
});

await test('leaving keeps every row, ends the window and cannot be undone', async () => {
  const u = await listed(study);
  assert.equal((await enroll(u, CODE)).status, 'ok');
  assert.equal((await call(u, 'select * from public.research_leave()'))[0].status, 'withdrawn');
  const [p] = await owner('select * from research.participants where user_id = $1', [u]);
  assert.equal(p.status, 'withdrawn');
  assert.ok(p.withdrawn_at);
  assert.equal((await status(u)).days_left, 0);
  await assert.rejects(owner(`update research.participants set status = 'active', withdrawn_at = null where user_id = $1`, [u]), /status_final/);
  assert.equal((await call(u, 'select * from public.research_leave()'))[0].status, 'withdrawn', 'leaving twice is harmless');
  assert.equal((await call(await user(), 'select * from public.research_leave()'))[0].status, null, 'not enrolled');
});

await test('an expired window reads as completed, then the job closes it and keeps the row', async () => {
  const u = await listed(study);
  assert.equal((await enroll(u, CODE)).status, 'ok');
  await owner(`update research.participants set window_ends_at = now() - interval '1 minute' where user_id = $1`, [u]);
  assert.equal((await status(u)).status, 'completed');
  assert.equal((await owner('select status from research.participants where user_id = $1', [u]))[0].status, 'active', 'not yet closed');
  assert.equal((await call(u, 'select * from public.research_leave()'))[0].status, 'completed', 'too late to withdraw');
  await assert.rejects(call(u, 'select research.close_expired_windows()'), /permission denied/);
  const [{ close_expired_windows: closed }] = await owner('select research.close_expired_windows()');
  assert.ok(closed >= 1);
  assert.equal((await owner('select status from research.participants where user_id = $1', [u]))[0].status, 'completed');
  assert.equal((await owner('select research.close_expired_windows()'))[0].close_expired_windows, 0, 'idempotent');
});

await test('researchers may extend a window and existing participants keep their own end date', async () => {
  const s = await newStudy({ code: 'EXTEND-3333', window: 21 });
  const u = await listed(s);
  await enroll(u, 'EXTEND-3333');
  await owner('update research.studies set window_days = 28 where id = $1', [s]);
  assert.equal((await status(u)).days_left, 21, 'unchanged by a study setting');
  const v = await listed(s);
  await enroll(v, 'EXTEND-3333');
  assert.equal((await status(v)).days_left, 28, 'new enrolments get the new length');
  await owner(`update research.participants set window_ends_at = window_ends_at + interval '7 days' where user_id = $1`, [u]);
  assert.equal((await status(u)).days_left, 28, 'a direct extension works');
});


// ── Phase 3: collecting what a participant does ──────────────────────────────

const live = await newStudy({ code: 'LIVE-2026', cap: 300 });
const joiner = async (grp = 'S', opts = {}) => {
  const u = await listed(live, { grp, ...opts });
  assert.equal((await enroll(u, 'LIVE-2026')).status, 'ok');
  return u;
};
const TODAY = `(now() at time zone 'America/New_York')::date`;
const RICE = { id: 'rice', name: 'Rice', servings: 1, nutrition: { calories: 200, protein: 4, carbs: 40, fat: 1 } };
const meal = async (u, { type = 'lunch', dateSql = TODAY, items = [RICE] } = {}) =>
  (await owner(`insert into public.meal_history (user_id, confirmed_at, meal_type, meal_date, dining_hall, items)
                values ($1, now(), $2, ${dateSql}, 'Sherman', $3::jsonb) returning id`, [u, type, JSON.stringify(items)]))[0].id;
const copies = (u) => owner(`select m.* from research.meals m join research.participants p on p.id = m.participant_id
                              where p.user_id = $1 order by m.copied_at, m.source_id`, [u]);
const snaps = (u) => owner(`select s.* from research.profile_snapshots s join research.participants p on p.id = s.participant_id
                             where p.user_id = $1 order by s.id`, [u]);
const events = (u, kind) => owner(`select e.* from research.events e join research.participants p on p.id = e.participant_id
                                    where p.user_id = $1 and ($2::text is null or e.kind = $2) order by e.id`, [u, kind ?? null]);

await test('a confirmed meal is copied for a participant and only a participant', async () => {
  const u = await joiner();
  const other = await user();
  const id = await meal(u);
  await meal(other);
  const rows = await copies(u);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_id, id);
  assert.deepEqual([rows[0].meal_type, rows[0].dining_hall], ['lunch', 'Sherman']);
  assert.deepEqual(rows[0].items, [RICE]);
  assert.equal(rows[0].consumption_reported_at, null);
  assert.equal((await owner('select count(*)::int c from research.meals'))[0].c >= 1, true);
  assert.equal((await owner(`select count(*)::int c from research.meals m join research.participants p on p.id = m.participant_id where p.user_id = $1`, [other]))[0].c, 0);
});

await test('reporting consumption updates the copy and stamps the first report once', async () => {
  const u = await joiner();
  const id = await meal(u);
  await owner(`update public.meal_history set items = $2::jsonb where id = $1`, [id, JSON.stringify([{ ...RICE, consumed: 0.5 }])]);
  const first = (await copies(u))[0];
  assert.equal(first.items[0].consumed, 0.5);
  assert.ok(first.consumption_reported_at);
  await owner(`update public.meal_history set items = $2::jsonb where id = $1`, [id, JSON.stringify([{ ...RICE, consumed: 1 }])]);
  const second = (await copies(u))[0];
  assert.equal(second.items[0].consumed, 1);
  assert.equal(new Date(second.consumption_reported_at).getTime(), new Date(first.consumption_reported_at).getTime());
  assert.equal((await copies(u)).length, 1, 'an update is not a second row');
});

await test('undoing a confirmation marks the copy and keeps it, and a new confirmation is a new row', async () => {
  const u = await joiner();
  const id = await meal(u);
  await owner('delete from public.meal_history where id = $1', [id]);
  let rows = await copies(u);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].deleted_at);
  assert.deepEqual(rows[0].items, [RICE], 'the plate is still there');
  const again = await meal(u);
  rows = await copies(u);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.source_id === again).deleted_at, null);
});

await test('nothing from before enrolment is copied, even if edited afterwards', async () => {
  const u = await joiner();
  const old = await meal(u, { type: 'dinner', dateSql: `${TODAY} - 3` });
  assert.equal((await copies(u)).length, 0);
  await owner(`update public.meal_history set items = '[]'::jsonb where id = $1`, [old]);
  assert.equal((await copies(u)).length, 0);
});

await test('collection stops at withdrawal and at the end of the window, and keeps what it had', async () => {
  const a = await joiner();
  await meal(a, { type: 'breakfast' });
  assert.equal((await call(a, 'select * from public.research_leave()'))[0].status, 'withdrawn');
  await meal(a, { type: 'lunch' });
  await meal(a, { type: 'dinner' });
  assert.equal((await copies(a)).length, 1, 'only the meal from before leaving');

  const b = await joiner();
  await meal(b, { type: 'breakfast' });
  await owner(`update research.participants set window_ends_at = now() - interval '1 minute' where user_id = $1`, [b]);
  await meal(b, { type: 'lunch' });
  assert.equal((await copies(b)).length, 1);
});

await test('a broken research table never stops a student saving a meal', async () => {
  const u = await joiner();
  await owner('alter table research.meals rename to meals_broken');
  try {
    const id = await meal(u);
    assert.ok(id, 'the meal saved');
    assert.equal((await owner('select count(*)::int c from public.meal_history where id = $1', [id]))[0].c, 1);
  } finally {
    await owner('alter table research.meals_broken rename to meals');
  }
  assert.equal((await copies(u)).length, 0, 'and the research copy is simply missing');
});

await test('deleting an account is not an undo, so the copies are left exactly as they were', async () => {
  const u = await joiner();
  await meal(u);
  await meal(u, { type: 'dinner' });
  await owner('delete from auth.users where id = $1', [u]);
  const rows = await copies(u);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.deleted_at === null));
});

await test('a snapshot is taken at enrolment with the profile, targets and every restriction', async () => {
  const u = await listed(live);
  await owner(`update public.profiles set weight = 150, weight_unit = 'lbs', height_feet = 5, height_inches = 6, age = 21,
                 sex = 'female', activity_level = 'moderate', goal = 'maintain', university = 'brandeis' where id = $1`, [u]);
  await owner(`insert into public.nutrition_targets (user_id, calories, protein, carbs, fat) values ($1, 2100, 110, 260, 70)`, [u]);
  await owner(`insert into public.dietary_restrictions (user_id, vegetarian, halal) values ($1, true, true)`, [u]);
  assert.equal((await enroll(u, 'LIVE-2026')).status, 'ok');
  const [s1, ...rest] = await snaps(u);
  assert.equal(rest.length, 0);
  assert.equal(s1.reason, 'enrolment');
  assert.deepEqual([s1.weight, s1.age, s1.sex, s1.goal, s1.calories, s1.protein], ['150', 21, 'female', 'maintain', '2100', '110']);
  assert.equal(s1.restrictions.vegetarian, true);
  assert.equal(s1.restrictions.halal, true, 'religious data is captured, so the consent must name it');
  assert.equal(s1.restrictions.id, undefined);
  assert.equal(s1.restrictions.user_id, undefined);
});

await test('changes add snapshots and keep the old ones, and nothing else does', async () => {
  const u = await listed(live);
  await owner(`update public.profiles set weight = 150, age = 21 where id = $1`, [u]);
  await owner(`insert into public.nutrition_targets (user_id, calories) values ($1, 2000)`, [u]);
  await owner(`insert into public.dietary_restrictions (user_id) values ($1)`, [u]);
  await enroll(u, 'LIVE-2026');
  assert.equal((await snaps(u)).length, 1);

  await owner(`update public.profiles set push_enabled = true, mascot_color = 'blue' where id = $1`, [u]);
  assert.equal((await snaps(u)).length, 1, 'an unrelated profile column is not a change');
  await owner(`update public.profiles set weight = 150 where id = $1`, [u]);
  assert.equal((await snaps(u)).length, 1, 'saving the same value again is not a change');

  await owner(`update public.profiles set weight = 148 where id = $1`, [u]);
  await owner(`update public.nutrition_targets set calories = 1900 where user_id = $1`, [u]);
  await owner(`update public.dietary_restrictions set kosher = true where user_id = $1`, [u]);
  const all = await snaps(u);
  assert.deepEqual(all.map((x) => x.reason), ['enrolment', 'profile', 'targets', 'restrictions']);
  assert.deepEqual(all.map((x) => x.weight), ['150', '148', '148', '148'], 'history keeps both weights');
  assert.deepEqual(all.map((x) => x.calories), ['2000', '2000', '1900', '1900']);
  assert.deepEqual(all.map((x) => x.restrictions.kosher), [false, false, false, true]);
});

await test('no snapshots for non-participants, and none after leaving', async () => {
  const outsider2 = await user();
  await owner(`update public.profiles set weight = 200 where id = $1`, [outsider2]);
  assert.equal((await owner(`select count(*)::int c from research.profile_snapshots s join research.participants p on p.id = s.participant_id where p.user_id = $1`, [outsider2]))[0].c, 0);
  const u = await joiner();
  await call(u, 'select * from public.research_leave()');
  await owner(`update public.profiles set weight = 111 where id = $1`, [u]);
  assert.equal((await snaps(u)).length, 1, 'just the enrolment one');
});

await test('favorites, streaks and push registrations become events with nothing identifying', async () => {
  const u = await joiner();
  await owner(`insert into public.favorites (user_id, item_id, name) values ($1, 'bh_9', 'Pasta')`, [u]);
  await owner(`delete from public.favorites where user_id = $1`, [u]);
  await owner(`insert into public.streaks (user_id, current_streak, longest_streak) values ($1, 1, 1)`, [u]);
  await owner(`update public.streaks set current_streak = 2, longest_streak = 2 where user_id = $1`, [u]);
  await owner(`update public.streaks set last_confirmed_date = current_date where user_id = $1`, [u]);
  await owner(`insert into public.push_subscriptions (user_id, endpoint, apns_token) values ($1, 'apns:SECRETTOKEN123', 'SECRETTOKEN123')`, [u]);
  await owner(`insert into public.push_subscriptions (user_id, endpoint) values ($1, 'https://web.example/endpoint-xyz')`, [u]);
  await owner(`delete from public.push_subscriptions where user_id = $1`, [u]);
  const kinds = (await events(u)).map((e) => e.kind);
  assert.deepEqual(kinds, ['favorite_added', 'favorite_removed', 'streak_updated', 'streak_updated',
    'push_added', 'push_added', 'push_removed', 'push_removed']);
  const all = JSON.stringify((await events(u)).map((e) => e.data));
  assert.ok(!all.includes('SECRETTOKEN123') && !all.includes('endpoint-xyz'), 'no token or endpoint in research data');
  assert.deepEqual((await events(u, 'push_added')).map((e) => e.data.platform), ['ios', 'web']);
  assert.equal((await events(u, 'favorite_added'))[0].data.item_id, 'bh_9');
  assert.equal((await events(u, 'streak_updated')).length, 2, 'a change that left the streak alone is not an event');
});

await test('the app open event is iOS only, throttled, and only for active participants', async () => {
  const u = await joiner();
  const outsider3 = await user();
  assert.equal((await call(u, `select public.research_log_event('app_open','ios') r`))[0].r, true);
  assert.equal((await call(u, `select public.research_log_event('app_open','ios') r`))[0].r, false, 'twice in 20 minutes is one open');
  assert.equal((await call(u, `select public.research_log_event('app_open','web') r`))[0].r, false);
  assert.equal((await call(u, `select public.research_log_event('app_open') r`))[0].r, false);
  assert.equal((await call(u, `select public.research_log_event('favorite_added','ios') r`))[0].r, false, 'a client cannot write other kinds');
  assert.equal((await call(outsider3, `select public.research_log_event('app_open','ios') r`))[0].r, false);
  assert.equal((await events(u, 'app_open')).length, 1);
  await owner(`update research.events set at = now() - interval '25 minutes' where participant_id = (select id from research.participants where user_id = $1)`, [u]);
  assert.equal((await call(u, `select public.research_log_event('app_open','ios') r`))[0].r, true, 'a later open counts');
  await assert.rejects(call(null, `select public.research_log_event('app_open','ios')`), /not_signed_in/);
  await assert.rejects(call(null, `select public.research_log_event('app_open','ios')`, [], { role: 'anon' }), /permission denied/);
  await call(u, 'select * from public.research_leave()');
  assert.equal((await call(u, `select public.research_log_event('app_open','ios') r`))[0].r, false, 'not after leaving');
});

await test('researchers read the copies with a multi-factor session, students and others read nothing', async () => {
  const u = await joiner();
  await meal(u, { items: [{ id: 'a', name: 'Pasta', servings: 2, consumed: 0.25, nutrition: { calories: 300, protein: 10, carbs: 50, fat: 5 } },
                          { id: 'b', name: 'Odd', servings: 'lots', consumed: 'most', nutrition: { calories: 'x' } }] });
  await owner(`update public.profiles set weight = 130 where id = $1`, [u]);
  const aal2 = { aal: 'aal2' };
  for (const t of ['meals', 'profile_snapshots', 'events']) {
    assert.ok((await call(researcher, `select * from research.${t}`, [], aal2)).length > 0, `${t} visible to a researcher`);
    assert.equal((await call(researcher, `select * from research.${t}`, [], { aal: 'aal1' })).length, 0, `${t} aal1`);
    assert.equal((await call(researcher, `select * from research.${t}`)).length, 0, `${t} no aal`);
    assert.equal((await call(outsider, `select * from research.${t}`, [], aal2)).length, 0, `${t} not a researcher`);
    assert.equal((await call(u, `select * from research.${t}`, [], aal2)).length, 0, `${t} the participant`);
  }
  const items = await call(researcher, `select * from research.plate_items where item_name in ('Pasta','Odd') order by item_position`, [], aal2);
  assert.equal(items.length, 2);
  assert.deepEqual([items[0].item_name, items[0].servings, items[0].consumed, items[0].calories, items[0].protein], ['Pasta', '2', '0.25', '300', '10']);
  assert.deepEqual([items[1].servings, items[1].consumed, items[1].calories], ['1', null, null], 'odd values become empty cells, not errors');
  assert.equal((await call(u, `select * from research.plate_items`, [], aal2)).length, 0);
  await assert.rejects(call(researcher, `insert into research.events (participant_id, kind) values (gen_random_uuid(), 'app_open')`, [], aal2), /permission denied/);
  await assert.rejects(call(researcher, `update research.meals set items = '[]'`, [], aal2), /permission denied/);
});

await test('test-study copies never reach researchers', async () => {
  const t = await newStudy({ code: 'REVIEW-0002', test: true });
  const rev = await listed(t);
  assert.equal((await enroll(rev, 'REVIEW-0002')).status, 'ok');
  await meal(rev);
  assert.equal((await copies(rev)).length, 1, 'collected like any other');
  const aal2 = { aal: 'aal2' };
  for (const t2 of ['meals', 'profile_snapshots', 'events']) {
    const rows = await call(researcher, `select participant_id from research.${t2}`, [], aal2);
    const mine = await owner(`select id from research.participants where user_id = $1`, [rev]);
    assert.ok(!rows.some((r) => r.participant_id === mine[0].id), t2);
  }
});

await test('a participant is left out of the dining ratings', async () => {
  const regular = await user();
  const part = await joiner();
  for (const [u, rating] of [[regular, 5], [part, 1]]) {
    await owner(`insert into public.item_ratings (user_id, item_id, item_name, rating, university, dining_hall)
                 values ($1, 'bh_1', 'Soup', $2, 'brandeis', 'Sherman')`, [u, rating]);
  }
  const [row] = await owner(`select * from public.item_rating_aggregates where item_id = 'bh_1'`);
  assert.equal(row.rating_count, 1);
  assert.equal(row.avg_rating, '5.0');
  assert.equal(row.dining_hall, 'Sherman');
  assert.deepEqual(Object.keys(row), ['item_id', 'item_name', 'university', 'avg_rating', 'rating_count', 'dining_hall']);
});

await test('a participant is left out of dining survey results', async () => {
  const admin = await user();
  await owner(`insert into public.admin_users (user_id, university) values ($1, 'brandeis')`, [admin]);
  const regular = await user();
  const part = await joiner();
  const [{ id: sid }] = await owner(`insert into public.surveys (university, question, format) values ('brandeis', 'Good?', 'multiple_choice') returning id`);
  await owner(`insert into public.survey_responses (survey_id, user_id, status, choice, text_answer) values
    ($1, $2, 'answered', 'Yes', 'regular says hi'), ($1, $3, 'answered', 'No', 'participant says hi'), ($1, $3, 'dismissed', null, null)`, [sid, regular, part]);
  const [r] = await call(admin, `select * from public.get_survey_results('brandeis') where id = $1`, [sid]);
  assert.equal(String(r.answered), '1');
  assert.equal(String(r.dismissed), '0');
  assert.deepEqual(r.tally, [{ choice: 'Yes', count: 1 }]);
  assert.deepEqual(r.text_answers, ['regular says hi']);
  assert.equal((await owner('select count(*)::int c from public.survey_responses where survey_id = $1', [sid]))[0].c, 3, 'the answers are kept');
});


// ── Phase 4: study reminders and the end-of-day survey ───────────────────────
// Times are fixed so the rules can be checked exactly. October 2026 is on EDT
// (UTC minus 4) until 1 November. Monday 12 Oct is the first day.

const ENROLLED = '2026-10-12T13:00:00Z';   // Mon 09:00 ET
const WINDOW_END = '2026-11-02T14:00:00Z';
const place = async (u, enrolled = ENROLLED, windowEnd = WINDOW_END) => {
  await owner('alter table research.participants disable trigger participants_guard');
  await owner('update research.participants set enrolled_at = $2, window_ends_at = $3 where user_id = $1', [u, enrolled, windowEnd]);
  await owner('alter table research.participants enable trigger participants_guard');
};
const sched = async (study_, grp, kind, time, title, { days, late, body = '' } = {}) =>
  (await owner('select research.add_schedule($1,$2,$3,$4::time,$5,$6,$7::int[],$8) id',
    [study_, grp, kind, time, title, body, days ?? [1, 2, 3, 4, 5, 6, 7], late ?? null]))[0].id;
const claim = (iso, limit = 1000) => owner('select * from research.claim_due_prompts($1::timestamptz, $2)', [iso, limit]);
const pending = async (u, iso) => (await owner('select * from research.pending_survey($1,$2::timestamptz)', [u, iso]))[0];
const submit = async (u, date, answers, iso) =>
  (await owner('select research.submit_survey($1,$2::date,$3::jsonb,$4::timestamptz) r', [u, date, JSON.stringify(answers), iso]))[0].r;
const question = async (study_, text, format, { options = [], grps = [], position = 0, replaces = null } = {}) =>
  (await owner('select research.add_question($1,$2,$3,$4::jsonb,$5::text[],$6,$7) id', [study_, text, format, JSON.stringify(options), grps, position, replaces]))[0].id;
// A fresh study with a snack reminder, a loop reminder and an evening survey,
// plus one student in each group, all enrolled on Monday morning.
let sc = 0;
const fresh = async () => {
  sc++;
  const code = `SCHED-${String(sc).padStart(4, '0')}`;
  const st = await newStudy({ code, cap: 100 });
  // The claim is system-wide on purpose, so earlier tests' schedules would also be
  // due. Each test study starts with everyone else's switched off.
  await owner('update research.reminder_schedules set is_active = false');
  const mk = async (grp) => { const u = await listed(st, { grp }); assert.equal((await enroll(u, code)).status, 'ok'); await place(u); return u; };
  return { st, code, s1: await mk('S'), s2: await mk('S'), l1: await mk('L'),
    snack: await sched(st, 'S', 'reminder', '10:30', 'Snack'), loop: await sched(st, 'L', 'reminder', '10:30', 'Loop'),
    survey: await sched(st, null, 'survey', '20:00', 'Questions') };
};
const T = {
  tue1029: '2026-10-13T14:29:00Z', tue1030: '2026-10-13T14:30:00Z', tue1050: '2026-10-13T14:50:00Z',
  tue1059: '2026-10-13T14:59:59Z', tue1100: '2026-10-13T15:00:00Z', tue2000: '2026-10-14T00:00:00Z',
  tue2130: '2026-10-14T01:30:00Z', wed1000: '2026-10-14T14:00:00Z', wed2100: '2026-10-15T01:00:00Z',
  sat1030: '2026-10-17T14:30:00Z', mon1500: '2026-10-12T19:00:00Z',
};

await test('each group gets its own reminder at the send time and not a minute before', async () => {
  const f = await fresh();
  assert.equal((await claim(T.tue1029)).filter((r) => r.kind === 'reminder').length, 0, '10:29 is early');
  const rows = await claim(T.tue1030);
  const byTitle = Object.fromEntries(rows.map((r) => [r.user_id, r.title]));
  assert.deepEqual([byTitle[f.s1], byTitle[f.s2], byTitle[f.l1]], ['Snack', 'Snack', 'Loop']);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.grp).sort(), ['L', 'S', 'S']);
});

await test('a prompt is claimed once, however many times the sender runs', async () => {
  const f = await fresh();
  assert.equal((await claim(T.tue1030)).length, 3);
  assert.equal((await claim(T.tue1030)).length, 0, 'same minute again');
  assert.equal((await claim(T.tue1050)).length, 0, 'twenty minutes later');
  assert.equal((await owner('select count(*)::int c from research.prompts p join research.reminder_schedules s on s.id = p.schedule_id where s.study_id = $1', [f.st]))[0].c, 3);
  assert.equal((await claim('2026-10-14T14:30:00Z')).length, 3, 'the next day is a new prompt');
});

await test('a reminder that arrives after its window is dropped, not sent late', async () => {
  await fresh();
  assert.equal((await claim(T.tue1059)).length, 3, 'the last second of the window still sends');
  const g = await fresh();
  assert.equal((await claim(T.tue1100)).filter((r) => [g.s1, g.s2, g.l1].includes(r.user_id)).length, 0, '11:00 is past it');
  const h = await fresh();
  await owner('update research.reminder_schedules set late_minutes = 90 where study_id = $1', [h.st]);
  assert.equal((await claim(T.tue1100)).filter((r) => [h.s1, h.l1].includes(r.user_id)).length, 2, 'the window is per schedule');
});

await test('the days of the week are respected', async () => {
  const f = await fresh();
  await owner('update research.reminder_schedules set days = $2 where id = $1', [f.snack, [1, 2, 3, 4, 5]]);
  const sat = await claim(T.sat1030);
  assert.deepEqual(sat.map((r) => r.title).sort(), ['Loop'], 'weekdays only for S, every day for L');
});

await test('nothing is sent for a time that had passed before the student enrolled', async () => {
  const f = await fresh();
  await place(f.s1, '2026-10-13T14:45:00Z');   // enrolled 10:45 ET, after the 10:30 send
  await place(f.s2, '2026-10-13T14:00:00Z');   // enrolled 10:00 ET, before it
  const users = (await claim(T.tue1050)).map((r) => r.user_id);
  assert.ok(!users.includes(f.s1));
  assert.ok(users.includes(f.s2));
});

await test('withdrawn, completed, expired and inactive-schedule students are not prompted', async () => {
  const f = await fresh();
  await owner(`update research.participants set status = 'withdrawn', withdrawn_at = now() where user_id = $1`, [f.s1]);
  await owner(`update research.participants set status = 'completed' where user_id = $1`, [f.s2]);
  await owner('update research.reminder_schedules set is_active = false where id = $1', [f.survey]);
  assert.deepEqual((await claim(T.tue1030)).map((r) => r.user_id), [f.l1]);
  const g = await fresh();
  await place(g.l1, ENROLLED, '2026-10-13T14:00:00Z');   // window ended before the send
  assert.equal((await claim(T.tue1030)).filter((r) => r.user_id === g.l1).length, 0);
});

await test('the limit holds and what it left behind is claimed on the next run', async () => {
  const f = await fresh();
  const first = await claim(T.tue1030, 2);
  assert.equal(first.length, 2);
  const rest = await claim(T.tue1030, 2);
  assert.equal(rest.length, 1);
  assert.equal(new Set([...first, ...rest].map((r) => r.prompt_id)).size, 3);
  void f;
});

await test('the survey prompt reaches every group and the reminders reach only theirs', async () => {
  const f = await fresh();
  const rows = await claim(T.tue2000);
  assert.deepEqual(rows.map((r) => r.kind), ['survey', 'survey', 'survey']);
  assert.equal(new Set(rows.map((r) => r.user_id)).size, 3);
  void f;
});

await test('the sender reports back, and only the three real outcomes are accepted', async () => {
  const f = await fresh();
  const rows = await claim(T.tue1030);
  const [a, b, c] = rows;
  const marked = (await owner(`select research.mark_prompts($1::jsonb) n`, [JSON.stringify([
    { id: a.prompt_id, status: 'sent' }, { id: b.prompt_id, status: 'failed', error: 'x'.repeat(500) },
    { id: c.prompt_id, status: 'no_device' }, { id: a.prompt_id, status: 'claimed' }, { id: a.prompt_id, status: 'banana' }])]))[0].n;
  assert.equal(marked, 3);
  const all = await owner('select id, status, sent_at, error from research.prompts where id = any($1::uuid[]) order by status', [rows.map((r) => r.prompt_id)]);
  assert.deepEqual(all.map((r) => r.status).sort(), ['failed', 'no_device', 'sent']);
  assert.ok(all.find((r) => r.status === 'sent').sent_at);
  assert.equal(all.find((r) => r.status === 'failed').error.length, 200);
  void f;
});

await test('the sender functions are for the service role only', async () => {
  const u = await user();
  for (const sql of ['select * from public.research_claim_due_prompts()', `select public.research_mark_prompts('[]')`,
                     'select public.research_housekeeping()', 'select * from public.research_active_user_ids(array[gen_random_uuid()])']) {
    await assert.rejects(call(u, sql), /permission denied/, sql);
    await assert.rejects(call(null, sql, [], { role: 'anon' }), /permission denied/, sql);
    await db.exec('reset role'); await db.exec('set role service_role');
    try { await db.query(sql); } finally { await db.exec('reset role'); }
  }
  await assert.rejects(call(u, 'select research.claim_due_prompts()'), /permission denied/);
});

await test('questions are never edited, and replacing one keeps the old one and its answers', async () => {
  const f = await fresh();
  const q1 = await question(f.st, 'How was lunch?', 'rating');
  await assert.rejects(owner(`update research.questions set text = 'changed' where id = $1`, [q1]), /questions_are_never_edited/);
  await assert.rejects(owner(`update research.questions set options = '["a","b"]' where id = $1`, [q1]), /questions_are_never_edited/);
  await assert.rejects(owner(`update research.questions set grps = '{S}' where id = $1`, [q1]), /questions_are_never_edited/);
  assert.equal(await submit(f.s1, '2026-10-13', { [q1]: 4 }, T.tue2130), 'ok');
  const q2 = await question(f.st, 'How was lunch today?', 'rating', { replaces: q1 });
  const rows = await owner('select id, is_active, replaces from research.questions where study_id = $1 order by created_at', [f.st]);
  assert.deepEqual(rows.map((r) => r.is_active), [false, true]);
  assert.equal(rows[1].replaces, q1);
  assert.equal((await pending(f.s2, T.wed2100)).questions[0].id, q2, 'new days use the new question');
  const old = (await owner('select r.question_id, r.answer from research.responses r join research.participants p on p.id = r.participant_id where p.user_id = $1', [f.s1]))[0];
  assert.equal(old.question_id, q1, 'the earlier answer still points at the question it answered');
  assert.equal(old.answer, 4);
  await assert.rejects(question(f.st, 'x', 'rating', { replaces: '00000000-0000-0000-0000-000000000000' }), /unknown_question/);
  await assert.rejects(question(f.st, 'x', 'rating', { grps: ['Z'] }), /unknown_group/);
  await assert.rejects(question(f.st, 'x', 'multiple_choice', { options: ['only one'] }));
});

await test('a question can be for one group, and everyone else never sees it', async () => {
  const f = await fresh();
  const all = await question(f.st, 'For all', 'yes_no', { position: 1 });
  const onlyS = await question(f.st, 'For S', 'yes_no', { grps: ['S'], position: 2 });
  const onlyL = await question(f.st, 'For L', 'short_answer', { grps: ['L'], position: 3 });
  const ids = async (u) => (await pending(u, T.tue2130)).questions.map((q) => q.id);
  assert.deepEqual(await ids(f.s1), [all, onlyS]);
  assert.deepEqual(await ids(f.l1), [all, onlyL]);
  assert.equal(await submit(f.l1, '2026-10-13', { [all]: true, [onlyS]: true, [onlyL]: 'hi' }, T.tue2130), 'invalid_answers', 'another group\'s question is not accepted');
  assert.equal(await submit(f.l1, '2026-10-13', { [all]: true, [onlyL]: 'hi' }, T.tue2130), 'ok');
});

await test('no questions means no survey, and a survey is not waiting before its time', async () => {
  const f = await fresh();
  assert.equal(await pending(f.s1, T.tue2130), undefined, 'no questions');
  await question(f.st, 'Q', 'yes_no');
  const early = await pending(f.s1, T.mon1500);   // enrolled this morning, 20:00 has not come
  assert.equal(early.for_date, null);
  assert.equal(early.questions, null);
  assert.equal(new Date(early.next_due_at).toISOString(), '2026-10-13T00:00:00.000Z', 'tells the app when it becomes due');
  const due = await pending(f.s1, T.tue2000);
  assert.equal(String(due.for_date.toISOString?.().slice(0, 10) ?? due.for_date).slice(0, 10), '2026-10-13');
  assert.equal(due.late, false);
  assert.equal(due.questions.length, 1);
  assert.equal(await pending(await user(), T.tue2000), undefined, 'not a participant');
});

await test('an unanswered survey is offered once more the next day, marked late, then lapses', async () => {
  const f = await fresh();
  const q = await question(f.st, 'Q', 'yes_no');
  const next = await pending(f.s1, T.wed1000);
  assert.equal(String(next.for_date.toISOString().slice(0, 10)), '2026-10-13');
  assert.equal(next.late, true);
  assert.equal(await submit(f.s1, '2026-10-13', { [q]: true }, T.wed1000), 'ok');
  assert.equal((await owner(`select late from research.survey_days d join research.participants p on p.id = d.participant_id where p.user_id = $1`, [f.s1]))[0].late, true);
  const after = await pending(f.s1, T.wed1000);
  assert.equal(after.for_date, null, 'today\'s is not due until 20:00');
  assert.equal(new Date(after.next_due_at).toISOString(), '2026-10-15T00:00:00.000Z');
  const lapsed = await pending(f.s2, '2026-10-15T14:00:00Z');   // Thursday morning, Tuesday's has lapsed
  assert.equal(String(lapsed.for_date.toISOString().slice(0, 10)), '2026-10-14', 'Wednesday is what is waiting, not Tuesday');
});

await test('when today\'s survey comes due, yesterday\'s missed one lapses', async () => {
  const f = await fresh();
  const q = await question(f.st, 'Q', 'yes_no');
  const morning = await pending(f.s1, T.tue1050);
  assert.equal(String(morning.for_date.toISOString().slice(0, 10)), '2026-10-12', 'Monday\'s is offered on Tuesday morning');
  assert.equal(morning.late, true);
  const evening = await pending(f.s1, T.tue2130);
  assert.equal(String(evening.for_date.toISOString().slice(0, 10)), '2026-10-13', 'by Tuesday evening it is Tuesday\'s');
  assert.equal(evening.late, false);
  assert.equal(await submit(f.s1, '2026-10-12', { [q]: true }, T.tue2130), 'not_pending', 'Monday has lapsed');
  assert.equal(await submit(f.s1, '2026-10-13', { [q]: true }, T.tue2130), 'ok');
  assert.equal((await pending(f.s1, T.tue2130)).for_date, null, 'answering today leaves nothing, and Monday does not come back');
});

await test('an on-time answer is not late, and a day can be answered only once', async () => {
  const f = await fresh();
  const q = await question(f.st, 'Q', 'yes_no');
  assert.equal(await submit(f.s1, '2026-10-13', { [q]: false }, T.tue2130), 'ok');
  assert.equal((await owner(`select late from research.survey_days d join research.participants p on p.id = d.participant_id where p.user_id = $1`, [f.s1]))[0].late, false);
  assert.equal(await submit(f.s1, '2026-10-13', { [q]: true }, T.tue2130), 'not_pending');
  assert.equal(await submit(f.s2, '2026-10-12', { [q]: true }, '2026-10-13T01:00:00Z'), 'ok', 'Monday evening, on time');
  assert.equal(await submit(f.s2, '2026-10-20', { [q]: true }, T.tue2130), 'not_pending', 'a day that is not waiting');
});

await test('every answer is checked against its question', async () => {
  const f = await fresh();
  const yn = await question(f.st, 'yn', 'yes_no', { position: 1 });
  const rt = await question(f.st, 'rt', 'rating', { position: 2 });
  const mc = await question(f.st, 'mc', 'multiple_choice', { options: ['Good', 'Bad'], position: 3 });
  const sa = await question(f.st, 'sa', 'short_answer', { position: 4 });
  const good = { [yn]: true, [rt]: 3, [mc]: 'Good', [sa]: 'fine' };
  const bad = async (patch) => assert.equal(await submit(f.s1, '2026-10-13', { ...good, ...patch }, T.tue2130), 'invalid_answers', JSON.stringify(patch));
  await bad({ [yn]: 'yes' }); await bad({ [yn]: 1 }); await bad({ [yn]: null });
  await bad({ [rt]: 0 }); await bad({ [rt]: 6 }); await bad({ [rt]: 2.5 }); await bad({ [rt]: '3' }); await bad({ [rt]: true });
  await bad({ [mc]: 'Other' }); await bad({ [mc]: 1 }); await bad({ [mc]: ['Good'] });
  await bad({ [sa]: 5 }); await bad({ [sa]: 'x'.repeat(501) });
  const missing = { ...good }; delete missing[sa];
  assert.equal(await submit(f.s1, '2026-10-13', missing, T.tue2130), 'invalid_answers', 'a missing answer');
  assert.equal(await submit(f.s1, '2026-10-13', { ...good, [crypto.randomUUID()]: 1 }, T.tue2130), 'invalid_answers', 'an extra key');
  assert.equal(await submit(f.s1, '2026-10-13', [1, 2, 3], T.tue2130), 'invalid_answers', 'not an object');
  assert.equal((await owner('select count(*)::int c from research.survey_days d join research.participants p on p.id = d.participant_id where p.user_id = $1', [f.s1]))[0].c, 0, 'nothing was stored');
  assert.equal(await submit(f.s1, '2026-10-13', { ...good, [sa]: '' }, T.tue2130), 'ok', 'an empty free-text answer is allowed');
  const stored = await owner('select r.answer from research.responses r join research.participants p on p.id = r.participant_id where p.user_id = $1 order by r.question_id', [f.s1]);
  assert.equal(stored.length, 4);
});

await test('the survey for withdrawn or expired students is not offered', async () => {
  const f = await fresh();
  const q = await question(f.st, 'Q', 'yes_no');
  await owner(`update research.participants set status = 'withdrawn', withdrawn_at = now() where user_id = $1`, [f.s1]);
  assert.equal(await pending(f.s1, T.tue2130), undefined);
  assert.equal(await submit(f.s1, '2026-10-13', { [q]: true }, T.tue2130), 'not_pending');
  await place(f.s2, ENROLLED, '2026-10-13T20:00:00Z');
  assert.equal(await pending(f.s2, T.tue2130), undefined, 'the window has ended');
});

await test('a student with a survey for their own group uses it over the one for everyone', async () => {
  const f = await fresh();
  await sched(f.st, 'L', 'survey', '21:30', 'L only');
  await question(f.st, 'Q', 'yes_no');
  const l = await pending(f.l1, T.tue2000);
  assert.equal(String(l.for_date.toISOString().slice(0, 10)), '2026-10-12', 'L has the 21:30 schedule, so at 20:00 only Monday\'s is waiting');
  assert.equal(l.late, true);
  assert.equal(new Date(l.next_due_at).toISOString(), '2026-10-14T01:30:00.000Z');
  const sGroup = await pending(f.s1, T.tue2000);
  assert.equal(String(sGroup.for_date.toISOString().slice(0, 10)), '2026-10-13', 'S has only the shared 20:00 one, which is due');
  assert.equal(sGroup.late, false);
});

await test('the app functions are iOS only and need a signed-in participant', async () => {
  const f = await fresh();
  const q = await question(f.st, 'Q', 'yes_no');
  const ask = (u, p = 'ios') => call(u, 'select * from public.research_pending_survey($1)', [p]);
  assert.equal((await ask(f.s1, 'web'))[0].status, 'ios_only');
  assert.equal((await ask(f.s1, null))[0].status, 'ios_only');
  assert.equal((await ask(await user()))[0].status, 'none', 'not a participant');
  await assert.rejects(call(null, `select * from public.research_pending_survey('ios')`), /not_signed_in/);
  await assert.rejects(call(null, `select * from public.research_pending_survey('ios')`, [], { role: 'anon' }), /permission denied/);
  const sub = (u, d, a, p = 'ios') => call(u, 'select * from public.research_submit_survey($1::date,$2::jsonb,$3)', [d, JSON.stringify(a), p]);
  assert.equal((await sub(f.s1, '2026-10-13', { [q]: true }, 'web'))[0].status, 'ios_only');
  assert.equal((await sub(await user(), '2026-10-13', { [q]: true }))[0].status, 'not_pending');
  await assert.rejects(call(null, `select * from public.research_submit_survey('2026-10-13','{}','ios')`, [], { role: 'anon' }), /permission denied/);
});

await test('response counts: surveys due and answered, per participant', async () => {
  const f = await fresh();
  const q = await question(f.st, 'Q', 'yes_no');
  await submit(f.s1, '2026-10-12', { [q]: true }, T.tue1050);
  await submit(f.s1, '2026-10-13', { [q]: true }, T.tue2130);
  const due = async (u, iso) => (await owner('select research.surveys_due((select id from research.participants where user_id = $1), $2::timestamptz) n', [u, iso]))[0].n;
  assert.equal(await due(f.s1, T.tue2130), 2, 'Monday and Tuesday evenings have passed');
  assert.equal(await due(f.s1, T.tue1050), 1, 'only Monday so far');
  assert.equal(await due(f.s1, T.wed2100), 3);
  await owner(`update research.participants set status = 'withdrawn', withdrawn_at = $2::timestamptz where user_id = $1`, [f.s2, '2026-10-13T12:00:00Z']);
  assert.equal(await due(f.s2, T.wed2100), 1, 'stops counting when they leave');
});

await test('the participant is left alone by regular pushes, and only while they are active', async () => {
  const a = await joiner();
  const b = await joiner();
  const c = await joiner();
  const d = await joiner();
  const e = await user();
  await call(b, 'select * from public.research_leave()');
  await owner(`update research.participants set status = 'completed' where user_id = $1`, [c]);
  await owner(`update research.participants set window_ends_at = now() - interval '1 minute' where user_id = $1`, [d]);
  const ask = async (ids) => {
    await db.exec('reset role'); await db.exec('set role service_role');
    try { return (await db.query('select * from public.research_active_user_ids($1::uuid[])', [ids])).rows.map((r) => r.research_active_user_ids); } finally { await db.exec('reset role'); }
  };
  assert.deepEqual(await ask([a, b, c, d, e]), [a]);
  assert.deepEqual(await ask([]), []);
});

await test('housekeeping closes the finished windows and records who can be reached', async () => {
  const on = await joiner();
  const off = await joiner();
  const old = await joiner();
  await owner(`update public.profiles set push_enabled = true where id = $1`, [on]);
  await owner(`insert into public.push_subscriptions (user_id, endpoint, apns_token) values ($1, 'apns:tok-on', 'tok-on')`, [on]);
  await owner(`insert into public.push_subscriptions (user_id, endpoint) values ($1, 'https://web/only')`, [off]);
  await owner(`update research.participants set window_ends_at = now() - interval '1 minute' where user_id = $1`, [old]);
  await db.exec('set role service_role');
  let out;
  try { out = (await db.query('select public.research_housekeeping() r')).rows[0].r; } finally { await db.exec('reset role'); }
  assert.ok(out.closed >= 1);
  const row = async (u) => (await owner('select status, push_status from research.participants where user_id = $1', [u]))[0];
  assert.deepEqual(await row(on), { status: 'active', push_status: 'on' });
  assert.deepEqual(await row(off), { status: 'active', push_status: 'off' }, 'a web subscription cannot receive the study push');
  assert.equal((await row(old)).status, 'completed');
});

await test('the default reminders are lunch and dinner for each group, drafted, and only added once', async () => {
  const st = await newStudy({ code: 'SEEDED-0001' });
  assert.equal((await owner('select research.seed_default_reminders($1) n', [st]))[0].n, 4);
  assert.equal((await owner('select research.seed_default_reminders($1) n', [st]))[0].n, 0);
  const rows = await owner(`select grp, kind, send_time::text t, days, late_minutes, title, body from research.reminder_schedules where study_id = $1 order by grp, send_time`, [st]);
  assert.deepEqual(rows.map((r) => [r.grp, r.kind, r.t, r.late_minutes]),
    [['L', 'reminder', '10:30:00', 30], ['L', 'reminder', '16:30:00', 30], ['S', 'reminder', '10:30:00', 30], ['S', 'reminder', '16:30:00', 30]]);
  assert.deepEqual(rows[0].days, [1, 2, 3, 4, 5, 6, 7]);
  for (const r of rows) assert.doesNotMatch(r.title + r.body, /[—;!]/);
  assert.match(rows[2].body, /snack/i);
  assert.match(rows[0].body, /walk the hall/i);
  const other = await newStudy({ code: 'SEEDED-0002' });
  await owner(`select research.seed_default_reminders($1, '17:00')`, [other]);
  assert.deepEqual((await owner(`select distinct send_time::text t from research.reminder_schedules where study_id = $1 order by 1`, [other])).map((r) => r.t), ['10:30:00', '17:00:00'], 'the dinner time is a choice');
  await assert.rejects(owner(`select research.add_schedule($1,'Z','reminder','10:30','x')`, [st]), /unknown_group/);
  await assert.rejects(owner(`select research.add_schedule($1,'S','banana','10:30','x')`, [st]), /bad_kind/);
  assert.equal((await owner(`select late_minutes from research.reminder_schedules where id = $1`, [await sched(st, null, 'survey', '20:00', 's')]))[0].late_minutes, 180, 'a survey defaults to a longer window');
});

await test('researchers read the schedules, questions, prompts and answers, and nobody else does', async () => {
  const f = await fresh();
  const q = await question(f.st, 'Q', 'yes_no');
  await submit(f.s1, '2026-10-13', { [q]: true }, T.tue2130);
  await claim(T.tue1030);
  const aal2 = { aal: 'aal2' };
  for (const t of ['reminder_schedules', 'questions', 'prompts', 'survey_days', 'responses', 'activity']) {
    assert.ok((await call(researcher, `select * from research.${t}`, [], aal2)).length > 0, `${t} visible`);
    assert.equal((await call(researcher, `select * from research.${t}`, [], { aal: 'aal1' })).length, 0, `${t} aal1`);
    assert.equal((await call(outsider, `select * from research.${t}`, [], aal2)).length, 0, `${t} outsider`);
    assert.equal((await call(f.s1, `select * from research.${t}`, [], aal2)).length, 0, `${t} participant`);
  }
  await assert.rejects(call(researcher, `update research.questions set is_active = false`, [], aal2), /permission denied/);
  await assert.rejects(call(researcher, `insert into research.responses (survey_day_id, participant_id, question_id, answer) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'true')`, [], aal2), /permission denied/);
});

await test('the activity view has the compensation numbers and no food data', async () => {
  const f = await fresh();
  const q = await question(f.st, 'Q', 'yes_no');
  const rows = await claim(T.tue1030);
  await owner('select research.mark_prompts($1::jsonb)', [JSON.stringify(rows.map((r, i) => ({ id: r.prompt_id, status: i === 0 ? 'failed' : 'sent' })))]);
  await submit(f.s1, '2026-10-13', { [q]: true }, T.tue2130);
  const mid = await owner(`insert into public.meal_history (user_id, confirmed_at, meal_type, meal_date, dining_hall, items) values ($1, now(), 'lunch', ${TODAY}, 'Sherman', $2::jsonb) returning id`, [f.s1, JSON.stringify([{ ...RICE, consumed: 1 }])]);
  void mid;
  await owner(`update research.reminder_schedules set is_active = false where study_id = $1 and kind = 'reminder'`, [f.st]);
  const [a] = await call(researcher, `select * from research.activity where participant_id = (select id from research.participants where user_id = $1)`, [f.s1], { aal: 'aal2' });
  assert.equal(a.surveys_answered, 1);
  assert.equal(a.plates_logged, 1);
  assert.equal(a.consumption_reports, 1);
  assert.ok(a.prompts_claimed >= 1);
  assert.deepEqual(Object.keys(a).filter((k) => /meal|item|food|calor|name|email/.test(k)), [], 'no food or identity columns');
  assert.ok(['S', 'L'].includes(a.grp));
});


// ── The researchers' daily survey, and follow-up questions ───────────────────

const qAt = async (st, pos) => (await owner('select id from research.questions where study_id = $1 and position = $2 and is_active', [st, pos]))[0]?.id;
const seeded = async ({ dinner = false } = {}) => {
  const f = await fresh();
  assert.equal((await owner('select research.seed_daily_survey($1,$2) n', [f.st, dinner]))[0].n, dinner ? 10 : 6);
  const q = { where: await qAt(f.st, 10), loop: await qAt(f.st, 20), snack: null, how: await qAt(f.st, 21), goals: await qAt(f.st, 30), left: await qAt(f.st, 40) };
  // Position 20 is both the L loop question and the S snack question.
  const at20 = await owner(`select id, grps from research.questions where study_id = $1 and position = 20 order by grps`, [f.st]);
  q.loop = at20.find((r) => r.grps[0] === 'L').id;
  q.snack = at20.find((r) => r.grps[0] === 'S').id;
  return { ...f, q };
};
const ids = async (u) => (await pending(u, T.tue2130)).questions.map((x) => x.id);

await test('the researchers\' survey is loaded once, with their wording and their intro', async () => {
  const f = await fresh();
  assert.equal((await owner('select research.seed_daily_survey($1) n', [f.st]))[0].n, 6);
  assert.equal((await owner('select research.seed_daily_survey($1) n', [f.st]))[0].n, 0, 'a second run adds nothing');
  const rows = await owner('select position, grps, format, text, options, show_if from research.questions where study_id = $1 order by position, grps', [f.st]);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].text, 'Did you eat lunch in Usdan or Sherman all-you-care-to-eat (AYCTE) dining hall today?');
  assert.deepEqual(rows[0].options, ['Yes - in Usdan', 'Yes - in Sherman', 'No']);
  assert.match(rows.find((r) => r.grps[0] === 'L').text, /^When having lunch at Usdan\/Sherman, did you use the "loop and plan" strategy/);
  assert.deepEqual(rows.find((r) => r.grps[0] === 'L').options, ['Not at all', 'Completely']);
  assert.equal(rows.find((r) => r.text.startsWith('Did you eat the snack')).format, 'yes_no');
  assert.deepEqual(rows.find((r) => r.text.startsWith('How much food')).options, ['Little or None', '1/4 plate', '1/2 plate', '3/4 plate', '1 plate', '1+ plate']);
  assert.deepEqual(rows.find((r) => r.text.startsWith('How long before lunch')).options, ['0-20 min before lunch', '21-60 min before lunch', 'More than 1 hour before lunch']);
  const [{ survey_intro: intro }] = await owner('select survey_intro from research.studies where id = $1', [f.st]);
  assert.match(intro, /^This is a 1-minute survey about your meal experiences today at Usdan and Sherman/);
  assert.ok(!JSON.stringify(rows).toLowerCase().includes('email'), 'the email question is not loaded');
});

await test('each group sees its own questions from the draft and the shared ones', async () => {
  const f = await seeded();
  assert.deepEqual(await ids(f.l1), [f.q.where, f.q.loop, f.q.goals, f.q.left]);
  assert.deepEqual(await ids(f.s1), [f.q.where, f.q.snack, f.q.how, f.q.goals, f.q.left], 'the follow-up is sent to the app, which decides when to show it');
});

await test('the snack follow-up is required after yes, refused after no, and the right rows are stored', async () => {
  const f = await seeded();
  const base = { [f.q.where]: 'Yes - in Sherman', [f.q.goals]: 4, [f.q.left]: '1/2 plate' };
  const go = (u, a) => submit(u, '2026-10-13', a, T.tue2130);
  assert.equal(await go(f.s1, { ...base, [f.q.snack]: true }), 'invalid_answers', 'yes needs the follow-up');
  assert.equal(await go(f.s1, { ...base, [f.q.snack]: false, [f.q.how]: '0-20 min before lunch' }), 'invalid_answers', 'no must not carry one');
  assert.equal(await go(f.s1, { ...base, [f.q.snack]: true, [f.q.how]: 'Yesterday' }), 'invalid_answers', 'not one of the choices');
  assert.equal(await go(f.s1, { ...base, [f.q.snack]: true, [f.q.how]: '21-60 min before lunch' }), 'ok');
  assert.equal(await go(f.s2, { ...base, [f.q.snack]: false }), 'ok');
  const count = async (u) => (await owner('select count(*)::int c from research.responses r join research.participants p on p.id = r.participant_id where p.user_id = $1', [u]))[0].c;
  assert.equal(await count(f.s1), 5, 'yes stores the follow-up');
  assert.equal(await count(f.s2), 4, 'no stores no answer to a question that was not shown');
});

await test('group L answers four questions and may not answer the snack ones', async () => {
  const f = await seeded();
  const a = { [f.q.where]: 'No', [f.q.loop]: 5, [f.q.goals]: 1, [f.q.left]: 'Little or None' };
  assert.equal(await submit(f.l1, '2026-10-13', { ...a, [f.q.snack]: true }, T.tue2130), 'invalid_answers');
  assert.equal(await submit(f.l1, '2026-10-13', a, T.tue2130), 'ok');
  assert.equal(await submit(f.l1, '2026-10-13', { ...a, [f.q.loop]: 6 }, T.tue2130), 'not_pending', 'already answered');
});

// ── The wide survey sheet: column names and codes ────────────────────────────

const meta = async (st) => Object.fromEntries((await owner(`select column_key k, codes, text from research.questions where study_id = $1 and is_active and column_key is not null`, [st])).map((r) => [r.k, r]));

await test('the seed names its columns as in the May export, and gives the hall question its codes', async () => {
  const f = await seeded({ dinner: true });
  const m = await meta(f.st);
  assert.deepEqual(Object.keys(m).sort(), ['dinnerYN', 'dinner_goals', 'dinner_loop', 'dinner_waste', 'lunchYN', 'lunch_goals', 'lunch_loop', 'lunch_snack', 'lunch_snack_time', 'lunch_waste'].sort());
  assert.deepEqual(m.lunchYN.codes, [1, 2, 0]);
  assert.equal(m.lunch_loop.codes, null);
});

await test('one survey day is one row with its raw answers keyed by question id', async () => {
  const f = await seeded();
  const a = { [f.q.where]: 'Yes - in Usdan', [f.q.loop]: 5, [f.q.goals]: 2, [f.q.left]: '1/4 plate' };
  assert.equal(await submit(f.l1, '2026-10-13', a, T.tue2130), 'ok');
  const rows = await owner(`select w.* from research.grid_survey_wide w join research.survey_days d on d.id::text = w.row_id join research.participants p on p.id = d.participant_id where p.user_id = $1`, [f.l1]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].answers, a);
  assert.equal(rows[0].grp, 'L');
  assert.equal(rows[0].late, false);
});

await test('a column name and codes can be set, checked, and are audited', async () => {
  const f = await seeded();
  await owner(`select research.tag_question($1, 'lunch_hall', '[2, 1, 0]')`, [f.q.where]);
  assert.deepEqual((await meta(f.st)).lunch_hall.codes, [2, 1, 0]);
  await assert.rejects(owner(`select research.tag_question($1, 'lunch_loop')`, [f.q.goals]), /column_name_in_use/);
  await assert.rejects(owner(`select research.tag_question($1, 'bad name')`, [f.q.goals]), /bad_value: column name/);
  await assert.rejects(owner(`select research.tag_question($1, 'x', '[1, 2]')`, [f.q.where]), /codes_need_one_per_choice: 3/);
  await assert.rejects(owner(`select research.tag_question($1, 'x', '[1, 1, 0]')`, [f.q.where]), /codes must differ/);
  await assert.rejects(owner(`select research.tag_question($1, 'x', '[1, 2.5, 0]')`, [f.q.where]), /whole numbers/);
  await assert.rejects(owner(`select research.tag_question($1, 'x', '[1, 2]')`, [f.q.goals]), /codes_not_for_this_question/);
  await owner(`select research.tag_question($1, null, null)`, [f.q.goals]);
  assert.equal((await meta(f.st)).lunch_goals, undefined, 'a blank name clears it');
});

await test('a replacement question carries its column name and codes on', async () => {
  const f = await seeded();
  const n = await question(f.st, 'Which hall did you eat lunch in today?', 'multiple_choice', { options: ['Usdan', 'Sherman', 'Neither'], position: 10, replaces: f.q.where });
  const [row] = await owner('select column_key, codes, is_active from research.questions where id = $1', [n]);
  assert.deepEqual([row.column_key, row.codes, row.is_active], ['lunchYN', [1, 2, 0], true]);
  const other = await question(f.st, 'Another?', 'multiple_choice', { options: ['A', 'B'], position: 11, replaces: f.q.goals });
  assert.equal((await owner('select codes from research.questions where id = $1', [other]))[0].codes, null, 'codes do not carry onto a different number of choices');
});

await test('everyone is asked the lunch questions even when they ate no lunch in a hall, as the draft says', async () => {
  const f = await seeded();
  assert.equal(await submit(f.l1, '2026-10-13', { [f.q.where]: 'No', [f.q.loop]: 1, [f.q.goals]: 1, [f.q.left]: '1+ plate' }, T.tue2130), 'ok');
  assert.equal(await submit(f.s2, '2026-10-13', { [f.q.where]: 'No', [f.q.snack]: false, [f.q.goals]: 3, [f.q.left]: '1 plate' }, T.tue2130), 'ok');
});

await test('the dinner block is off by default and, when on, follows the dinner gate', async () => {
  const off = await fresh();
  await owner('select research.seed_daily_survey($1) n', [off.st]);
  assert.equal((await owner('select count(*)::int c from research.questions where study_id = $1 and position >= 50', [off.st]))[0].c, 0);

  const f = await seeded({ dinner: true });
  const dq = { gate: await qAt(f.st, 50), goals: await qAt(f.st, 70), left: await qAt(f.st, 80) };
  const loopDinner = (await owner(`select id from research.questions where study_id = $1 and position = 60`, [f.st]))[0].id;
  assert.ok(!(await owner(`select text from research.questions where study_id = $1 and position >= 50`, [f.st])).some((r) => /snack/i.test(r.text)), 'the draft\'s dinner snack question is not loaded');
  const lunch = { [f.q.where]: 'Yes - in Usdan', [f.q.goals]: 3, [f.q.left]: '1/4 plate' };
  const sLunch = { ...lunch, [f.q.snack]: false };
  const lLunch = { ...lunch, [f.q.loop]: 2 };
  assert.equal(await submit(f.s1, '2026-10-13', { ...sLunch, [dq.gate]: 'No' }, T.tue2130), 'ok', 'no dinner, no dinner answers');
  assert.equal(await submit(f.s2, '2026-10-13', { ...sLunch, [dq.gate]: 'No', [dq.goals]: 3 }, T.tue2130), 'invalid_answers', 'an answer to a hidden dinner question');
  assert.equal(await submit(f.s2, '2026-10-13', { ...sLunch, [dq.gate]: 'Yes - in Sherman' }, T.tue2130), 'invalid_answers', 'dinner needs its follow-ups');
  assert.equal(await submit(f.s2, '2026-10-13', { ...sLunch, [dq.gate]: 'Yes - in Sherman', [dq.goals]: 4, [dq.left]: '3/4 plate' }, T.tue2130), 'ok', 'S has no dinner loop question');
  assert.equal(await submit(f.l1, '2026-10-13', { ...lLunch, [dq.gate]: 'Yes - in Usdan', [loopDinner]: 5, [dq.goals]: 4, [dq.left]: 'Little or None' }, T.tue2130), 'ok', 'L has one');
});

await test('a follow-up of a follow-up stays hidden when the first one is', async () => {
  const f = await fresh();
  const a = await question(f.st, 'A', 'yes_no', { position: 1 });
  const b = (await owner(`select research.add_question($1,'B','yes_no','[]'::jsonb,'{}',2,null,$2::jsonb) id`, [f.st, JSON.stringify({ question: a, any_of: [true] })]))[0].id;
  const c = (await owner(`select research.add_question($1,'C','yes_no','[]'::jsonb,'{}',3,null,$2::jsonb) id`, [f.st, JSON.stringify({ question: b, any_of: [true] })]))[0].id;
  assert.equal(await submit(f.s1, '2026-10-13', { [a]: false, [c]: true }, T.tue2130), 'invalid_answers', 'C cannot be answered when A hid B');
  assert.equal(await submit(f.s1, '2026-10-13', { [a]: false }, T.tue2130), 'ok');
  assert.equal(await submit(f.s2, '2026-10-13', { [a]: true, [b]: true }, T.tue2130), 'invalid_answers', 'B shown, so C is needed');
  assert.equal(await submit(f.s2, '2026-10-13', { [a]: true, [b]: true, [c]: false }, T.tue2130), 'ok');
});

await test('follow-up and scale-label rules are enforced where the questions are written', async () => {
  const f = await fresh();
  const a = await question(f.st, 'A', 'yes_no', { position: 5 });
  const add = (pos, showIf, fmt = 'yes_no', opts = '[]') => owner(`select research.add_question($1,'x',$2,$3::jsonb,'{}',$4,null,$5::jsonb)`, [f.st, fmt, opts, pos, showIf === null ? null : JSON.stringify(showIf)]);
  await assert.rejects(add(6, { question: '00000000-0000-0000-0000-000000000000', any_of: [true] }), /show_if_needs_an_earlier_question/);
  await assert.rejects(add(5, { question: a, any_of: [true] }), /show_if_needs_an_earlier_question/, 'not before it, not at the same place');
  await assert.rejects(add(4, { question: a, any_of: [true] }), /show_if_needs_an_earlier_question/);
  await assert.rejects(add(6, { question: a }), /questions_show_if/, 'a condition with nothing to match');
  await assert.rejects(add(6, { question: a, any_of: [true], none_of: [false] }), /questions_show_if/, 'both kinds at once');
  await assert.rejects(add(6, { any_of: [true] }), /show_if_needs_an_earlier_question|questions_show_if/, 'no parent');
  await assert.rejects(add(6, { question: a, any_of: 'yes' }), /questions_show_if/, 'not a list');
  await add(6, { question: a, none_of: [false] });
  await assert.rejects(add(7, null, 'rating', '["only one label"]'), /questions_rating_labels/);
  await assert.rejects(add(7, null, 'rating', '["a","b","c"]'), /questions_rating_labels/);
  await add(7, null, 'rating', '["Low","High"]');
  await add(8, null, 'rating', '[]');
  await assert.rejects(owner(`update research.questions set show_if = null where study_id = $1 and position = 6`, [f.st]), /questions_are_never_edited/);
});

await test('the app gets the intro and the follow-up conditions with the questions', async () => {
  const f = await seeded();
  const row = await pending(f.s1, T.tue2130);
  assert.match(row.intro, /^This is a 1-minute survey/);
  const how = row.questions.find((x) => x.id === f.q.how);
  assert.deepEqual(how.show_if, { question: f.q.snack, any_of: [true] });
  assert.equal(row.questions.find((x) => x.id === f.q.where).show_if, null);
  const early = await pending(f.s1, T.mon1500);
  assert.equal(early.questions, null, 'nothing waiting, so nothing to show before its time');
  const wrapped = (await call(f.s1, 'select * from public.research_pending_survey($1)', ['ios']));
  assert.equal(wrapped.length, 1);
  assert.ok('intro' in wrapped[0]);
  const noIntro = await fresh();
  await question(noIntro.st, 'Q', 'yes_no');
  assert.equal((await pending(noIntro.s1, T.tue2130)).intro, null, 'a study without one falls back to the app\'s wording');
});

await test('researchers can read the intro and the follow-up conditions', async () => {
  const f = await seeded();
  const aal2 = { aal: 'aal2' };
  const rows = await call(researcher, `select survey_intro from research.studies where id = $1`, [f.st], aal2);
  assert.match(rows[0].survey_intro, /1-minute survey/);
  const qs = await call(researcher, `select show_if from research.questions where study_id = $1 and show_if is not null`, [f.st], aal2);
  assert.equal(qs.length, 1);
});


// ── Phase 5: what the researcher site needs ──────────────────────────────────

await test('the site can tell who is signed in and what step comes next', async () => {
  const who = async (u, aal) => (await call(u, 'select * from public.research_whoami()', [], { aal }))[0];
  assert.deepEqual(await who(researcher, 'aal2'), { is_researcher: true, role: 'researcher', aal: 'aal2', email: 'r@example.edu' });
  assert.deepEqual(await who(researcher, 'aal1'), { is_researcher: true, role: 'researcher', aal: 'aal1', email: 'r@example.edu' }, 'a researcher who has not passed multi-factor yet');
  assert.equal((await who(researcher)).aal, '', 'no aal claim at all');
  assert.equal((await who(owner1, 'aal2')).role, 'owner');
  assert.deepEqual(await who(outsider, 'aal2'), { is_researcher: false, role: null, aal: 'aal2', email: null }, 'signed in, not a researcher');
  const gone = (await owner(`select user_id from research.researchers where is_active = false limit 1`))[0].user_id;
  assert.equal((await who(gone, 'aal2')).is_researcher, false, 'a deactivated researcher is not one');
  await assert.rejects(call(null, 'select * from public.research_whoami()'), /not_signed_in/);
  await assert.rejects(call(null, 'select * from public.research_whoami()', [], { role: 'anon' }), /permission denied/);
});

await test('the audit log takes entries only from a researcher on a multi-factor session', async () => {
  const before = (await owner('select count(*)::int c from research.audit_log'))[0].c;
  const log = async (u, aal, action, detail = {}) => (await call(u, 'select public.research_log_action($1, $2::jsonb) r', [action, JSON.stringify(detail)], { aal }))[0].r;
  assert.equal(await log(researcher, 'aal2', 'export', { sheet: 'meals', format: 'csv', rows: 120, filtered: true }), true);
  assert.equal(await log(researcher, 'aal2', 'sign_in'), true);
  assert.equal(await log(researcher, 'aal1', 'export'), false, 'a stolen password leaves no record and gets nothing');
  assert.equal(await log(researcher, undefined, 'export'), false);
  assert.equal(await log(outsider, 'aal2', 'export'), false, 'not a researcher');
  assert.equal(await log(researcher, 'aal2', 'drop_everything'), false, 'only the known actions');
  assert.equal(await log(researcher, 'aal2', 'export', { blob: 'x'.repeat(5000) }), false, 'a detail too big to be a record');
  assert.equal((await call(researcher, `select public.research_log_action('export', '[1,2]'::jsonb) r`, [], { aal: 'aal2' }))[0].r, false, 'detail must be an object');
  assert.equal((await owner('select count(*)::int c from research.audit_log'))[0].c, before + 2);
  const [row] = await owner(`select * from research.audit_log where action = 'export' order by id desc limit 1`);
  assert.equal(row.email, 'r@example.edu');
  assert.deepEqual(row.detail, { sheet: 'meals', format: 'csv', rows: 120, filtered: true });
  assert.equal(row.user_id, researcher);
  await assert.rejects(call(null, `select public.research_log_action('export')`), /not_signed_in/);
  await assert.rejects(call(null, `select public.research_log_action('export')`, [], { role: 'anon' }), /permission denied/);
});

await test('the audit log cannot be changed or deleted, and only an owner can read it', async () => {
  await assert.rejects(owner(`update research.audit_log set action = 'sign_in'`), /audit_log_is_append_only/);
  await assert.rejects(owner(`delete from research.audit_log`), /audit_log_is_append_only/);
  const aal2 = { aal: 'aal2' };
  assert.equal((await call(researcher, 'select * from research.audit_log', [], aal2)).length, 0, 'a researcher cannot read it');
  assert.equal((await call(outsider, 'select * from research.audit_log', [], aal2)).length, 0);
  assert.ok((await call(owner1, 'select * from research.audit_log', [], aal2)).length >= 2, 'an owner can');
  assert.equal((await call(owner1, 'select * from research.audit_log', [], { aal: 'aal1' })).length, 0, 'an owner needs multi-factor too');
  await assert.rejects(call(owner1, `insert into research.audit_log (user_id, action) values (gen_random_uuid(), 'export')`, [], aal2), /permission denied/);
  await assert.rejects(call(owner1, `delete from research.audit_log`, [], aal2), /permission denied/);
});

await test('every answer is one row with its participant and its exact question', async () => {
  const f = await seeded();
  const base = { [f.q.where]: 'Yes - in Sherman', [f.q.goals]: 4, [f.q.left]: '1/2 plate' };
  assert.equal(await submit(f.s1, '2026-10-13', { ...base, [f.q.snack]: true, [f.q.how]: '0-20 min before lunch' }, T.tue2130), 'ok');
  assert.equal(await submit(f.l1, '2026-10-13', { [f.q.where]: 'No', [f.q.loop]: 5, [f.q.goals]: 2, [f.q.left]: 'Little or None' }, T.tue2130), 'ok');
  const aal2 = { aal: 'aal2' };
  const pid = (await owner('select id from research.participants where user_id = $1', [f.s1]))[0].id;
  const rows = await call(researcher, `select * from research.responses_flat where participant_id = $1 order by question_position, question_text`, [pid], aal2);
  assert.equal(rows.length, 5);
  const row = (start) => rows.find((r) => r.question_text.startsWith(start));
  assert.equal(row('Did you eat the snack').answer_text, 'Yes', 'a yes or no reads as Yes or No');
  assert.equal(row('Did you eat the snack').grp, 'S');
  assert.equal(row('To what extent').answer_text, '4', 'a rating reads as its number');
  assert.equal(row('How much food').answer_text, '1/2 plate');
  assert.equal(row('How long before lunch').question_format, 'multiple_choice');
  assert.ok(rows.every((r) => r.question_id && r.submitted_at && r.late === false));
  assert.equal((await call(researcher, `select * from research.responses_flat where participant_id = $1`, [pid], { aal: 'aal1' })).length, 0);
  assert.equal((await call(outsider, `select * from research.responses_flat`, [], aal2)).length, 0);
  assert.equal((await call(f.s1, `select * from research.responses_flat`, [], aal2)).length, 0, 'not even the participant');
  const mine = (await owner('select id from research.participants where user_id = $1', [f.l1]))[0].id;
  const l = (await call(researcher, `select * from research.responses_flat where participant_id = $1`, [mine], aal2));
  assert.equal(l.length, 4, 'group L has four');
  assert.ok(l.every((r) => r.grp === 'L'));
});

await test('the list shows who has enrolled, and the test study never appears', async () => {
  const st = await newStudy({ code: 'ROSTER-0001' });
  const joined = await listed(st, { name: 'Has Joined' });
  assert.equal((await enroll(joined, 'ROSTER-0001')).status, 'ok');
  await owner('select research.add_roster($1,$2::jsonb)', [st, JSON.stringify([{ email: 'not.yet@example.edu', name: 'Not Yet' }])]);
  const aal2 = { aal: 'aal2' };
  const rows = await call(researcher, `select * from research.roster_status where study_id = $1 order by email`, [st], aal2);
  assert.equal(rows.length, 2);
  const yes = rows.find((r) => r.full_name === 'Has Joined');
  const no = rows.find((r) => r.full_name === 'Not Yet');
  assert.deepEqual([yes.enrolled, yes.participant_status, !!yes.participant_code, !!yes.claimed_at], [true, 'active', true, true]);
  assert.deepEqual([no.enrolled, no.participant_status, no.participant_code, no.claimed_at], [false, null, null, null]);
  assert.equal((await call(researcher, `select * from research.roster_status`, [], { aal: 'aal1' })).length, 0);
  assert.equal((await call(outsider, `select * from research.roster_status`, [], aal2)).length, 0);
  const t = await newStudy({ code: 'ROSTER-TEST', test: true });
  await owner('select research.add_roster($1,$2::jsonb)', [t, JSON.stringify([{ email: 'reviewer@example.edu' }])]);
  assert.equal((await call(researcher, `select * from research.roster_status where study_id = $1`, [t], aal2)).length, 0);
});


await test('every sheet the dashboard shows is a view with a stable row id, a participant code and the right rows', async () => {
  const aal2 = { aal: 'aal2' };
  const sheets = ['participants', 'roster', 'responses', 'meals', 'plate_items', 'events', 'snapshots', 'prompts', 'activity'];
  for (const name of sheets) {
    const rows = await call(researcher, `select * from research.grid_${name}`, [], aal2);
    assert.ok(rows.length > 0, `${name} has rows for a researcher`);
    const keys = Object.keys(rows[0]);
    assert.equal(keys[0], 'row_id', `${name} starts with its row id`);
    assert.equal(new Set(rows.map((r) => r.row_id)).size, rows.length, `${name} row ids are unique`);
    if (name !== 'roster') assert.ok(keys.includes('participant_code') && keys.includes('grp'), `${name} carries the participant`);
    assert.equal((await call(researcher, `select * from research.grid_${name}`, [], { aal: 'aal1' })).length, 0, `${name} aal1`);
    assert.equal((await call(researcher, `select * from research.grid_${name}`)).length, 0, `${name} no aal`);
    assert.equal((await call(outsider, `select * from research.grid_${name}`, [], aal2)).length, 0, `${name} not a researcher`);
    await assert.rejects(call(researcher, `update research.grid_${name} set row_id = 'x'`, [], aal2), /permission denied|cannot update/, `${name} is read only`);
  }
  // Nothing from the test study leaks through any of them.
  const testPids = (await owner(`select p.id from research.participants p join research.studies s on s.id = p.study_id where s.is_test`)).map((r) => r.id);
  assert.ok(testPids.length > 0);
  const hidden = await call(researcher, `select row_id from research.grid_participants where row_id = any($1::text[])`, [testPids], aal2);
  assert.equal(hidden.length, 0);
  // The plate view flattens one row per item, a number or nothing.
  const items = await call(researcher, `select consumed, servings from research.grid_plate_items where item_name = 'Odd'`, [], aal2);
  assert.ok(items.length > 0);
  assert.equal(items[0].consumed, null);
});


await test('every column the dashboard shows exists in the database view it reads, and the reverse', async () => {
  for (const sheet of [...SHEETS, AUDIT_SHEET]) {
    const source = `research.${sheet.view ?? sheet.table}`;
    const { fields } = await db.query(`select * from ${source} limit 0`);
    const have = fields.map((f) => f.name);
    for (const c of sheet.columns) assert.ok(have.includes(c.field), `${sheet.id}: the database has no column ${c.field}`);
    assert.ok(have.includes(sheet.rowId ?? 'row_id'), `${sheet.id}: no row id`);
    // A view column nobody shows is a column researchers cannot see: say so.
    const shown = new Set([sheet.rowId ?? 'row_id', ...sheet.columns.map((c) => c.field), ...(sheet.extraSelect ?? [])]);
    const hidden = have.filter((f) => !shown.has(f));
    assert.deepEqual(hidden, [], `${sheet.id}: columns in the database that the sheet does not show`);
    // What the view orders by must exist too.
    assert.ok(have.includes(sheet.order ?? 'row_id'), `${sheet.id}: cannot order by ${sheet.order}`);
  }
});


await test('a researcher is added by the email of someone already invited, and can be switched off', async () => {
  const u = await user('new.researcher@example.edu');
  const id = (await owner(`select research.add_researcher(' New.Researcher@Example.edu ') id`))[0].id;
  assert.equal(id, u);
  const aal2 = { aal: 'aal2' };
  const who = async () => (await call(u, 'select * from public.research_whoami()', [], aal2))[0];
  assert.deepEqual([(await who()).is_researcher, (await who()).role], [true, 'researcher']);
  assert.ok((await call(u, 'select * from research.grid_participants', [], aal2)).length > 0, 'they can read as soon as they have multi-factor');
  await owner(`select research.add_researcher('new.researcher@example.edu', 'owner')`);
  assert.equal((await who()).role, 'owner', 'adding again changes the role');
  assert.equal((await owner(`select count(*)::int c from research.researchers where user_id = $1`, [u]))[0].c, 1);
  assert.equal((await owner(`select research.remove_researcher('NEW.researcher@example.edu') r`))[0].r, true);
  assert.equal((await who()).is_researcher, false);
  assert.equal((await call(u, 'select * from research.grid_participants', [], aal2)).length, 0, 'access is off at once');
  assert.equal((await owner(`select research.remove_researcher('nobody@example.edu') r`))[0].r, false);
  await assert.rejects(owner(`select research.add_researcher('not.invited@example.edu')`), /no_such_user/);
  await assert.rejects(owner(`select research.add_researcher('new.researcher@example.edu', 'admin')`), /bad_role/);
  for (const sql of [`select research.add_researcher('x@example.edu')`, `select research.remove_researcher('x@example.edu')`]) {
    await assert.rejects(call(outsider, sql, [], aal2), /permission denied/, sql);
    await assert.rejects(call(researcher, sql, [], aal2), /permission denied/, sql);
    await assert.rejects(call(owner1, sql, [], aal2), /permission denied/, 'not even an owner, from the browser');
  }
});


// ── Phase 6: researchers change the study from the dashboard ─────────────────

const AAL2 = { aal: 'aal2' };
const setup = (u, sql, params = [], opts = AAL2) => call(u, sql, params, opts);
const audit = async (what) => (await owner(`select * from research.audit_log where action = 'setup_change' and detail ->> 'what' = $1 order by id`, [what]));
const setupCount = async () => (await owner(`select count(*)::int c from research.audit_log where action = 'setup_change'`))[0].c;
const study_ = (id, changes) => setup(researcher, 'select public.research_set_study($1, $2::jsonb) r', [id, JSON.stringify(changes)]).then((r) => r[0].r);

await test('every setup function refuses anyone but a researcher on a multi-factor session', async () => {
  const f = await fresh();
  const q = await question(f.st, 'Q', 'yes_no');
  const calls = [
    ['select public.research_set_study($1, \'{"cap": 50}\')', [f.st]],
    ['select public.research_set_study_code($1, \'ANOTHER-CODE\')', [f.st]],
    ['select public.research_save_schedule($1, \'{"title": "x"}\')', [f.snack]],
    [`select public.research_add_schedule($1, 'S', 'reminder', '11:00', 'x')`, [f.st]],
    [`select public.research_add_question($1, 'New', 'yes_no')`, [f.st]],
    ['select public.research_set_question($1, false)', [q]],
  ];
  const before = await setupCount();
  for (const [sql, params] of calls) {
    for (const [who, label, opts] of [[outsider, 'a signed-in non-researcher', AAL2], [researcher, 'a researcher without multi-factor', { aal: 'aal1' }],
                                      [researcher, 'a researcher with no assurance level', {}], [null, 'nobody signed in', AAL2]]) {
      await assert.rejects(setup(who, sql, params, opts), /not_authorised/, `${sql} as ${label}`);
    }
    await assert.rejects(setup(null, sql, params, { role: 'anon' }), /permission denied/, `${sql} as anon`);
  }
  assert.equal(await setupCount(), before, 'nothing was written');
  assert.equal((await owner('select cap from research.studies where id = $1', [f.st]))[0].cap, 100, 'and nothing changed');
});

await test('the test study cannot be changed from the dashboard', async () => {
  const t = await newStudy({ code: 'SETUPTEST-1', test: true });
  await assert.rejects(setup(researcher, `select public.research_set_study($1, '{"cap": 5}')`, [t]), /unknown_study/);
  await assert.rejects(setup(researcher, `select public.research_set_study_code($1, 'SOMETHING-ELSE')`, [t]), /unknown_study/);
  await assert.rejects(setup(researcher, `select public.research_add_question($1, 'Q', 'yes_no')`, [t]), /unknown_study/);
  await assert.rejects(setup(researcher, `select public.research_set_study('00000000-0000-0000-0000-000000000000', '{}')`), /unknown_study/);
});

await test('study settings change, are checked, and are written to the audit log once each', async () => {
  const f = await fresh();
  const before = await setupCount();
  const diff = await study_(f.st, { cap: 60, window_days: 28, is_open: false });
  assert.deepEqual(diff, { cap: { from: 100, to: 60 }, is_open: { from: true, to: false }, window_days: { from: 21, to: 28 } });
  const [row] = await owner('select cap, window_days, is_open from research.studies where id = $1', [f.st]);
  assert.deepEqual(row, { cap: 60, window_days: 28, is_open: false });
  assert.equal(await setupCount(), before + 1, 'one entry for one save');
  const [a] = (await audit('study')).slice(-1);
  assert.equal(a.email, 'r@example.edu'); assert.equal(a.user_id, researcher);
  assert.deepEqual(a.detail.changes.cap, { from: 100, to: 60 });
  assert.deepEqual(await study_(f.st, { cap: 60, window_days: 28 }), {}, 'saving what is already there changes nothing');
  assert.equal(await setupCount(), before + 1, 'and records nothing');
  assert.deepEqual(await study_(f.st, {}), {});
});

await test('study settings refuse bad values, and a cap below the people already enrolled', async () => {
  const f = await fresh();
  const bad = async (changes, re) => assert.rejects(study_(f.st, changes), re, JSON.stringify(changes));
  await bad({ cap: 2 }, /cap_below_enrolled/);
  await bad({ cap: 0 }, /bad_value: cap/); await bad({ cap: 1001 }, /bad_value: cap/); await bad({ cap: 3.5 }, /bad_value: cap/); await bad({ cap: '40' }, /bad_value: cap/);
  await bad({ window_days: 0 }, /bad_value: window_days/); await bad({ window_days: 121 }, /bad_value: window_days/); await bad({ window_days: 'x' }, /bad_value: window_days/);
  await bad({ is_open: 'yes' }, /bad_value: is_open/);
  await bad({ survey_intro: 5 }, /bad_value: survey_intro/); await bad({ survey_intro: 'x'.repeat(601) }, /bad_value: survey_intro/);
  await bad({ starts_at: '2026-11-02T00:00:00Z', ends_at: '2026-11-01T00:00:00Z' }, /bad_value: ends_at/);
  await bad({ name: 'Renamed' }, /unknown_setting: name/); await bad({ code_hash: 'x' }, /unknown_setting/); await bad({ is_test: true }, /unknown_setting/); await bad({ groups: ['A'] }, /unknown_setting/);
  await assert.rejects(setup(researcher, `select public.research_set_study($1, '[1]')`, [f.st]), /bad_changes/);
  assert.equal((await study_(f.st, { cap: 3 })).cap.to, 3, 'a cap equal to the number enrolled is fine');
  assert.equal((await owner('select cap, window_days, is_open from research.studies where id = $1', [f.st]))[0].cap, 3, 'and a refused save left the rest untouched');
});

await test('dates and the survey intro can be set and cleared, and the intro text never reaches the audit log', async () => {
  const f = await fresh();
  await study_(f.st, { starts_at: '2026-10-12T04:00:00Z', ends_at: '2026-12-01T04:00:00Z', survey_intro: '  A private intro line.  ' });
  let [r] = await owner('select starts_at, ends_at, survey_intro from research.studies where id = $1', [f.st]);
  assert.equal(r.survey_intro, 'A private intro line.', 'trimmed');
  assert.equal(new Date(r.ends_at).toISOString(), '2026-12-01T04:00:00.000Z');
  await study_(f.st, { starts_at: null, ends_at: null, survey_intro: '   ' });
  [r] = await owner('select starts_at, ends_at, survey_intro from research.studies where id = $1', [f.st]);
  assert.deepEqual([r.starts_at, r.ends_at, r.survey_intro], [null, null, null]);
  assert.ok(!JSON.stringify(await owner(`select detail from research.audit_log where action = 'setup_change'`)).includes('A private intro line'));
});

await test('closing the study and changing its cap take effect on enrolment at once', async () => {
  const f = await fresh();
  const u = await listed(f.st);
  assert.equal((await check(u, f.code)).status, 'ok');
  await study_(f.st, { is_open: false });
  assert.equal((await check(u, f.code)).status, 'invalid_code', 'closed looks like a wrong code');
  await study_(f.st, { is_open: true, cap: 3 });
  assert.equal((await check(u, f.code)).status, 'invalid_code', 'full, with three already in');
  await study_(f.st, { cap: 4 });
  assert.equal((await enroll(u, f.code)).status, 'ok');
});

await test('the study code can be replaced: the old one stops, the new one works, and the audit log never has it', async () => {
  const f = await fresh();
  const u = await listed(f.st);
  const before = await setupCount();
  assert.equal((await setup(researcher, `select public.research_set_study_code($1, ' fresh code-77 ') r`, [f.st]))[0].r, true);
  assert.equal(await setupCount(), before + 1);
  assert.equal((await check(u, f.code)).status, 'invalid_code', 'the old code');
  assert.equal((await check(u, 'FRESHCODE77')).status, 'ok', 'the new one, with spaces and dashes ignored');
  assert.equal((await enroll(u, 'fresh code-77')).status, 'ok');
  assert.equal((await status(f.s1)).status, 'active', 'people already in are unaffected');
  const log = JSON.stringify(await owner(`select detail from research.audit_log where action = 'setup_change'`));
  assert.ok(!/fresh ?code|FRESHCODE/i.test(log), 'the code is not in the log');
  await assert.rejects(setup(researcher, `select public.research_set_study_code($1, 'abc')`, [f.st]), /code_too_short/);
  await assert.rejects(setup(researcher, `select public.research_set_study_code($1, '  ---  ')`, [f.st]), /code_too_short/);
  await assert.rejects(setup(researcher, `select public.research_set_study_code($1, $2)`, [f.st, CODE]), /code_in_use/, 'another study already uses it');
  assert.equal((await check(await listed(f.st), 'FRESHCODE77')).status, 'ok', 'a refused change left the code as it was');
});

await test('a schedule can be edited, and the new time is what the sender uses', async () => {
  const f = await fresh();
  const save = (id, changes) => setup(researcher, 'select public.research_save_schedule($1, $2::jsonb) r', [id, JSON.stringify(changes)]).then((r) => r[0].r);
  assert.equal((await claim(T.tue1030)).filter((r) => r.kind === 'reminder').length, 3);
  const diff = await save(f.snack, { send_time: '11:15', title: ' Snack now ', body: 'Eat it.', late_minutes: 20, days: [5, 1, 3, 3] });
  assert.deepEqual(diff.send_time, { from: '10:30:00', to: '11:15:00' });
  assert.deepEqual(diff.days, { from: [1, 2, 3, 4, 5, 6, 7], to: [1, 3, 5] }, 'sorted, no repeats');
  assert.deepEqual(diff.body, { changed: true }, 'the audit log says the body changed, not what it says');
  const [row] = await owner('select send_time::text t, title, body, late_minutes, days from research.reminder_schedules where id = $1', [f.snack]);
  assert.deepEqual(row, { t: '11:15:00', title: 'Snack now', body: 'Eat it.', late_minutes: 20, days: [1, 3, 5] });
  // Tuesday is not a day any more, so nothing for S on Tuesday at the new time.
  assert.equal((await claim('2026-10-13T15:20:00Z')).filter((r) => r.title === 'Snack now').length, 0);
  // Wednesday 11:20 is inside the new window.
  assert.equal((await claim('2026-10-14T15:20:00Z')).filter((r) => r.title === 'Snack now').length, 2);
  assert.deepEqual(await save(f.snack, { send_time: '11:15' }), {}, 'no change, no entry');
});

await test('schedule edits are checked, and the group and the kind cannot be changed', async () => {
  const f = await fresh();
  const save = (changes) => setup(researcher, 'select public.research_save_schedule($1, $2::jsonb)', [f.loop, JSON.stringify(changes)]);
  for (const [c, re] of [[{ send_time: '25:00' }, /send_time/], [{ send_time: '9:5' }, /send_time/], [{ send_time: 1030 }, /send_time/], [{ days: [] }, /days/], [{ days: [0] }, /days/],
                         [{ days: [8] }, /days/], [{ days: [1.5] }, /days/], [{ days: 'all' }, /days/], [{ late_minutes: 0 }, /late_minutes/], [{ late_minutes: 1441 }, /late_minutes/],
                         [{ title: '  ' }, /title/], [{ title: 'x'.repeat(81) }, /title/], [{ body: 'x'.repeat(201) }, /body/], [{ is_active: 'no' }, /is_active/],
                         [{ grp: 'S' }, /unknown_setting: grp/], [{ kind: 'survey' }, /unknown_setting: kind/], [{ study_id: f.st }, /unknown_setting/]]) {
    await assert.rejects(save(c), re, JSON.stringify(c));
  }
  await assert.rejects(setup(researcher, `select public.research_save_schedule('00000000-0000-0000-0000-000000000000', '{}')`), /unknown_schedule/);
  const [row] = await owner('select grp, kind, title from research.reminder_schedules where id = $1', [f.loop]);
  assert.deepEqual(row, { grp: 'L', kind: 'reminder', title: 'Loop' }, 'nothing moved');
});

await test('a schedule can be switched off and a new one added', async () => {
  const f = await fresh();
  await setup(researcher, `select public.research_save_schedule($1, '{"is_active": false}')`, [f.loop]);
  assert.deepEqual((await claim(T.tue1030)).map((r) => r.title).sort(), ['Snack', 'Snack'], 'group L has no reminder now');
  const id = (await setup(researcher, `select public.research_add_schedule($1, 'L', 'reminder', '10:30', ' Loop and plan ', 'Walk the hall once.') id`, [f.st]))[0].id;
  const [row] = await owner('select grp, kind, send_time::text t, title, days, late_minutes from research.reminder_schedules where id = $1', [id]);
  assert.deepEqual(row, { grp: 'L', kind: 'reminder', t: '10:30:00', title: 'Loop and plan', days: [1, 2, 3, 4, 5, 6, 7], late_minutes: 30 });
  const a = (await audit('schedule_added')).at(-1);
  assert.deepEqual([a.detail.kind, a.detail.group, a.detail.time], ['reminder', 'L', '10:30']);
  await assert.rejects(setup(researcher, `select public.research_add_schedule($1, 'Z', 'reminder', '10:30', 'x')`, [f.st]), /unknown_group/);
  await assert.rejects(setup(researcher, `select public.research_add_schedule($1, 'S', 'banana', '10:30', 'x')`, [f.st]), /bad_kind/);
  await assert.rejects(setup(researcher, `select public.research_add_schedule($1, 'S', 'reminder', '10:99', 'x')`, [f.st]), /send_time/);
  await assert.rejects(setup(researcher, `select public.research_add_schedule($1, 'S', 'reminder', '10:30', '   ')`, [f.st]));
});

await test('questions are added, replaced, retired and moved from the dashboard, and wording is never edited', async () => {
  const f = await fresh();
  const add = (text, format, extra = {}) => setup(researcher,
    `select public.research_add_question($1,$2,$3,$4::jsonb,$5::text[],$6,$7,$8::jsonb) id`,
    [f.st, text, format, JSON.stringify(extra.options ?? []), extra.grps ?? [], extra.position ?? 10, extra.replaces ?? null, extra.showIf ? JSON.stringify(extra.showIf) : null]).then((r) => r[0].id);
  const a = await add(' How was lunch? ', 'rating', { options: ['Bad', 'Good'], position: 10 });
  assert.equal((await owner('select text, options from research.questions where id = $1', [a]))[0].text, 'How was lunch?');
  assert.deepEqual((await audit('question_added')).at(-1).detail.format, 'rating');
  assert.equal(await submit(f.s1, '2026-10-13', { [a]: 4 }, T.tue2130), 'ok');
  assert.equal((await owner('select answers from research.question_usage where question_id = $1', [a]))[0].answers, 1, 'the page can say how many answers a question has');

  const b = await add('How was lunch today?', 'rating', { options: ['Bad', 'Good'], position: 10, replaces: a });
  const rows = await owner('select id, is_active, replaces from research.questions where study_id = $1 order by created_at', [f.st]);
  assert.deepEqual(rows.map((r) => r.is_active), [false, true]);
  assert.equal(rows[1].replaces, a);
  assert.equal((await audit('question_replaced')).at(-1).detail.replaces, a);
  assert.equal((await owner('select question_id from research.responses limit 1'))[0].question_id !== b, true, 'the earlier answer still points at the old wording');
  assert.equal((await pending(f.s2, T.wed2100)).questions[0].id, b);

  const c = await add('Follow up?', 'yes_no', { position: 20, showIf: { question: b, any_of: [5] } });
  assert.ok(c);
  await assert.rejects(add('Bad', 'yes_no', { position: 5, showIf: { question: b, any_of: [5] } }), /show_if_needs_an_earlier_question/);
  await assert.rejects(add('Bad', 'yes_no', { position: -1 }), /bad_value: position/);
  await assert.rejects(add('Bad', 'yes_no', { position: 1001 }), /bad_value: position/);
  await assert.rejects(add('   ', 'yes_no'));
  await assert.rejects(add('Bad', 'rating', { options: ['one'] }), /questions_rating_labels/);

  const set = (id, active, pos) => setup(researcher, 'select public.research_set_question($1,$2,$3) r', [id, active, pos]).then((r) => r[0].r);
  assert.equal(await set(c, false, null), true);
  assert.equal((await owner('select is_active from research.questions where id = $1', [c]))[0].is_active, false);
  assert.equal(await set(c, false, null), false, 'already retired: no change, no entry');
  assert.equal(await set(c, true, 30), true);
  assert.deepEqual((await owner('select is_active, position from research.questions where id = $1', [c]))[0], { is_active: true, position: 30 });
  await assert.rejects(set(c, null, 2000), /bad_value: position/);
  await assert.rejects(set('00000000-0000-0000-0000-000000000000', false, null), /unknown_question/);
  await assert.rejects(owner(`update research.questions set text = 'x' where id = $1`, [c]), /questions_are_never_edited/);
});

await test('every setup change leaves one audit entry that names who, and only an owner can read them', async () => {
  const rows = await owner(`select * from research.audit_log where action = 'setup_change'`);
  assert.ok(rows.length > 15);
  assert.ok(rows.every((r) => r.email === 'r@example.edu' && r.user_id === researcher), 'every entry names the researcher');
  assert.ok(rows.every((r) => ['study', 'code', 'schedule', 'schedule_added', 'question_added', 'question_replaced', 'question'].includes(r.detail.what)));
  assert.equal((await setup(researcher, `select * from research.audit_log where action = 'setup_change'`)).length, 0, 'a researcher cannot read the log');
  assert.ok((await setup(owner1, `select * from research.audit_log where action = 'setup_change'`)).length > 15);
  assert.equal((await call(researcher, `select public.research_log_action('setup_change') r`, [], AAL2))[0].r, false, 'a client cannot write one by hand');
});


// ── Changing a question never strands its follow-ups ────────────────────────

const replaceQ = (st, oldId, { text, format, options = [], grps = [], position, showIf = null }) => setup(researcher,
  `select public.research_add_question($1,$2,$3,$4::jsonb,$5::text[],$6,$7,$8::jsonb) id`,
  [st, text, format, JSON.stringify(options), grps, position, oldId, showIf ? JSON.stringify(showIf) : null]).then((r) => r[0].id);
const activeQs = (st) => owner(`select id, text, position, show_if, replaces, grps, options from research.questions where study_id = $1 and is_active order by position, created_at`, [st]);
const setQ = (id, active) => setup(researcher, 'select public.research_set_question($1,$2,null) r', [id, active]).then((r) => r[0].r);

await test('changing a question moves its follow-ups to the new one, atomically, and old answers stay put', async () => {
  const f = await seeded();
  const base = { [f.q.where]: 'Yes - in Usdan', [f.q.goals]: 3, [f.q.left]: '1/4 plate' };
  assert.equal(await submit(f.s1, '2026-10-13', { ...base, [f.q.snack]: true, [f.q.how]: '0-20 min before lunch' }, T.tue2130), 'ok');
  const before = await setupCount();

  const newSnack = await replaceQ(f.st, f.q.snack, { text: 'Did you eat the snack we gave you before lunch today?', format: 'yes_no', grps: ['S'], position: 20 });
  const now = await activeQs(f.st);
  const follow = now.find((x) => x.text === 'How long before lunch did you eat the snack?');
  assert.ok(follow, 'the follow-up is still asked');
  assert.notEqual(follow.id, f.q.how, 'as a new copy');
  assert.deepEqual(follow.show_if, { question: newSnack, any_of: [true] }, 'that follows the NEW question');
  assert.equal(follow.replaces, f.q.how);
  assert.deepEqual([follow.position, follow.grps, follow.options.length], [21, ['S'], 3], 'same place, group and choices');
  assert.equal(now.filter((x) => x.id === f.q.snack || x.id === f.q.how).length, 0, 'the old pair is retired');
  assert.equal(await setupCount(), before + 1, 'one entry for the one change');
  assert.equal((await audit('question_replaced')).at(-1).detail.follow_ups_moved, 1);

  // The earlier answers still belong to the old wording.
  const old = await owner(`select r.question_id from research.responses r join research.participants p on p.id = r.participant_id where p.user_id = $1`, [f.s1]);
  assert.ok(old.some((r) => r.question_id === f.q.snack) && old.some((r) => r.question_id === f.q.how));

  // And the survey works with the new pair: yes needs the follow-up, no forbids it.
  const go = (u, a) => submit(u, '2026-10-14', a, '2026-10-15T01:30:00Z');
  assert.equal(await go(f.s2, { ...base, [newSnack]: true }), 'invalid_answers', 'yes needs the follow-up');
  assert.equal(await go(f.s2, { ...base, [newSnack]: true, [follow.id]: '21-60 min before lunch' }), 'ok');
});

await test('a chain of follow-ups moves all the way down', async () => {
  const f = await fresh();
  const mk = (text, position, showIf) => setup(researcher, `select public.research_add_question($1,$2,'yes_no','[]'::jsonb,'{}',$3,null,$4::jsonb) id`,
    [f.st, text, position, showIf ? JSON.stringify(showIf) : null]).then((r) => r[0].id);
  const a = await mk('A', 10, null);
  const b = await mk('B', 20, { question: a, any_of: [true] });
  const c = await mk('C', 30, { question: b, any_of: [true] });
  const a2 = await replaceQ(f.st, a, { text: 'A, reworded', format: 'yes_no', position: 10 });
  const now = await activeQs(f.st);
  assert.deepEqual(now.map((x) => x.text), ['A, reworded', 'B', 'C']);
  const [na, nb, nc] = now;
  assert.equal(na.id, a2);
  assert.deepEqual(nb.show_if, { question: na.id, any_of: [true] });
  assert.deepEqual(nc.show_if, { question: nb.id, any_of: [true] }, 'the grandchild follows the new child');
  assert.equal((await audit('question_replaced')).at(-1).detail.follow_ups_moved, 2);
  assert.equal(await submit(f.s1, '2026-10-13', { [na.id]: true, [nb.id]: true, [nc.id]: false }, T.tue2130), 'ok');
  assert.ok([a, b, c].every((id) => id), 'the old three are retired, not deleted');
  assert.equal((await owner('select count(*)::int c from research.questions where study_id = $1 and not is_active', [f.st]))[0].c, 3);
});

await test('a change the follow-ups cannot survive is refused whole', async () => {
  const f = await seeded();
  const before = await setupCount();
  const rowsBefore = (await owner('select count(*)::int c from research.questions where study_id = $1', [f.st]))[0].c;
  await assert.rejects(replaceQ(f.st, f.q.snack, { text: 'How hungry were you?', format: 'rating', grps: ['S'], position: 20 }), /follow_ups_would_break/, 'a different kind of answer');
  await assert.rejects(replaceQ(f.st, f.q.snack, { text: 'Snack?', format: 'yes_no', grps: ['S'], position: 21 }), /show_if_needs_an_earlier_question/, 'a position the follow-up cannot follow');
  assert.equal(await setupCount(), before, 'nothing was recorded');
  assert.equal((await owner('select count(*)::int c from research.questions where study_id = $1', [f.st]))[0].c, rowsBefore, 'and no question was added');
  assert.equal((await owner('select is_active from research.questions where id = $1', [f.q.snack]))[0].is_active, true, 'the original is still in use');

  const d = await seeded({ dinner: true });
  const gate = await qAt(d.st, 50);
  const opts = ['Yes - in Usdan', 'Yes - in Sherman', 'No'];
  await assert.rejects(replaceQ(d.st, gate, { text: 'Dinner?', format: 'multiple_choice', options: ['Yes - in Usdan', 'Yes - in Sherman'], position: 50 }), /follow_ups_would_break/, 'the follow-ups name an answer that is gone');
  const gate2 = await replaceQ(d.st, gate, { text: 'Did you eat dinner in a dining hall?', format: 'multiple_choice', options: [...opts, 'Somewhere else'], position: 50 });
  const moved = (await activeQs(d.st)).filter((x) => x.show_if?.question === gate2);
  assert.equal(moved.length, 3, 'with every answer still offered, all three move');
  assert.ok(moved.every((x) => JSON.stringify(x.show_if.none_of) === '["No"]'));
});

await test('retiring a question retires its follow-ups, and a follow-up cannot return while its parent is retired', async () => {
  const f = await seeded();
  const before = await setupCount();
  assert.equal(await setQ(f.q.snack, false), true);
  const act = (await activeQs(f.st)).map((x) => x.id);
  assert.ok(!act.includes(f.q.snack) && !act.includes(f.q.how), 'the follow-up goes with it');
  assert.equal(await setupCount(), before + 1, 'one entry');
  assert.deepEqual((await audit('question')).at(-1).detail.also_retired, [f.q.how]);
  await assert.rejects(setQ(f.q.how, true), /parent_is_retired/);
  assert.equal(await setQ(f.q.snack, true), true);
  assert.equal(await setQ(f.q.how, true), true, 'now it can');
  assert.equal((await owner('select is_active from research.questions where id = $1', [f.q.how]))[0].is_active, true);
  // Nothing else was touched.
  assert.ok((await activeQs(f.st)).map((x) => x.id).includes(f.q.where));
});

await test('changing a follow-up itself keeps its parent and moves nothing', async () => {
  const f = await seeded();
  const how2 = await replaceQ(f.st, f.q.how, { text: 'How many minutes before lunch did you eat it?', format: 'multiple_choice', options: ['0-20', '21-60', '60+'], grps: ['S'], position: 21, showIf: { question: f.q.snack, any_of: [true] } });
  assert.equal((await audit('question_replaced')).at(-1).detail.follow_ups_moved, 0);
  const now = await activeQs(f.st);
  assert.deepEqual(now.find((x) => x.id === how2).show_if, { question: f.q.snack, any_of: [true] });
  assert.ok(now.some((x) => x.id === f.q.snack), 'the parent is untouched');
  assert.equal(now.filter((x) => x.id === f.q.how).length, 0);
});

await test('a column is set from the dashboard only by a researcher on a multi-factor session, and is audited', async () => {
  const f = await seeded();
  const call_ = (u, o) => setup(u, `select public.research_tag_question($1, 'lunch_hall', '[1, 2, 0]'::jsonb)`, [f.q.where], o);
  await assert.rejects(call_(researcher, { aal: 'aal1' }), /not_authorised/);
  await assert.rejects(call_(outsider, AAL2), /not_authorised/);
  await call_(researcher, AAL2);
  assert.equal((await meta(f.st)).lunch_hall.codes.join(), '1,2,0');
  const a = (await owner(`select detail from research.audit_log where action = 'setup_change' and detail ->> 'what' = 'question_columns' order by id desc limit 1`))[0].detail;
  assert.equal(a.to.key, 'lunch_hall');
  assert.equal(a.from.key, 'lunchYN');
});

console.log(`\nall ${n} research SQL tests passed`);
