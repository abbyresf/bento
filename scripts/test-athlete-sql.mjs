// Runs supabase/migrations/064_athlete_mode.sql and 065_athlete_team.sql against a real Postgres (pglite) with a stand-in for the Supabase pieces it
// relies on, then checks the rules.
//
//   npm i --no-save @electric-sql/pglite && node scripts/test-athlete-sql.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const dir = process.env.MIGRATIONS_DIR ?? new URL('../supabase/migrations/', import.meta.url).pathname;
const migrations = ['064_athlete_mode.sql', '065_athlete_team.sql'].map((f) => readFileSync(`${dir}/${f}`, 'utf8'));
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on all functions in schema auth to authenticated;
  create table public.meal_history (id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade, meal_date date, meal_type text check (meal_type in ('breakfast', 'lunch', 'dinner')));
`);
for (const m of migrations) { await db.exec(m); await db.exec(m); } // each is safe to run twice

const user = async () => (await db.query('insert into auth.users default values returning id')).rows[0].id;
const call = async (id, sql, params = [], role = 'authenticated') => {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id ?? '']);
  await db.exec(`set role ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
};

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('ok', n, name); };

const ana = await user();
const ben = await user();

await test('an athlete writes and reads their own rows', async () => {
  await call(ana, `insert into public.athlete_profiles (user_id, athlete_mode, sport_group, season_phase) values ($1, true, 'team', 'in')`, [ana]);
  await call(ana, `insert into public.athlete_load_days (user_id, load_date, load) values ($1, '2026-10-29', 'heavy')`, [ana]);
  await call(ana, `insert into public.snacks (user_id, snack_date, slot, calories) values ($1, '2026-10-29', 'afternoon', 250)`, [ana]);
  assert.equal((await call(ana, 'select * from public.athlete_profiles')).length, 1);
  assert.equal((await call(ana, 'select * from public.athlete_load_days')).length, 1);
  assert.equal((await call(ana, 'select * from public.snacks')).length, 1);
});

await test('another student sees none of it and cannot write it', async () => {
  for (const t of ['athlete_profiles', 'athlete_load_days', 'snacks']) {
    assert.equal((await call(ben, `select * from public.${t}`)).length, 0, t);
  }
  await assert.rejects(call(ben, `insert into public.athlete_load_days (user_id, load_date, load) values ($1, '2026-10-30', 'rest')`, [ana]), /row-level security/);
  await assert.rejects(call(ben, `insert into public.snacks (user_id, snack_date, slot) values ($1, '2026-10-30', 'morning')`, [ana]), /row-level security/);
  assert.equal((await call(ben, `update public.athlete_profiles set athlete_mode = false where user_id = $1 returning *`, [ana])).length, 0);
  assert.equal((await call(ben, `delete from public.snacks where user_id = $1 returning *`, [ana])).length, 0);
});

await test('someone signed out cannot read any table', async () => {
  for (const t of ['athlete_profiles', 'athlete_load_days', 'snacks']) {
    await assert.rejects(call(null, `select * from public.${t}`, [], 'anon'), /permission denied/, t);
  }
});

await test('the checks refuse values outside the rules', async () => {
  const bad = [
    `insert into public.athlete_load_days (user_id, load_date, load) values ($1, '2026-11-01', 'max')`,
    `insert into public.snacks (user_id, snack_date, slot) values ($1, '2026-11-01', 'midnight')`,
    `insert into public.snacks (user_id, snack_date, slot, calories) values ($1, '2026-11-02', 'morning', -5)`,
    `update public.athlete_profiles set protein_g_per_kg = 0.8 where user_id = $1`,
    `update public.athlete_profiles set fat_share = 0.1 where user_id = $1`,
    `update public.athlete_profiles set sport_group = 'chess' where user_id = $1`,
    `update public.athlete_profiles set carbs_g_per_kg = '[1]' where user_id = $1`,
    `update public.athlete_profiles set team = 'Robert''); drop table x' where user_id = $1`,
  ];
  for (const sql of bad) await assert.rejects(call(ana, sql, [ana]), /violates check constraint/, sql);
});

await test('a team id is saved', async () => {
  await call(ana, `update public.athlete_profiles set team = 'womens-soccer' where user_id = $1`, [ana]);
  assert.equal((await call(ana, 'select team from public.athlete_profiles'))[0].team, 'womens-soccer');
});

await test('one snack per gap in the day, which an upsert replaces', async () => {
  await assert.rejects(call(ana, `insert into public.snacks (user_id, snack_date, slot) values ($1, '2026-10-29', 'afternoon')`, [ana]), /duplicate key/);
  await call(ana, `insert into public.snacks (user_id, snack_date, slot, calories) values ($1, '2026-10-29', 'afternoon', 400)
    on conflict (user_id, snack_date, slot) do update set calories = excluded.calories`, [ana]);
  assert.equal(Number((await call(ana, 'select calories from public.snacks'))[0].calories), 400);
});

await test('snacks never touch meal_history', async () => {
  assert.equal((await db.query('select count(*)::int c from public.meal_history')).rows[0].c, 0);
});

await test('deleting an account removes its rows', async () => {
  await db.query('delete from auth.users where id = $1', [ana]);
  for (const t of ['athlete_profiles', 'athlete_load_days', 'snacks']) {
    assert.equal((await db.query(`select count(*)::int c from public.${t} where user_id = $1`, [ana])).rows[0].c, 0, t);
  }
});

console.log(`\nall ${n} passed`);
await db.close();
