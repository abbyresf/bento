// node --test test/pendingRatings.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readRatingQueue, queueRating, dropQueuedRating, flushRatingQueue } from '../src/lib/pendingRatings.js';

const fakeStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('one entry per dish, and the newest rating wins', () => {
  const s = fakeStorage();
  queueRating({ id: 'a', name: 'Pasta', rating: 3 }, s);
  queueRating({ id: 'b', name: 'Soup', rating: 5 }, s);
  queueRating({ id: 'a', name: 'Pasta', rating: 4 }, s);
  const q = readRatingQueue(s);
  assert.deepEqual(q.map((e) => [e.id, e.rating]), [['b', 5], ['a', 4]]);
});

test('a removed rating is kept as null, and bad entries are refused', () => {
  const s = fakeStorage();
  queueRating({ id: 'a', name: 'Pasta', rating: null }, s);
  queueRating({ id: 'b', name: 'Soup', rating: 9 }, s);       // not a star count
  queueRating({ id: '', name: 'x', rating: 3 }, s);           // no dish
  assert.deepEqual(readRatingQueue(s).map((e) => [e.id, e.rating]), [['a', null]]);
});

test('a rating that reached the database drops the older queued one for that dish', () => {
  const s = fakeStorage();
  queueRating({ id: 'a', name: 'Pasta', rating: 3 }, s);
  dropQueuedRating('a', s);
  assert.equal(readRatingQueue(s).length, 0);
});

test('flush sends oldest first, removes what was saved, and returns how many', async () => {
  const s = fakeStorage(); const sent = [];
  queueRating({ id: 'a', name: 'A', rating: 1 }, s, () => 1);
  queueRating({ id: 'b', name: 'B', rating: 2 }, s, () => 2);
  const n = await flushRatingQueue(async (e) => { sent.push(e.id); return true; }, s);
  assert.equal(n, 2); assert.deepEqual(sent, ['a', 'b']); assert.equal(readRatingQueue(s).length, 0);
});

test('flush stops at the first failure and keeps the rest', async () => {
  const s = fakeStorage(); const sent = [];
  queueRating({ id: 'a', name: 'A', rating: 1 }, s, () => 1);
  queueRating({ id: 'b', name: 'B', rating: 2 }, s, () => 2);
  const n = await flushRatingQueue(async (e) => { sent.push(e.id); return false; }, s);
  assert.equal(n, 0); assert.deepEqual(sent, ['a']);          // did not try b
  const q = readRatingQueue(s);
  assert.deepEqual(q.map((e) => [e.id, e.attempts]), [['a', 1], ['b', 0]]);
});

test('an entry that fails three times is dropped so it cannot block the rest', async () => {
  const s = fakeStorage();
  queueRating({ id: 'a', name: 'A', rating: 1 }, s, () => 1);
  queueRating({ id: 'b', name: 'B', rating: 2 }, s, () => 2);
  for (let i = 0; i < 3; i++) await flushRatingQueue(async (e) => e.id !== 'a', s);
  assert.deepEqual(readRatingQueue(s).map((e) => e.id), ['b']);
  assert.equal(await flushRatingQueue(async () => true, s), 1);
});

test('a send that throws counts as a failure, not a crash', async () => {
  const s = fakeStorage();
  queueRating({ id: 'a', name: 'A', rating: 1 }, s);
  assert.equal(await flushRatingQueue(async () => { throw new Error('offline'); }, s), 0);
  assert.equal(readRatingQueue(s)[0].attempts, 1);
});

test('unreadable or missing storage gives an empty queue', () => {
  assert.deepEqual(readRatingQueue({ getItem: () => '{not json' }), []);
  assert.deepEqual(readRatingQueue({ getItem: () => { throw new Error('denied'); } }), []);
});
