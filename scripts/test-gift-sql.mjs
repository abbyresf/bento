// Runs supabase/migrations/065_event_gifts.sql against a real Postgres (pglite) with a stand-in for the Supabase pieces it
// relies on, then checks the rules.
//
//   npm i --no-save @electric-sql/pglite && node scripts/test-gift-sql.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const dir = process.env.MIGRATIONS_DIR ?? new URL('../supabase/migrations/', import.meta.url).pathname;
const migration = readFileSync(`${dir}/065_event_gifts.sql`, 'utf8');
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on all functions in schema auth to authenticated;
`);
await db.exec(migration);
await db.exec(migration); // safe to run twice

const user = async (createdAt) => (await db.query('insert into auth.users (created_at) values ($1) returning id', [createdAt])).rows[0].id;
const call = async (id, sql, params = [], role = 'authenticated') => {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id ?? '']);
  await db.exec(`set role ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
};
const status = async (u) => (await call(u, `select * from public.gift_status('halloween26')`))[0];
const claim = async (u, piece) => (await call(u, `select public.gift_claim('halloween26', $1) as r`, [piece]))[0].r;

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('ok', n, name); };

const inside = await user('2026-10-30T15:00:00-04:00');
const first = await user('2026-10-29T00:00:00-04:00');       // the first instant of the window
const lastMinute = await user('2026-11-03T23:59:00-05:00');  // 3 Nov, 11:59 pm, clocks already back
const before = await user('2026-10-28T23:59:00-04:00');
const after = await user('2026-11-04T00:00:00-05:00');        // the first instant after the window

await test('window is the 29 Oct start up to the end of 3 Nov, Eastern', async () => {
  assert.equal((await status(inside)).eligible, true);
  assert.equal((await status(first)).eligible, true);
  assert.equal((await status(lastMinute)).eligible, true);
  assert.equal((await status(before)).eligible, false);
  assert.equal((await status(after)).eligible, false);
});

await test('a student outside the window cannot claim', async () => {
  assert.equal(await claim(before, 'batwings'), 'not_eligible');
  assert.equal(await claim(after, 'pumpkin'), 'not_eligible');
  assert.equal((await call(before, 'select * from public.gift_pieces()')).length, 0);
});

await test('an unknown piece or event is refused', async () => {
  assert.equal(await claim(inside, 'crown'), 'invalid_piece');
  assert.equal(await claim(inside, null), 'invalid_piece');
  assert.equal((await call(inside, `select public.gift_claim('nope', 'batwings') as r`))[0].r, 'not_eligible');
  assert.equal((await call(inside, `select * from public.gift_status('nope')`))[0].eligible, false);
});

await test('one claim, and the choice is final', async () => {
  assert.equal(await claim(inside, 'pumpkin'), 'ok');
  assert.equal(await claim(inside, 'batwings'), 'already');
  assert.equal(await claim(inside, 'pumpkin'), 'already');
  const s = await status(inside);
  assert.equal(s.piece, 'pumpkin');
  assert.deepEqual((await call(inside, 'select * from public.gift_pieces()')).map((r) => r.piece), ['pumpkin']);
});

await test('a claim shows only to its owner', async () => {
  assert.equal((await call(first, 'select * from public.gift_pieces()')).length, 0);
  assert.equal((await status(first)).piece, null);
});

await test('the last-minute account can still claim', async () => {
  assert.equal(await claim(lastMinute, 'batwings'), 'ok');
});

await test('clients cannot read or write the tables directly', async () => {
  for (const t of ['gift_events', 'gift_claims']) {
    await assert.rejects(call(inside, `select * from public.${t}`), /permission denied/);
  }
  await assert.rejects(call(inside, `insert into public.gift_claims (user_id, event, piece) values ($1, 'halloween26', 'batwings')`, [first]), /permission denied/);
});

await test('anon cannot call the functions', async () => {
  await assert.rejects(call(null, `select * from public.gift_status('halloween26')`, [], 'anon'), /permission denied/);
  await assert.rejects(call(null, `select public.gift_claim('halloween26', 'pumpkin')`, [], 'anon'), /permission denied/);
});

await test('a signed-out call is refused', async () => {
  await assert.rejects(call(null, `select * from public.gift_status('halloween26')`), /not_signed_in/);
});

await test('deleting the account removes the claim', async () => {
  await db.query('delete from auth.users where id = $1', [inside]);
  assert.equal((await db.query('select count(*)::int as c from public.gift_claims where user_id = $1', [inside])).rows[0].c, 0);
});

console.log(`\n${n} checks passed`);
