// Runs supabase/migrations/043_duo_foundation.sql against a real Postgres (pglite)
// with a stand-in for the Supabase pieces it relies on, then checks the rules.
//
//   npm i --no-save @electric-sql/pglite && node scripts/test-duo-sql.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const dir = process.env.MIGRATIONS_DIR
  ? process.env.MIGRATIONS_DIR
  : new URL('../supabase/migrations/', import.meta.url).pathname;
const migrations = ['043_duo_foundation.sql', '044_duo_here_duration.sql', '045_duo_quests_and_colors.sql', '046_duo_widget.sql']
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
    user_id uuid references auth.users(id) on delete cascade, meal_date date, meal_type text);
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

await test('quest progress counts days and dinners both confirmed, capped at the target', async () => {
  for (let i = 0; i < 6; i++) { await eat(qa, dayOf(lastWeek, i), 'dinner'); await eat(qb, dayOf(lastWeek, i), 'dinner'); }
  const rows = await call(qa, 'select * from public.duo_quests($1, $2)', [qb, lastWeek]);
  const by = Object.fromEntries(rows.map((r) => [r.quest_id, r]));
  assert.equal(by.daily_duo.progress, 4);  assert.equal(by.daily_duo.target, 4);
  assert.equal(by.week_dinners.progress, 5); assert.equal(by.week_dinners.target, 5);
  assert.equal(by.daily_duo.claimed, false);
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
