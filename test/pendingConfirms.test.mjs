// node --test test/pendingConfirms.test.mjs
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// A stand-in for the browser's local storage.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const {
  readQueue, enqueue, updateEntry, attachExtras, removeEntry, bumpAttempts,
  pendingMealsFor, clearQueue, isOfflineError, withTimeout,
} = await import('../src/lib/pendingConfirms.js');

beforeEach(() => store.clear());

const lunch = { userId: 'u1', date: '2026-10-07', meal: 'lunch', items: [{ id: 'a', name: 'Rice' }], hall: 'Usdan', confirmedAt: '2026-10-07T16:05:00.000Z' };

test('a queued meal is read back with everything a normal confirmation sends', () => {
  enqueue(lunch);
  const [e] = readQueue();
  assert.equal(e.date, '2026-10-07');
  assert.equal(e.meal, 'lunch');
  assert.equal(e.hall, 'Usdan');
  assert.equal(e.confirmedAt, '2026-10-07T16:05:00.000Z');
  assert.deepEqual(e.items, [{ id: 'a', name: 'Rice' }]);
  assert.equal(e.attempts, 0);
});

test('confirming the same meal twice keeps one entry, the newer', () => {
  enqueue(lunch);
  enqueue({ ...lunch, items: [{ id: 'b', name: 'Beans' }] });
  assert.equal(readQueue().length, 1);
  assert.equal(readQueue()[0].items[0].id, 'b');
});

test('different meals and days are separate entries', () => {
  enqueue(lunch);
  enqueue({ ...lunch, meal: 'dinner' });
  enqueue({ ...lunch, date: '2026-10-08' });
  assert.equal(readQueue().length, 3);
});

test('pendingMealsFor reports only the meals on that date', () => {
  enqueue(lunch);
  enqueue({ ...lunch, meal: 'dinner', date: '2026-10-08' });
  assert.deepEqual(pendingMealsFor('2026-10-07'), { breakfast: false, lunch: true, dinner: false });
  assert.deepEqual(pendingMealsFor('2026-10-08'), { breakfast: false, lunch: false, dinner: true });
  assert.deepEqual(pendingMealsFor('2026-10-09'), { breakfast: false, lunch: false, dinner: false });
});

test('extras attach to the entry, and report false once it has been sent', () => {
  enqueue(lunch);
  assert.equal(attachExtras('2026-10-07', 'lunch', { ratings: [{ item: { id: 'a' }, rating: 4 }], consumed: { a: 0.5 } }), true);
  assert.deepEqual(readQueue()[0].consumed, { a: 0.5 });
  removeEntry('2026-10-07', 'lunch');
  assert.equal(attachExtras('2026-10-07', 'lunch', { ratings: [], consumed: { a: 1 } }), false);
});

test('removing the last entry empties the store, not leaves an empty list', () => {
  enqueue(lunch);
  removeEntry('2026-10-07', 'lunch');
  assert.equal(store.has('bento_pending_confirms_v1'), false);
  assert.deepEqual(readQueue(), []);
});

test('attempts count up and updateEntry patches in place', () => {
  enqueue(lunch);
  assert.equal(bumpAttempts('2026-10-07', 'lunch'), 1);
  assert.equal(bumpAttempts('2026-10-07', 'lunch'), 2);
  assert.equal(updateEntry('2026-10-07', 'lunch', { rowId: 'r1' }), true);
  assert.equal(readQueue()[0].rowId, 'r1');
  assert.equal(updateEntry('2026-10-07', 'dinner', { rowId: 'x' }), false);
});

test('damaged or foreign storage reads as an empty queue and never throws', () => {
  store.set('bento_pending_confirms_v1', '{not json');
  assert.deepEqual(readQueue(), []);
  store.set('bento_pending_confirms_v1', JSON.stringify([{ date: 5 }, null, { date: 'd', meal: 'brunch', items: [] }, lunch]));
  assert.equal(readQueue().length, 1);
});

test('the queue is capped so storage cannot grow without bound', () => {
  for (let i = 0; i < 70; i++) enqueue({ ...lunch, date: `2026-11-${String(i).padStart(2, '0')}` });
  assert.equal(readQueue().length, 60);
});

test('clearQueue removes everything', () => {
  enqueue(lunch);
  clearQueue();
  assert.deepEqual(readQueue(), []);
});

test('network failures are offline errors', () => {
  for (const message of ['TypeError: Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'The Internet connection appears to be offline.', 'The request timed out.']) {
    assert.equal(isOfflineError(new Error(message)), true, message);
  }
  assert.equal(isOfflineError({ offline: true }), true);
  assert.equal(isOfflineError({ code: 'offline' }), true);
});

test('a database refusal is not an offline error, so it is shown rather than queued', () => {
  assert.equal(isOfflineError(Object.assign(new Error('new row violates row-level security policy'), { code: '42501' })), false);
  assert.equal(isOfflineError(Object.assign(new Error('JWT expired'), { code: 'PGRST301' })), false);
  assert.equal(isOfflineError(Object.assign(new Error('Not signed in'), { code: 'signed-out' })), false);
  assert.equal(isOfflineError(Object.assign(new Error('The database did not return the saved row'), { code: 'no-row' })), false);
  assert.equal(isOfflineError(new Error('something unexpected')), false);
});

test('withTimeout passes a fast result through and turns a hang into an offline error', async () => {
  assert.equal(await withTimeout(Promise.resolve('ok'), 50), 'ok');
  await assert.rejects(withTimeout(new Promise(() => {}), 20), (e) => e.offline === true && e.code === 'offline');
});
