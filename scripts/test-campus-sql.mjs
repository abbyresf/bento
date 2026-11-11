// Runs supabase/migrations/072_campus_feed.sql and 073_campus_reposts.sql against a real Postgres (pglite), on stand-ins for the community tables
// it extends (015, 016, 025), then checks the rules.
//
//   node scripts/test-campus-sql.mjs        (needs @electric-sql/pglite: npm i --no-save @electric-sql/pglite)
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const dir = process.env.MIGRATIONS_DIR ?? new URL('../supabase/migrations/', import.meta.url).pathname;
const migration = readFileSync(`${dir}/072_campus_feed.sql`, 'utf8');
const reposts = readFileSync(`${dir}/073_campus_reposts.sql`, 'utf8');
const autoHide = readFileSync(`${dir}/074_campus_auto_hide.sql`, 'utf8');
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on all functions in schema auth to authenticated;

  -- Stand-ins for what 072 builds on.
  create table public.profiles (id uuid primary key references auth.users(id), university text);
  create table public.suggestions (
    id uuid primary key default gen_random_uuid(), content text not null,
    emphasize_count integer not null default 0, flag_count integer not null default 0,
    is_hidden boolean not null default false, created_at timestamptz not null default now(),
    university text not null default 'brandeis',
    constraint suggestions_content_length check (char_length(content) between 1 and 300));
  alter table public.suggestions enable row level security;
  create policy "read own university suggestions" on public.suggestions for select to authenticated
    using (is_hidden = false and university = (select coalesce(university, 'brandeis') from public.profiles where id = auth.uid()));
  create table public.suggestion_emphasizes (
    user_id uuid not null references auth.users(id), suggestion_id uuid not null references public.suggestions(id) on delete cascade,
    created_at timestamptz not null default now(), primary key (user_id, suggestion_id));
  create table public.suggestion_flags (
    user_id uuid not null references auth.users(id), suggestion_id uuid not null references public.suggestions(id) on delete cascade,
    created_at timestamptz not null default now(), primary key (user_id, suggestion_id));
`);
await db.exec(migration);
await db.exec(migration); // safe to run twice
await db.exec(reposts);
await db.exec(reposts);   // 073 too
await db.exec(autoHide);
await db.exec(autoHide);  // and 074
await db.exec('grant select on all tables in schema public to authenticated; grant select on public.profiles to authenticated;');

const user = async (uni) => {
  const id = (await db.query('insert into auth.users default values returning id')).rows[0].id;
  await db.query('insert into public.profiles (id, university) values ($1, $2)', [id, uni]);
  return id;
};
const post = async (uni, content = 'pesto is back') =>
  (await db.query('insert into public.suggestions (content, university) values ($1, $2) returning id', [content, uni])).rows[0].id;
const call = async (id, sql, params = []) => {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id ?? '']);
  await db.exec('set role authenticated');
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
};
const vote = async (u, p, v) => (await call(u, 'select * from public.cast_vote($1, $2::smallint)', [p, v]))[0];
const row = async (p) => (await db.query('select * from public.suggestions where id = $1', [p])).rows[0];
const fails = async (fn, msg) => { try { await fn(); } catch (e) { assert.match(String(e.message), msg); return; } assert.fail('expected an error'); };

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('ok', n, name); };

const a = await user('brandeis');
const b = await user('brandeis');
const t = await user('tufts');
const p1 = await post('brandeis');

await test('a vote is up, down or none, and switching moves it', async () => {
  assert.deepEqual(await vote(a, p1, 1), { my_vote: 1, up_count: 1, down_count: 0 });
  assert.deepEqual(await vote(a, p1, -1), { my_vote: -1, up_count: 0, down_count: 1 });
  assert.deepEqual(await vote(a, p1, 0), { my_vote: 0, up_count: 0, down_count: 0 });
  await vote(a, p1, 1); await vote(b, p1, 1);
  const r = await row(p1);
  assert.equal(r.emphasize_count, 2); assert.equal(r.downvote_count, 0);
});

await test('nobody can vote on another school or on a hidden post', async () => {
  await fails(() => vote(t, p1, 1), /not found/);
  const hidden = await post('brandeis'); await db.query('update public.suggestions set is_hidden = true where id = $1', [hidden]);
  await fails(() => vote(a, hidden, 1), /not found/);
  await fails(() => vote(a, p1, 2), /bad vote/);
  await fails(() => vote(null, p1, 1), /unauthorized/);
});

await test('a post hides itself at 6 downvotes, only when downvotes outnumber upvotes', async () => {
  const p = await post('brandeis', 'pizza is mid');
  const voters = [];
  for (let i = 0; i < 7; i++) voters.push(await user('brandeis'));
  for (let i = 0; i < 2; i++) await vote(voters[i], p, 1);
  for (let i = 2; i < 7; i++) await vote(voters[i], p, -1);          // 5 down, 2 up
  assert.equal((await row(p)).is_hidden, false);
  await vote(a, p, -1);                                              // 6 down, 2 up
  assert.equal((await row(p)).is_hidden, true);
  assert.equal((await call(a, 'select id from public.suggestions where id = $1', [p])).length, 0);
});

await test('replies are anonymous, stay in the school, and count on the post', async () => {
  const r1 = (await call(a, 'select public.submit_reply($1, $2) as id', [p1, 'save me a seat']))[0].id;
  await call(b, 'select public.submit_reply($1, $2) as id', [p1, 'the line is long']);
  assert.equal((await row(p1)).reply_count, 2);
  const seen = await call(b, 'select * from public.suggestion_replies where suggestion_id = $1', [p1]);
  assert.equal(seen.length, 2);
  assert.ok(!('user_id' in seen[0]), 'a reply stores no author');
  assert.equal((await call(t, 'select * from public.suggestion_replies where suggestion_id = $1', [p1])).length, 0);
  await fails(() => call(t, 'select public.submit_reply($1, $2)', [p1, 'hi']), /not found/);
  await fails(() => call(a, 'select public.submit_reply($1, $2)', [p1, 'x'.repeat(201)]), /length/);
  assert.ok(r1);
});

await test('three reports hide a reply and the count drops; one person counts once', async () => {
  const [r] = await call(a, 'select id from public.suggestion_replies where suggestion_id = $1 order by created_at limit 1', [p1]);
  await call(b, 'select public.flag_reply($1)', [r.id]);
  await call(b, 'select public.flag_reply($1)', [r.id]);
  assert.equal((await db.query('select flag_count from public.suggestion_replies where id = $1', [r.id])).rows[0].flag_count, 1);
  await call(t, 'select public.flag_reply($1)', [r.id]);
  await call(a, 'select public.flag_reply($1)', [r.id]);
  assert.equal((await db.query('select is_hidden from public.suggestion_replies where id = $1', [r.id])).rows[0].is_hidden, true);
  assert.equal((await row(p1)).reply_count, 1);
});

await test('nobody can write counts or votes directly', async () => {
  await fails(() => call(a, 'update public.suggestions set emphasize_count = 999 where id = $1', [p1]), /permission denied/);
  await fails(() => call(a, 'insert into public.suggestion_replies (suggestion_id, content, university) values ($1, $2, $3)', [p1, 'hi', 'brandeis']), /permission denied|row-level security/);
});

await test('a repost counts once per person, undoes on a second tap, and stays in the school', async () => {
  const p = await post('brandeis', 'repost me');
  const r1 = (await call(a, 'select * from public.toggle_repost($1)', [p]))[0];
  assert.deepEqual(r1, { reposted: true, repost_count: 1 });
  await call(b, 'select * from public.toggle_repost($1)', [p]);
  assert.equal((await row(p)).repost_count, 2);
  const r2 = (await call(a, 'select * from public.toggle_repost($1)', [p]))[0];
  assert.deepEqual(r2, { reposted: false, repost_count: 1 });
  await fails(() => call(t, 'select * from public.toggle_repost($1)', [p]), /not found/);
  // Nobody can read who reposted, only their own row.
  assert.equal((await call(a, 'select * from public.suggestion_reposts where suggestion_id = $1', [p])).length, 0);
  assert.equal((await call(b, 'select * from public.suggestion_reposts where suggestion_id = $1', [p])).length, 1);
});

await test('a quote is a new anonymous post in the same school that points at the original', async () => {
  const orig = await post('brandeis', 'pesto is back');
  const id = (await call(a, 'select public.submit_quote($1, $2) as id', [orig, 'confirmed, it is elite']))[0].id;
  const q = await row(id);
  assert.equal(q.quote_of, orig); assert.equal(q.university, 'brandeis'); assert.equal(q.content, 'confirmed, it is elite');
  assert.ok(!('user_id' in q), 'a quote stores no author');
  await fails(() => call(t, 'select public.submit_quote($1, $2)', [orig, 'hi']), /not found/);
  await fails(() => call(a, 'select public.submit_quote($1, $2)', [orig, '']), /check|length/);
  await db.query('delete from public.suggestions where id = $1', [orig]);
  assert.equal((await row(id)).quote_of, null, 'the quote stays when the original goes');
});

await test('three reports from the same school hide a post, and a reviewed post stays up', async () => {
  const p = await post('brandeis', 'rude post');
  const c = await user('brandeis');
  const flag = (u, id) => call(u, 'select public.flag_suggestion($1) as n', [id]);
  await flag(a, p); await flag(a, p);
  assert.equal((await row(p)).flag_count, 1, 'one person counts once');
  await fails(() => flag(t, p), /not found/);
  await flag(b, p);
  assert.equal((await row(p)).is_hidden, false, 'two reports are not enough');
  await flag(c, p);
  assert.equal((await row(p)).is_hidden, true, 'the third report hides it');
  await fails(() => flag(a, p), /not found/);
  // Restored by hand: later reports leave it up.
  const ok = await post('brandeis', 'fine post');
  await db.query('update public.suggestions set reviewed_ok = true where id = $1', [ok]);
  const d = await user('brandeis');
  for (const u of [a, b, c, d]) await flag(u, ok);
  assert.equal((await row(ok)).is_hidden, false);
});

console.log(`${n} checks passed`);
