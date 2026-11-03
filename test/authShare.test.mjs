// node --test test/authShare.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserIdResolver } from '../src/lib/userIdResolver.js';
import { createCoalescer } from '../src/lib/coalesce.js';

const clock = () => { let t = 0; return { now: () => t, advance: (ms) => { t += ms; } }; };
const ok = (id) => ({ data: { user: { id } }, error: null });

test('callers that ask together share one getUser request', async () => {
  let calls = 0;
  const r = createUserIdResolver({ getUser: async () => { calls++; await null; return ok('u1'); }, getSession: async () => ({}), isOffline: () => false });
  const ids = await Promise.all(Array.from({ length: 12 }, () => r.get()));
  assert.deepEqual(new Set(ids), new Set(['u1']));
  assert.equal(calls, 1);
});

test('a good answer is reused until the time is up, then asked again', async () => {
  const c = clock(); let calls = 0;
  const r = createUserIdResolver({ getUser: async () => { calls++; return ok('u1'); }, getSession: async () => ({}), isOffline: () => false, ttlMs: 30000, now: c.now });
  await r.get(); await r.get(); c.advance(29999); await r.get();
  assert.equal(calls, 1);
  c.advance(2); await r.get();
  assert.equal(calls, 2);
});

test('a signed-out answer is never kept, so signing in is seen at once', async () => {
  let who = null; let calls = 0;
  const r = createUserIdResolver({ getUser: async () => { calls++; return who ? ok(who) : { data: { user: null }, error: { message: 'no' } }; }, getSession: async () => ({}), isOffline: () => false });
  assert.equal(await r.get(), undefined);
  who = 'u2';
  assert.equal(await r.get(), 'u2');
  assert.equal(calls, 2);
});

test('offline falls back to the stored session and keeps nothing, so the real answer is asked next time', async () => {
  let offline = true; let calls = 0;
  const r = createUserIdResolver({
    getUser: async () => { calls++; return offline ? { data: { user: null }, error: { name: 'offline' } } : ok('u3'); },
    getSession: async () => ({ data: { session: { user: { id: 'u3' } } } }),
    isOffline: (e) => e.name === 'offline',
  });
  assert.equal(await r.get(), 'u3');
  offline = false;
  assert.equal(await r.get(), 'u3');
  assert.equal(calls, 2);
});

test('after reset a new student is asked for, and a request that was out cannot store the old id', async () => {
  const releases = []; let who = 'old';
  const r = createUserIdResolver({ getUser: () => new Promise((res) => { const id = who; releases.push(() => res(ok(id))); }), getSession: async () => ({}), isOffline: () => false });
  const slow = r.get();
  r.reset();                       // signed out while the request was out
  who = 'new';
  const fresh = r.get();
  releases[0]();                   // the old request answers late
  assert.equal(await slow, 'old'); // the caller that asked before the reset still gets what was asked
  releases[1]();
  assert.equal(await fresh, 'new');
  assert.equal(await r.get(), 'new');   // and what is kept is the new student's, not the old
});

test('coalescer: callers inside the window share one read, and a read after it runs again', async () => {
  const c = clock(); let calls = 0;
  const s = createCoalescer(1000, c.now);
  const read = async () => { calls++; return { n: calls }; };
  const [a, b] = await Promise.all([s.shared(read), s.shared(read)]);
  assert.equal(a, b); assert.equal(calls, 1);
  c.advance(999); await s.shared(read); assert.equal(calls, 1);
  c.advance(2); const later = await s.shared(read);
  assert.equal(calls, 2); assert.equal(later.n, 2);
});

test('coalescer: forget drops the shared read, so a read after a write is fresh', async () => {
  const c = clock(); let calls = 0;
  const s = createCoalescer(1000, c.now);
  const read = async () => ++calls;
  await s.shared(read); s.forget(); await s.shared(read);
  assert.equal(calls, 2);
});

test('coalescer: a failed read is not shared with the next caller', async () => {
  const c = clock(); let calls = 0;
  const s = createCoalescer(1000, c.now);
  const read = async () => { calls++; if (calls === 1) throw new Error('boom'); return 'fine'; };
  await assert.rejects(s.shared(read), /boom/);
  assert.equal(await s.shared(read), 'fine');
});
