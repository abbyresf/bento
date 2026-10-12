// Runs supabase/migrations/043_duo_foundation.sql against a real Postgres (pglite)
// with a stand-in for the Supabase pieces it relies on, then checks the rules.
//
//   npm i --no-save @electric-sql/pglite && node scripts/test-duo-sql.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const casesFile = process.env.CASES_FILE ?? new URL('../test/fixtures/restrictionCases.json', import.meta.url).pathname;

const dir = process.env.MIGRATIONS_DIR
  ? process.env.MIGRATIONS_DIR
  : new URL('../supabase/migrations/', import.meta.url).pathname;
const migrations = ['043_duo_foundation.sql', '044_duo_here_duration.sql', '045_duo_quests_and_colors.sql', '046_duo_widget.sql', '047_duo_daily_target.sql', '048_duo_rating_quests.sql', '049_duo_match_plate.sql', '050_duo_mystery_plate.sql', '051_duo_rainbow_plate.sql', '052_duo_more_quests.sql', '053_duo_mystery_swap_and_hints.sql']
  .map((f) => readFileSync(`${dir}/${f}`, 'utf8'));
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, university text, mascot_outfit text);
  create table public.meal_history (id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade, meal_date date, meal_type text, items jsonb not null default '[]', confirmed_at timestamptz default now());
  create table public.dietary_restrictions (user_id uuid primary key references auth.users(id) on delete cascade, vegetarian boolean default false, vegan boolean default false, gluten_free boolean default false, kosher boolean default false, allergies jsonb default '[]');
  create table public.item_ratings (user_id uuid references auth.users(id) on delete cascade, item_id text, item_name text, rating smallint, updated_at timestamptz default now(), primary key (user_id, item_id));
  create table public.dining_availability (date date primary key, any_open boolean);
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant execute on all functions in schema auth to authenticated;
`);
for (const m of migrations) { await db.exec(m); await db.exec(m); } // each is safe to run twice

const user = async (name, uni = 'brandeis', display = name) => {
  const { rows } = await db.query('insert into auth.users default values returning id');
  const id = rows[0].id;
  await db.query('insert into public.profiles (id, university, display_name) values ($1,$2,$3)', [id, uni, display]);
  return id;
};
const as = async (id) => {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id ?? '']);
};
const call = async (id, sql, params = []) => {
  await db.exec('reset role');
  await as(id);
  await db.exec('set role authenticated');
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
};
const fails = async (id, sql, params, code) => {
  await assert.rejects(call(id, sql, params), (e) => String(e.message).includes(code), `expected ${code}`);
};

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('ok', n, name); };

const maya = await user('Maya');
const sam = await user('Sam');
const rae = await user('Rae');
const tuftsKid = await user('Tess', 'tufts');

const redeem = async (u, c) => (await call(u, 'select * from public.duo_redeem($1)', [c]))[0];
const makePair = async (a, b) => {
  const [{ code }] = await call(a, 'select * from public.duo_create_invite()');
  const r = await redeem(b, code);
  assert.equal(r.status, 'ok');
};

await test('profile display_name check rejects empty and long', async () => {
  await assert.rejects(db.query(`update public.profiles set display_name = '   ' where id = $1`, [maya]));
  await assert.rejects(db.query(`update public.profiles set display_name = $2 where id = $1`, [maya, 'x'.repeat(21)]));
});

await test('clients cannot read the tables directly', async () => {
  for (const t of ['friendships', 'friend_invites', 'here_pings', 'duo_ping_log', 'duo_attempts']) {
    await assert.rejects(call(maya, `select * from public.${t}`), /permission denied/);
  }
});

await test('anon cannot call the functions', async () => {
  await db.exec('reset role'); await as(null); await db.exec('set role anon');
  await assert.rejects(db.query('select * from public.duo_friends()'), /permission denied/);
  await db.exec('reset role');
});

await test('signed out is refused', async () => {
  await fails(null, 'select * from public.duo_friends()', [], 'not_signed_in');
});

let code;
await test('invite code is 8 characters from the safe alphabet and only its hash is stored', async () => {
  [{ code }] = await call(maya, 'select * from public.duo_create_invite()');
  assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/);
  const { rows } = await db.query('select code_hash from public.friend_invites');
  assert.ok(rows.every((r) => r.code_hash !== code && r.code_hash.length === 64));
});

await test('six open invites are refused', async () => {
  const x = await user('Xan');
  for (let i = 0; i < 5; i++) await call(x, 'select * from public.duo_create_invite()');
  await fails(x, 'select * from public.duo_create_invite()', [], 'too_many_invites');
});

await test('own code, wrong code and other school all say invalid_code', async () => {
  assert.equal((await redeem(maya, code)).status, 'invalid_code');
  assert.equal((await redeem(sam, 'AAAAAAAA')).status, 'invalid_code');
  assert.equal((await redeem(tuftsKid, code)).status, 'invalid_code');
});

await test('redeeming makes an active friendship, the code works once, case and dashes ignored', async () => {
  const lower = code.slice(0, 4).toLowerCase() + '-' + code.slice(4).toLowerCase();
  const r = await redeem(sam, lower);
  assert.equal(r.status, 'ok'); assert.equal(r.display_name, 'Maya');
  assert.equal((await redeem(rae, code)).status, 'invalid_code');
  const mine = await call(maya, 'select * from public.duo_friends()');
  assert.deepEqual(mine.map((r) => r.display_name), ['Sam']);
  const theirs = await call(sam, 'select * from public.duo_friends()');
  assert.deepEqual(theirs.map((r) => r.display_name), ['Maya']);
});

await test('a stranger sees no friends', async () => {
  assert.deepEqual(await call(rae, 'select * from public.duo_friends()'), []);
});

await test('redeem attempts are limited', async () => {
  const g = await user('Guess');
  for (let i = 0; i < 10; i++) assert.equal((await redeem(g, 'BADBADBA')).status, 'invalid_code');
  assert.equal((await redeem(g, 'BADBADBA')).status, 'too_many_attempts');
  // even a real code is refused while the limit holds
  const [{ code: real }] = await call(maya, 'select * from public.duo_create_invite()');
  assert.equal((await redeem(g, real)).status, 'too_many_attempts');
});

await test('expired code is invalid', async () => {
  const [{ code: c }] = await call(rae, 'select * from public.duo_create_invite()');
  await db.query(`update public.friend_invites set expires_at = now() - interval '1 minute' where inviter = $1`, [rae]);
  assert.equal((await redeem(maya, c)).status, 'invalid_code');
});

await test('I\'m here reaches a friend, not a stranger, and expires', async () => {
  const reached = await call(maya, `select * from public.duo_ping_here('Usdan', 'lunch')`);
  assert.deepEqual(reached.map((r) => r.recipient), [sam]);
  const seen = await call(sam, 'select * from public.duo_friends()');
  assert.equal(seen[0].here_hall, 'Usdan');
  assert.equal(seen[0].here_meal, 'lunch');
  assert.deepEqual(await call(rae, 'select * from public.duo_friends()'), []);
  await db.query(`update public.here_pings set expires_at = now() - interval '1 minute'`);
  const later = await call(sam, 'select * from public.duo_friends()');
  assert.equal(later[0].here_hall, null);
});

await test('a tap lasts 60 minutes by default, and the sender can choose 15 to 120', async () => {
  const lenOf = async () => (await db.query(
    `select round(extract(epoch from (expires_at - created_at)) / 60)::int m from public.here_pings where sender = $1 and recipient = $2`, [maya, sam])).rows[0].m;
  await call(maya, `select * from public.duo_ping_here('Usdan', 'lunch')`);
  assert.equal(await lenOf(), 60);
  await call(maya, `select * from public.duo_ping_here('Usdan', 'lunch', null, 30)`);
  assert.equal(await lenOf(), 30);
  await call(maya, `select * from public.duo_ping_here('Usdan', 'lunch', null, 5)`);
  assert.equal(await lenOf(), 15);
  await call(maya, `select * from public.duo_ping_here('Usdan', 'lunch', null, 500)`);
  assert.equal(await lenOf(), 120);
  // the friend list says when it ends
  const seen = await call(sam, 'select * from public.duo_friends()');
  assert.ok(new Date(seen[0].here_until) > new Date());
  await call(maya, 'select public.duo_clear_here()');
  await db.query('delete from public.duo_ping_log where user_id = $1', [maya]); // this test used up the daily taps
});

await test('a new tap replaces the old one, and I\'ve left clears it', async () => {
  await call(maya, `select * from public.duo_ping_here('Sherman', 'dinner')`);
  await call(maya, `select * from public.duo_ping_here('Usdan', 'dinner')`);
  const seen = await call(sam, 'select * from public.duo_friends()');
  assert.equal(seen[0].here_hall, 'Usdan');
  assert.equal((await db.query('select count(*)::int c from public.here_pings')).rows[0].c, 1);
  await call(maya, 'select public.duo_clear_here()');
  assert.equal((await call(sam, 'select * from public.duo_friends()'))[0].here_hall, null);
});

await test('switching sharing off hides I\'m here for that friend only', async () => {
  await call(maya, 'select public.duo_set_sharing($1, false)', [sam]);
  const reached = await call(maya, `select * from public.duo_ping_here('Usdan', 'dinner')`);
  assert.deepEqual(reached, []);
  const mine = await call(maya, 'select * from public.duo_friends()');
  assert.equal(mine[0].i_share, false);
  await call(maya, 'select public.duo_set_sharing($1, true)', [sam]);
  assert.equal((await call(maya, `select * from public.duo_ping_here('Usdan', 'dinner')`)).length, 1);
});

await test('ping input is checked and the daily limit holds', async () => {
  await fails(maya, `select * from public.duo_ping_here('', 'lunch')`, [], 'invalid_hall');
  await fails(maya, `select * from public.duo_ping_here('Usdan', 'brunch')`, [], 'invalid_meal');
  const before = (await db.query(`select count(*)::int c from public.duo_ping_log where user_id = $1`, [maya])).rows[0].c;
  for (let i = before; i < 6; i++) await call(maya, `select * from public.duo_ping_here('Usdan', 'lunch')`);
  await fails(maya, `select * from public.duo_ping_here('Usdan', 'lunch')`, [], 'ping_limit');
});

const day = (offset) => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10).replace(/(\d{4})-(\d\d)-(\d\d)/, '$1-$2-$3');
};
const etDate = (offset) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + offset * 864e5));
  return parts;
};
const ate = (u, offset, type = 'lunch') =>
  db.query('insert into public.meal_history (user_id, meal_date, meal_type) values ($1,$2,$3)', [u, etDate(offset), type]);
const startFriendshipDaysAgo = (a, b, days) =>
  db.query(`update public.friendships set started_at = now() - ($3 || ' days')::interval where user_a = least($1::uuid,$2::uuid) and user_b = greatest($1::uuid,$2::uuid)`, [a, b, days]);
const streak = async (u, f) => (await call(u, 'select * from public.duo_streak($1)', [f]))[0];

const a = await user('A'); const b = await user('B');
await makePair(a, b);
await startFriendshipDaysAgo(a, b, 30);

await test('streak starts at 0, and today alone is not yet a streak miss', async () => {
  assert.equal((await streak(a, b)).current_streak, 0);
  await ate(a, 0);
  const s = await streak(a, b);
  assert.equal(s.current_streak, 0); assert.equal(s.me_today, true); assert.equal(s.friend_today, false);
});

await test('both confirming today counts, and the friend sees the same number', async () => {
  await ate(b, 0);
  assert.equal((await streak(a, b)).current_streak, 1);
  assert.equal((await streak(b, a)).current_streak, 1);
});

await test('consecutive days add up', async () => {
  await ate(a, -1); await ate(b, -1); await ate(a, -2); await ate(b, -2);
  assert.equal((await streak(a, b)).current_streak, 3);
});

await test('one missed open day is forgiven, two end the streak', async () => {
  await ate(a, -4); await ate(b, -4);          // -3 missed, one day
  assert.equal((await streak(a, b)).current_streak, 4);
  await ate(a, -7); await ate(b, -7);          // -5 and -6 missed, two days
  assert.equal((await streak(a, b)).current_streak, 4);
});

await test('a day the dining halls were closed is not a miss', async () => {
  await db.query('insert into public.dining_availability values ($1, false) on conflict do nothing', [etDate(-5)]);
  await db.query('insert into public.dining_availability values ($1, false) on conflict do nothing', [etDate(-6)]);
  assert.equal((await streak(a, b)).current_streak, 5);
});

await test('only one of them eating does not count', async () => {
  const c = await user('C'); const d = await user('D');
  await makePair(c, d); await startFriendshipDaysAgo(c, d, 10);
  await ate(c, 0); await ate(c, -1); await ate(c, -2);
  assert.equal((await streak(c, d)).current_streak, 0);
});

await test('days before the friendship started do not count', async () => {
  const e = await user('E'); const f = await user('F');
  await ate(e, -3); await ate(f, -3); await ate(e, -2); await ate(f, -2);
  await makePair(e, f);                        // started today
  await ate(e, 0); await ate(f, 0);
  assert.equal((await streak(e, f)).current_streak, 1);
});

await test('streak for a non-friend is refused', async () => {
  await fails(rae, 'select * from public.duo_streak($1)', [a], 'not_friends');
});

await test('week counts: days and dinners both confirmed', async () => {
  const g = await user('G'); const h = await user('H');
  await makePair(g, h); await startFriendshipDaysAgo(g, h, 30);
  const monday = etDate(0);
  // pick the Monday of this ET week
  const dow = new Date(monday + 'T12:00:00Z').getUTCDay();
  const back = (dow + 6) % 7;
  const weekStart = new Date(new Date(monday + 'T12:00:00Z').getTime() - back * 864e5).toISOString().slice(0, 10);
  const at = (i) => new Date(new Date(weekStart + 'T12:00:00Z').getTime() + i * 864e5).toISOString().slice(0, 10);
  for (const [u, i, t] of [[g,0,'dinner'],[h,0,'dinner'],[g,1,'lunch'],[h,1,'dinner'],[g,2,'dinner'],[h,2,'dinner']])
    await db.query('insert into public.meal_history (user_id, meal_date, meal_type) values ($1,$2,$3)', [u, at(i), t]);
  const [w] = await call(g, 'select * from public.duo_week($1, $2)', [h, weekStart]);
  assert.equal(w.days_both, 3); assert.equal(w.dinners_both, 2);
});

await test('ending a friendship is quiet and removes pings; the other side just sees no friend', async () => {
  await call(a, `select * from public.duo_ping_here('Usdan', 'lunch')`);
  await call(b, 'select public.duo_end($1)', [a]);
  assert.deepEqual(await call(a, 'select * from public.duo_friends()'), []);
  assert.deepEqual(await call(b, 'select * from public.duo_friends()'), []);
  assert.equal((await db.query('select count(*)::int c from public.here_pings where sender = $1', [a])).rows[0].c, 0);
  await fails(a, 'select * from public.duo_streak($1)', [b], 'not_friends');
});

await test('a new code restarts an ended friendship with a fresh streak start', async () => {
  await makePair(a, b);
  assert.equal((await call(a, 'select * from public.duo_friends()')).length, 1);
  assert.equal((await streak(a, b)).current_streak, 1); // today only, earlier days no longer count
});

await test('blocking ends it, and the blocked person cannot redeem the blocker\'s code', async () => {
  const [{ code: c }] = await call(b, 'select * from public.duo_create_invite()');
  await call(a, 'select public.duo_block($1)', [b]);
  assert.deepEqual(await call(b, 'select * from public.duo_friends()'), []);
  assert.equal((await redeem(a, c)).status, 'invalid_code');
  const [{ code: c2 }] = await call(a, 'select * from public.duo_create_invite()');
  assert.equal((await redeem(b, c2)).status, 'invalid_code');
});

await test('friend limit', async () => {
  const hub = await user('Hub');
  for (let i = 0; i < 20; i++) { const u = await user('U' + i); await makePair(hub, u); }
  const extra = await user('Extra');
  const [{ code: c }] = await call(hub, 'select * from public.duo_create_invite()');
  assert.equal((await redeem(extra, c)).status, 'friend_limit');
});

// ── Buddy quests, claims and colors (migration 045) ──────────────────────────
const monday = (offsetWeeks = 0) => {
  const base = new Date(etDate(0) + 'T12:00:00Z');
  const back = (base.getUTCDay() + 6) % 7;
  return new Date(base.getTime() - back * 864e5 + offsetWeeks * 7 * 864e5).toISOString().slice(0, 10);
};
const dayOf = (weekStart, i) => new Date(new Date(weekStart + 'T12:00:00Z').getTime() + i * 864e5).toISOString().slice(0, 10);
const eat = (u, date, type) => db.query('insert into public.meal_history (user_id, meal_date, meal_type) values ($1,$2,$3)', [u, date, type]);

await test('a color must look like an id, and buddies see each other\'s Bento', async () => {
  await assert.rejects(db.query(`update public.profiles set mascot_color = 'Red!' where id = $1`, [sam]));
  await db.query(`update public.profiles set mascot_color = 'cherry', mascot_outfit = 'scarf' where id = $1`, [sam]);
  const mine = await call(maya, 'select * from public.duo_friends()').catch(() => []);
  // maya was ended or blocked in earlier tests, so use a fresh pair for the check
  const p = await user('P'); const q = await user('Q');
  await makePair(p, q);
  await db.query(`update public.profiles set mascot_color = 'matcha', mascot_outfit = 'bowtie' where id = $1`, [q]);
  const seen = await call(p, 'select * from public.duo_friends()');
  assert.equal(seen[0].mascot_color, 'matcha');
  assert.equal(seen[0].mascot_outfit, 'bowtie');
  void mine;
});

const qa = await user('QA'); const qb = await user('QB');
await makePair(qa, qb); await startFriendshipDaysAgo(qa, qb, 60);
const thisWeek = monday(0);
const lastWeek = monday(-1);

await test('quest progress counts days and dinners both confirmed, capped at the target (2 days, 5 dinners)', async () => {
  for (let i = 0; i < 6; i++) { await eat(qa, dayOf(lastWeek, i), 'dinner'); await eat(qb, dayOf(lastWeek, i), 'dinner'); }
  const rows = await call(qa, 'select * from public.duo_quests($1, $2)', [qb, lastWeek]);
  const by = Object.fromEntries(rows.map((r) => [r.quest_id, r]));
  assert.equal(by.daily_duo.progress, 2);  assert.equal(by.daily_duo.target, 2);   // 6 shared days, capped at the target of 2
  assert.equal(by.week_dinners.progress, 5); assert.equal(by.week_dinners.target, 5);
  assert.equal(by.daily_duo.claimed, false);
});

const rate = (u, item) => db.query(`insert into public.item_ratings (user_id, item_id, item_name, rating) values ($1,$2,$2,4)`, [u, item]);
await test('rating quests: review duo is the smaller count, taste test is the shared dishes', async () => {
  const ra = await user('RA'); const rb = await user('RB');
  await makePair(ra, rb); await startFriendshipDaysAgo(ra, rb, 60);
  const row = async (id) => Object.fromEntries((await call(ra, 'select * from public.duo_quests($1, $2)', [rb, thisWeek])).map((r) => [r.quest_id, r]))[id];
  for (const i of ['a', 'b', 'c', 'd']) await rate(ra, i);        // one student alone cannot finish
  assert.equal((await row('review_duo')).progress, 0);
  assert.equal((await row('taste_test')).progress, 0);
  await rate(rb, 'a'); await rate(rb, 'x');
  assert.equal((await row('review_duo')).progress, 2);            // the smaller of 4 and 2
  assert.equal((await row('taste_test')).progress, 1);            // only "a" is on both lists
  await rate(rb, 'y');
  assert.equal((await row('review_duo')).progress, 3);
  assert.equal((await row('review_duo')).target, 3);
  // ratings from before the friendship do not count
  await db.query(`update public.item_ratings set updated_at = now() - interval '90 days' where user_id = $1`, [rb]);
  assert.equal((await row('review_duo')).progress, 0);
});

await test('match the plate: same meal, at least two dishes in common, counted as meals', async () => {
  const ma = await user('MA'); const mb = await user('MB');
  await makePair(ma, mb); await startFriendshipDaysAgo(ma, mb, 60);
  const row = async () => (await call(ma, 'select * from public.duo_quests($1, $2)', [mb, thisWeek])).find((r) => r.quest_id === 'match_plate');
  const meal = (u, date, type, ids) => db.query('insert into public.meal_history (user_id, meal_date, meal_type, items) values ($1,$2,$3,$4::jsonb)', [u, date, type, JSON.stringify(ids.map((id) => ({ id })))]);
  await meal(ma, thisWeek, 'lunch', ['rice', 'chicken', 'broccoli']);
  await meal(mb, thisWeek, 'lunch', ['rice', 'tofu']);                    // one dish in common
  assert.equal((await row()).progress, 0);
  await meal(mb, thisWeek, 'dinner', ['rice', 'chicken']);                // different meal, same dishes
  assert.equal((await row()).progress, 0);
  await db.query(`update public.meal_history set items = '[{"id":"rice"},{"id":"broccoli"}]'::jsonb where user_id = $1 and meal_type = 'lunch'`, [mb]);
  assert.equal((await row()).progress, 1);                                // rice and broccoli, same lunch
  assert.equal((await row()).target, 1);
});

await test('the buddy dietary filter gives the same answers as the app, and never returns settings', async () => {
  const viewer = await user('FV'); const buddy = await user('FB');
  await makePair(viewer, buddy); await startFriendshipDaysAgo(viewer, buddy, 30);
  const cases = JSON.parse(readFileSync(casesFile, 'utf8'));
  for (const c of cases) {
    const r = { vegetarian: false, vegan: false, gluten_free: false, kosher: false, allergies: [], ...c.row };
    await db.query('delete from public.dietary_restrictions where user_id = $1', [buddy]);
    await db.query('insert into public.dietary_restrictions (user_id, vegetarian, vegan, gluten_free, kosher, allergies) values ($1,$2,$3,$4,$5,$6::jsonb)',
      [buddy, r.vegetarian, r.vegan, r.gluten_free, r.kosher, JSON.stringify(r.allergies)]);
    const out = (await call(viewer, 'select public.duo_compatible_items($1, $2::jsonb) ids', [buddy, JSON.stringify([c.item])]))[0].ids;
    assert.equal(out.includes(c.item.id), c.pass, c.name);
  }
  // fail closed: no allergen list for a buddy with an allergy, no tags for a buddy who is vegetarian
  await db.query('delete from public.dietary_restrictions where user_id = $1', [buddy]);
  await db.query(`insert into public.dietary_restrictions (user_id, allergies) values ($1, '["__allergen:milk"]'::jsonb)`, [buddy]);
  const noList = (await call(viewer, 'select public.duo_compatible_items($1, $2::jsonb) ids', [buddy, JSON.stringify([{ id: 'n', tags: [] }])]))[0].ids;
  assert.deepEqual(noList, []);
  await db.query('delete from public.dietary_restrictions where user_id = $1', [buddy]);
  await db.query('insert into public.dietary_restrictions (user_id, vegetarian) values ($1, true)', [buddy]);
  const noTags = (await call(viewer, 'select public.duo_compatible_items($1, $2::jsonb) ids', [buddy, JSON.stringify([{ id: 'n', allergens: [] }])]))[0].ids;
  assert.deepEqual(noTags, []);
  // no saved row means no restrictions
  await db.query('delete from public.dietary_restrictions where user_id = $1', [buddy]);
  const none = (await call(viewer, 'select public.duo_compatible_items($1, $2::jsonb) ids', [buddy, JSON.stringify([{ id: 'n' }])]))[0].ids;
  assert.deepEqual(none, ['n']);
  // strangers and signed-out callers get nothing
  await fails(rae, 'select public.duo_compatible_items($1, $2::jsonb)', [buddy, '[]'], 'not_friends');
  await fails(null, 'select public.duo_compatible_items($1, $2::jsonb)', [buddy, '[]'], 'not_signed_in');
  await fails(viewer, 'select public.duo_compatible_items($1, $2::jsonb)', [buddy, '{}'], 'invalid_items');
});

await test('mystery plate: each picks a mystery dish for the other, each receiver must eat theirs', async () => {
  const pa = await user('MA2'); const pb = await user('MB2'); const stranger = await user('MS2');
  await makePair(pa, pb); await startFriendshipDaysAgo(pa, pb, 30);
  const row = async (as, other) => (await call(as, 'select * from public.duo_quests($1, $2)', [other, thisWeek])).find((r) => r.quest_id === 'mystery_plate');
  const pick = async (as, other, id) => (await call(as, 'select public.duo_plate_pick($1, $2, $3, $4) r', [other, id, 'Dish ' + id, 'North Hall']))[0].r;
  const hints = async (as) => await call(as, 'select * from public.duo_today_hints()');
  const claimOf = async (as, other, id) => (await call(as, 'select public.duo_claim($1, $2, $3) r', [other, id, thisWeek]))[0].r;
  const meal = (u, id) => db.query(`insert into public.meal_history (user_id, meal_date, meal_type, items) values ($1, current_date, 'dinner', $2::jsonb)`, [u, JSON.stringify([{ id }])]);
  assert.equal((await row(pa, pb)).target, 2);
  assert.equal((await row(pa, pb)).detail, null);
  assert.equal(await pick(stranger, pa, 'x'), 'not_friends');
  assert.equal(await pick(pa, pb, 'forB'), 'ok');                              // a picks for b
  assert.equal(await pick(pa, pb, 'again'), 'exists');                         // one pick each
  let r = await row(pa, pb); assert.equal(r.mine_detail, 'Dish forB'); assert.equal(r.detail, null);
  r = await row(pb, pa); assert.equal(r.detail, 'Dish forB'); assert.equal(r.detail_id, 'forB'); assert.equal(r.mine_detail, null);   // b sees the dish picked for them
  assert.deepEqual((await hints(pb)).map((h) => [h.quest_id, h.detail]), [['mystery_plate', 'Dish forB']]);   // the home screen line, for b
  assert.deepEqual(await hints(pa), []);                                       // not for the one who picked
  assert.equal(await pick(pb, pa, 'forA'), 'ok');                              // b picks for a
  assert.equal((await row(pa, pb)).detail, 'Dish forA');
  await meal(pb, 'forB');
  assert.equal((await row(pa, pb)).progress, 1);                               // b ate what a picked
  assert.deepEqual(await hints(pb), []);                                       // eaten, so the line goes
  assert.equal(await claimOf(pa, pb, 'mystery_plate'), 'not_met');
  await meal(pa, 'forA');
  assert.equal((await row(pa, pb)).progress, 2);
  assert.equal(await claimOf(pa, pb, 'mystery_plate'), 'ok');
  assert.equal(await claimOf(pa, pb, 'mystery_plate'), 'already');
  await db.query(`update public.duo_plate_picks set expires_at = now() - interval '1 hour' where quest_id = 'mystery_plate' and picked_by = $1`, [pa]);
  assert.equal(await pick(pa, pb, 'next'), 'ok');                              // once it expires a new one can be made
  await fails(pa, 'select * from public.duo_plate_picks', [], 'permission denied');
});

await test('today hints show a Rainbow plate color until you tap I did it', async () => {
  const ha = await user('HA'); const hb = await user('HB');
  await makePair(ha, hb); await startFriendshipDaysAgo(ha, hb, 30);
  const hints = async (as) => await call(as, 'select * from public.duo_today_hints()');
  assert.deepEqual(await hints(ha), []);
  assert.equal((await call(ha, 'select public.duo_rainbow_pick($1, $2) r', [hb, 'green']))[0].r, 'ok');
  assert.deepEqual((await hints(ha)).map((h) => [h.quest_id, h.friend_name, h.detail]), [['rainbow_plate', 'HB', 'Green']]);   // both of you see it
  assert.deepEqual((await hints(hb)).map((h) => [h.quest_id, h.friend_name, h.detail]), [['rainbow_plate', 'HA', 'Green']]);
  await db.query(`insert into public.meal_history (user_id, meal_date, meal_type, items) values ($1, current_date, 'lunch', '[]'::jsonb)`, [ha]);
  assert.equal((await call(ha, 'select public.duo_plate_ack($1) r', [hb]))[0].r, 'ok');
  assert.deepEqual(await hints(ha), []);                                        // a tapped, so a's line goes
  assert.equal((await hints(hb)).length, 1);                                    // b has not
  await fails(null, 'select * from public.duo_today_hints()', [], 'not_signed_in');
});

await test('rainbow plate: a color, honor system, a tap only after a confirmed meal, both taps then claim', async () => {
  const ra = await user('RA2'); const rb = await user('RB2'); const rs = await user('RS2');
  await makePair(ra, rb); await startFriendshipDaysAgo(ra, rb, 30);
  const row = async (as, other) => (await call(as, 'select * from public.duo_quests($1, $2)', [other, thisWeek])).find((r) => r.quest_id === 'rainbow_plate');
  const pick = async (as, other, color) => (await call(as, 'select public.duo_rainbow_pick($1, $2) r', [other, color]))[0].r;
  const ack = async (as, other) => (await call(as, 'select public.duo_plate_ack($1) r', [other]))[0].r;
  assert.equal((await row(ra, rb)).target, 2);
  assert.equal((await row(ra, rb)).detail, null);
  assert.equal(await ack(ra, rb), 'no_pick');
  assert.equal(await pick(rs, ra, 'green'), 'not_friends');
  assert.equal(await pick(ra, rb, 'pink'), 'invalid');                      // only five colors
  assert.equal(await pick(ra, rb, null), 'invalid');
  assert.equal(await pick(ra, rb, 'green'), 'ok');
  assert.equal(await pick(rb, ra, 'red'), 'exists');                        // one open pick per pair
  assert.equal((await row(rb, ra)).detail, 'Green');                        // the buddy sees the color
  assert.equal(await ack(ra, rb), 'no_meal');                               // honor system, but a confirmed meal is needed
  await db.query(`insert into public.meal_history (user_id, meal_date, meal_type, items) values ($1, current_date, 'lunch', '[]'::jsonb)`, [ra]);
  assert.equal(await ack(ra, rb), 'ok');
  assert.equal(await ack(ra, rb), 'already');                               // one tap each
  let r = await row(ra, rb); assert.equal(r.progress, 1); assert.equal(r.acked, true);
  r = await row(rb, ra); assert.equal(r.progress, 1); assert.equal(r.acked, false);   // the buddy has not tapped yet
  assert.equal((await call(ra, 'select public.duo_claim($1, $2, $3) r', [rb, 'rainbow_plate', thisWeek]))[0].r, 'not_met');
  await db.query(`insert into public.meal_history (user_id, meal_date, meal_type, items) values ($1, current_date, 'dinner', '[]'::jsonb)`, [rb]);
  assert.equal(await ack(rb, ra), 'ok');
  assert.equal((await row(ra, rb)).progress, 2);
  assert.equal((await call(ra, 'select public.duo_claim($1, $2, $3) r', [rb, 'rainbow_plate', thisWeek]))[0].r, 'ok');
  // once it expires a new color can be picked, and the taps belong to the old pick
  await db.query(`update public.duo_plate_picks set expires_at = now() - interval '1 hour' where quest_id = 'rainbow_plate' and user_a = least($1::uuid, $2::uuid) and user_b = greatest($1::uuid, $2::uuid)`, [ra, rb]);
  assert.equal(await pick(ra, rb, 'purple'), 'ok');
  assert.equal(await ack(ra, rb), 'ok');                                    // a new pick, a fresh tap (a meal is still on record)
  await fails(ra, 'select * from public.duo_plate_acks', [], 'permission denied');
});

const etHour = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(new Date()));
const rowOf = async (as, other, id) => (await call(as, 'select * from public.duo_quests($1, $2)', [other, thisWeek])).find((r) => r.quest_id === id);
const claimOf = async (as, other, id) => (await call(as, 'select public.duo_claim($1, $2, $3) r', [other, id, thisWeek]))[0].r;
const mealToday = (u, ids = []) => db.query(`insert into public.meal_history (user_id, meal_date, meal_type, items) values ($1, (now() at time zone 'America/New_York')::date, 'lunch', $2::jsonb)`, [u, JSON.stringify(ids.map((id) => ({ id })))]);
const pairUp = async (name) => { const a = await user(name + 'A'); const b = await user(name + 'B'); await makePair(a, b); await startFriendshipDaysAgo(a, b, 30); return [a, b]; };

await test('bento plate: honor system, a tap needs a confirmed meal, both taps then claim', async () => {
  const [a, b] = await pairUp('BP'); const s = await user('BPS');
  const pick = async (as, o) => (await call(as, 'select public.duo_bento_pick($1) r', [o]))[0].r;
  const ack = async (as, o) => (await call(as, `select public.duo_plate_ack($1, 'bento_plate') r`, [o]))[0].r;
  assert.equal((await rowOf(a, b, 'bento_plate')).target, 2);
  assert.equal(await ack(a, b), 'no_pick');
  assert.equal(await pick(s, a), 'not_friends');
  assert.equal(await pick(a, b), 'ok');
  assert.equal(await pick(b, a), 'exists');
  assert.equal((await rowOf(b, a, 'bento_plate')).detail, 'Bento plate');
  assert.equal(await ack(a, b), 'no_meal');
  await mealToday(a); await mealToday(b);
  assert.equal(await ack(a, b), 'ok');
  assert.equal(await ack(a, b), 'already');
  assert.equal((await rowOf(a, b, 'bento_plate')).progress, 1);
  assert.equal(await claimOf(a, b, 'bento_plate'), 'not_met');
  assert.equal(await ack(b, a), 'ok');
  assert.equal((await rowOf(a, b, 'bento_plate')).progress, 2);
  assert.equal(await claimOf(a, b, 'bento_plate'), 'ok');
});

await test('plate swap: each picks a dish for the other, each receiver must eat theirs', async () => {
  const [a, b] = await pairUp('PW');
  const pick = async (as, o, id) => (await call(as, 'select public.duo_swap_pick($1, $2, $3, $4) r', [o, id, 'Dish ' + id, 'North Hall']))[0].r;
  assert.equal(await pick(a, b, 'forB'), 'ok');
  assert.equal(await pick(a, b, 'again'), 'exists');                          // one pick each
  let r = await rowOf(a, b, 'plate_swap');
  assert.equal(r.mine_detail, 'Dish forB'); assert.equal(r.detail, null);     // a picked, b has not
  r = await rowOf(b, a, 'plate_swap');
  assert.equal(r.detail, 'Dish forB'); assert.equal(r.mine_detail, null);     // b sees the dish picked for them
  assert.equal(await pick(b, a, 'forA'), 'ok');
  await db.query(`insert into public.meal_history (user_id, meal_date, meal_type, items) values ($1, current_date, 'dinner', '[{"id":"forB"}]'::jsonb)`, [b]);
  assert.equal((await rowOf(a, b, 'plate_swap')).progress, 1);                // b ate what a picked
  await db.query(`insert into public.meal_history (user_id, meal_date, meal_type, items) values ($1, current_date, 'dinner', '[{"id":"forA"}]'::jsonb)`, [a]);
  assert.equal((await rowOf(a, b, 'plate_swap')).progress, 2);
  assert.equal(await claimOf(a, b, 'plate_swap'), 'ok');
});

await test('pick of the week: nominate a favorite from your ratings, each rates the other\'s pick', async () => {
  const [a, b] = await pairUp('PK');
  const nominate = async (as, o, id) => (await call(as, 'select public.duo_nominate($1, $2, $3) r', [o, id, 'Dish ' + id]))[0].r;
  const rate = (u, id, stars, ageHours = 0) => db.query(`insert into public.item_ratings (user_id, item_id, item_name, rating, updated_at) values ($1, $2, $2, $3, now() - ($4 || ' hours')::interval)
     on conflict (user_id, item_id) do update set rating = excluded.rating, updated_at = excluded.updated_at`, [u, id, stars, String(ageHours)]);
  assert.equal(await nominate(a, b, 'pa'), 'not_rated');                      // not in your ratings
  await rate(a, 'pa', 3);
  assert.equal(await nominate(a, b, 'pa'), 'not_rated');                      // 3 stars is not a favorite
  await rate(a, 'pa', 5); await rate(b, 'pb', 4);
  assert.equal(await nominate(a, b, 'pa'), 'ok');
  assert.equal(await nominate(a, b, 'pa'), 'exists');                         // one pick each per week
  assert.equal((await rowOf(b, a, 'pick_of_week')).detail, 'Dish pa');
  assert.equal((await rowOf(a, b, 'pick_of_week')).mine_detail, 'Dish pa');
  assert.equal(await nominate(b, a, 'pb'), 'ok');
  await rate(b, 'pa', 5, 48);                                                 // an old rating of a's pick does not count
  assert.equal((await rowOf(a, b, 'pick_of_week')).progress, 0);
  await rate(b, 'pa', 5);                                                     // rated again after the pick
  let r = await rowOf(b, a, 'pick_of_week'); assert.equal(r.progress, 1); assert.equal(r.acked, true);
  assert.equal((await rowOf(a, b, 'pick_of_week')).acked, false);
  assert.equal(await claimOf(a, b, 'pick_of_week'), 'not_met');
  await rate(a, 'pb', 4);
  assert.equal((await rowOf(a, b, 'pick_of_week')).progress, 2);
  assert.equal(await claimOf(a, b, 'pick_of_week'), 'ok');
});

await test('cover for me: nudge a buddy before 8pm, counts when they confirm after it', async () => {
  const [a, b] = await pairUp('CV'); const s = await user('CVS');
  const nudge = async (as, o) => (await call(as, 'select public.duo_nudge($1) r', [o]))[0].r;
  assert.equal(await nudge(s, a), 'not_friends');
  if (etHour() >= 20) { assert.equal(await nudge(a, b), 'too_late'); console.log('   (after 8pm Eastern: only the too_late rule was checked)'); return; }
  await mealToday(b);
  assert.equal(await nudge(a, b), 'already_confirmed');                       // nothing to nudge about
  await db.query('delete from public.meal_history where user_id = $1', [b]);
  assert.equal(await nudge(a, b), 'ok');
  assert.equal(await nudge(a, b), 'exists');
  let r = await rowOf(a, b, 'cover_me'); assert.equal(r.progress, 0); assert.equal(r.requested_by_me, true);
  assert.equal((await rowOf(b, a, 'cover_me')).requested_by_me, false);       // the nudged buddy gets no credit
  await mealToday(b);
  assert.equal((await rowOf(a, b, 'cover_me')).progress, 1);
  assert.equal((await rowOf(b, a, 'cover_me')).progress, 0);
  assert.equal(await claimOf(a, b, 'cover_me'), 'ok');
  // five nudges a day at most
  const sender = await user('CVN');
  for (let i = 0; i < 5; i++) { const f = await user('CVF' + i); await makePair(sender, f); await startFriendshipDaysAgo(sender, f, 30); assert.equal(await nudge(sender, f), 'ok'); }
  const sixth = await user('CVF6'); await makePair(sender, sixth); await startFriendshipDaysAgo(sender, sixth, 30);
  assert.equal(await nudge(sender, sixth), 'limit');
});

await test('twin day and outfit swap: both must agree, then each wears the right outfit for the day', async () => {
  const [a, b] = await pairUp('TW');
  await db.query(`update public.profiles set mascot_outfit = 'scarf' where id = $1`, [a]);
  await db.query(`update public.profiles set mascot_outfit = 'crown' where id = $1`, [b]);
  const ask = async (as, o, mode) => (await call(as, 'select public.duo_twin_request($1, $2) r', [o, mode]))[0].r;
  const accept = async (as, o, q) => (await call(as, 'select public.duo_plate_ack($1, $2) r', [o, q]))[0].r;
  const costumes = async (as) => await call(as, 'select * from public.duo_costumes()');
  assert.equal(await ask(a, b, 'party'), 'invalid');
  assert.equal(await ask(a, b, 'twin'), 'ok');
  assert.equal(await ask(b, a, 'twin'), 'exists');
  let r = await rowOf(b, a, 'twin_day'); assert.equal(r.progress, 1); assert.equal(r.requested_by_me, false); assert.equal(r.acked, false);
  assert.equal((await rowOf(a, b, 'twin_day')).requested_by_me, true);
  assert.equal(await accept(a, b, 'twin_day'), 'already');                    // the asker agreed by asking
  assert.deepEqual(await costumes(b), []);                                    // not both yet
  assert.equal(await accept(b, a, 'twin_day'), 'ok');
  assert.equal((await rowOf(a, b, 'twin_day')).progress, 2);
  const tb = await costumes(b); const ta = await costumes(a);
  assert.equal(tb[0].outfit, 'scarf'); assert.equal(ta[0].outfit, 'scarf');   // twins wear the asker's outfit
  assert.equal(tb[0].mode, 'twin'); assert.equal(tb[0].friend_id, a);
  assert.equal(await claimOf(a, b, 'twin_day'), 'ok');
  // swap: each wears the other's
  assert.equal(await ask(b, a, 'swap'), 'ok');
  assert.equal(await accept(a, b, 'outfit_swap'), 'ok');
  const sw = (await costumes(a)).find((c) => c.mode === 'swap'); const swb = (await costumes(b)).find((c) => c.mode === 'swap');
  assert.equal(sw.outfit, 'crown');                                           // a wears b's outfit
  assert.equal(swb.outfit, 'scarf');                                          // b wears a's outfit
  // an ended day gives no costume
  await db.query(`update public.duo_plate_picks set expires_at = now() - interval '1 minute' where quest_id in ('twin_day', 'outfit_swap')`);
  assert.deepEqual(await costumes(a), []);
  await fails(a, 'select * from public.duo_plate_picks', [], 'permission denied');
});

await test('claiming needs the quest to be done, works once, and counts as a perk', async () => {
  assert.equal((await call(qa, 'select public.duo_perks() p'))[0].p.replace?.(/[()]/g, '') ?? '0', '0');
  assert.equal((await call(qa, 'select public.duo_claim($1, $2, $3) r', [qb, 'daily_duo', lastWeek]))[0].r, 'ok');
  assert.equal((await call(qa, 'select public.duo_claim($1, $2, $3) r', [qb, 'daily_duo', lastWeek]))[0].r, 'already');
  const perks = await call(qa, 'select * from public.duo_perks()');
  assert.equal(perks[0].claims, 1);
  // a week with no shared days is not met
  assert.equal((await call(qa, 'select public.duo_claim($1, $2, $3) r', [qb, 'week_dinners', monday(-2)]))[0].r, 'not_met');
});

await test('only real weeks can be claimed', async () => {
  await fails(qa, 'select public.duo_claim($1, $2, $3)', [qb, 'daily_duo', dayOf(lastWeek, 2)], 'invalid_week');   // not a Monday
  await fails(qa, 'select public.duo_claim($1, $2, $3)', [qb, 'daily_duo', monday(1)], 'invalid_week');          // future
  await fails(qa, 'select public.duo_claim($1, $2, $3)', [qb, 'daily_duo', monday(-8)], 'invalid_week');         // too old
  await fails(qa, 'select public.duo_claim($1, $2, $3)', [qb, 'bogus', lastWeek], 'invalid_quest');
});

await test('a stranger cannot claim with someone they are not buddies with', async () => {
  await fails(rae, 'select public.duo_claim($1, $2, $3)', [qb, 'daily_duo', lastWeek], 'not_friends');
});

await test('the friend sees their own claim state separately', async () => {
  const rows = await call(qb, 'select * from public.duo_quests($1, $2)', [qa, lastWeek]);
  assert.equal(rows.find((r) => r.quest_id === 'daily_duo').claimed, false);
  assert.equal((await call(qb, 'select public.duo_claim($1, $2, $3) r', [qa, 'daily_duo', lastWeek]))[0].r, 'ok');
});

await test('a claim stays when the buddy deletes their account', async () => {
  await db.query('delete from auth.users where id = $1', [qb]);
  const perks = await call(qa, 'select * from public.duo_perks()');
  assert.equal(perks[0].claims, 1);
  const rows = (await db.query('select friend_id from public.duo_claims where user_id = $1', [qa])).rows;
  assert.equal(rows[0].friend_id, null);
});

// ── The widget token and list (migration 046) ────────────────────────────────
const hashOf = async (t) => (await db.query(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') h`, [t])).rows[0].h;
const asService = async (sql, params = []) => {
  await db.exec('reset role'); await db.exec('set role service_role');
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
};

const wa = await user('WA'); const wb = await user('WB'); const wc = await user('WC');
await makePair(wa, wb);
await db.query(`update public.profiles set mascot_color = 'sky', mascot_outfit = 'chefhat' where id = $1`, [wb]);

await test('a widget token is 64 hex characters and only its hash is stored', async () => {
  const [{ t }] = await call(wa, 'select public.duo_widget_token() t');
  assert.match(t, /^[0-9a-f]{64}$/);
  const { rows } = await db.query('select token_hash from public.duo_widget_tokens where user_id = $1', [wa]);
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, t);
  assert.equal(rows[0].token_hash, await hashOf(t));
});

await test('the widget list shows the buddies at a hall, with their Bento, for the token owner only', async () => {
  const [{ t }] = await call(wa, 'select public.duo_widget_token() t');
  await call(wb, `select * from public.duo_ping_here('Usdan', 'lunch', null, 30)`);
  const rows = await asService('select * from public.duo_widget_list($1)', [await hashOf(t)]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hall, 'Usdan'); assert.equal(rows[0].mascot_color, 'sky'); assert.equal(rows[0].mascot_outfit, 'chefhat');
  assert.ok(new Date(rows[0].here_until) > new Date());
  // wb has no pings aimed at wc, and wc has no buddies
  const [{ t: tc }] = await call(wc, 'select public.duo_widget_token() t');
  assert.deepEqual(await asService('select * from public.duo_widget_list($1)', [await hashOf(tc)]), []);
});

await test('an ended tap or an ended friendship is not listed', async () => {
  const [{ t }] = await call(wa, 'select public.duo_widget_token() t');
  await db.query(`update public.here_pings set expires_at = now() - interval '1 minute' where sender = $1`, [wb]);
  assert.deepEqual(await asService('select * from public.duo_widget_list($1)', [await hashOf(t)]), []);
  await call(wb, `select * from public.duo_ping_here('Usdan', 'lunch')`);
  assert.equal((await asService('select * from public.duo_widget_list($1)', [await hashOf(t)])).length, 1);
  await call(wb, 'select public.duo_end($1)', [wa]);
  assert.deepEqual(await asService('select * from public.duo_widget_list($1)', [await hashOf(t)]), []);
  await makePair(wa, wb);
});

await test('an unknown token is refused', async () => {
  await assert.rejects(asService('select * from public.duo_widget_list($1)', ['0'.repeat(64)]), /invalid_token/);
});

await test('only the server can call the list, not a signed-in student or anon', async () => {
  const [{ t }] = await call(wa, 'select public.duo_widget_token() t');
  await assert.rejects(call(wa, 'select * from public.duo_widget_list($1)', [await hashOf(t)]), /permission denied/);
  await db.exec('reset role'); await as(null); await db.exec('set role anon');
  await assert.rejects(db.query('select * from public.duo_widget_list($1)', [await hashOf(t)]), /permission denied/);
  await db.exec('reset role');
});

await test('signing out revokes the token, and nobody can revoke someone else\'s', async () => {
  const [{ t }] = await call(wa, 'select public.duo_widget_token() t');
  await call(wb, 'select public.duo_widget_revoke($1)', [t]);                   // not wb's token: no effect
  await asService('select * from public.duo_widget_list($1)', [await hashOf(t)]);   // still valid: this throws if it was revoked
  await call(wa, 'select public.duo_widget_revoke($1)', [t]);
  await assert.rejects(asService('select * from public.duo_widget_list($1)', [await hashOf(t)]), /invalid_token/);
});

await test('a student keeps at most five tokens, newest first', async () => {
  const mine = [];
  for (let i = 0; i < 7; i++) mine.push((await call(wa, 'select public.duo_widget_token() t'))[0].t);
  const { rows } = await db.query('select count(*)::int c from public.duo_widget_tokens where user_id = $1', [wa]);
  assert.equal(rows[0].c, 5);
  await assert.rejects(asService('select * from public.duo_widget_list($1)', [await hashOf(mine[0])]), /invalid_token/);
  await asService('select * from public.duo_widget_list($1)', [await hashOf(mine[6])]);
});

await test('deleting an account removes its widget tokens', async () => {
  await db.query('delete from auth.users where id = $1', [wa]);
  assert.equal((await db.query('select count(*)::int c from public.duo_widget_tokens where user_id = $1', [wa])).rows[0].c, 0);
});

await test('deleting an account removes its rows', async () => {
  await db.query('delete from auth.users where id = $1', [maya]);
  for (const t of ['friendships', 'here_pings', 'duo_ping_log', 'duo_attempts']) {
    const { rows } = await db.query(`select count(*)::int c from public.${t} where ${t === 'friendships' ? 'user_a = $1 or user_b = $1' : t === 'here_pings' ? 'sender = $1 or recipient = $1' : 'user_id = $1'}`, [maya]);
    assert.equal(rows[0].c, 0, t);
  }
  assert.equal((await db.query('select count(*)::int c from public.friend_invites where inviter = $1', [maya])).rows[0].c, 0);
});

console.log(`\nall ${n} passed`);
await db.close();
