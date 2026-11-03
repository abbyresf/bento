/* Ratings that could not be saved, waiting to be sent.
 *
 * rateItem used to return false when the write failed (no signal, a dropped request), and every caller ignored it: the stars
 * stayed lit, so the student believed the dish was rated, and the database never heard. Pulse, the community totals and the
 * Buddies quests that count ratings (Taste test, Review duo, Pick of the week) all missed it, with no message anywhere.
 *
 * Now a rating that fails is kept on the phone and sent when there is signal, the same way confirmed meals are. One entry
 * per dish, newest wins, because a rating is an upsert and only the last star count matters. A rating removed offline is
 * kept as `rating: null`. An entry that fails three times for a reason other than signal is dropped, so one bad row can
 * never block the rest.
 *
 * Stored under a bento_ key so signing out clears it: one student's ratings must never be sent as another's. This module
 * touches only the storage it is given. The sending is in db.js (flushPendingRatings). */
const KEY = 'bento_pending_ratings_v1';
const MAX_ENTRIES = 100;
const MAX_ATTEMPTS = 3;

const valid = (e) => e && typeof e.id === 'string' && e.id && typeof e.name === 'string'
  && (e.rating === null || (Number.isInteger(e.rating) && e.rating >= 1 && e.rating <= 5));

export function readRatingQueue(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter(valid) : [];
  } catch { return []; }
}

function write(list, storage) {
  try {
    if (list.length) storage.setItem(KEY, JSON.stringify(list.slice(-MAX_ENTRIES)));
    else storage.removeItem(KEY);
  } catch { /* storage unavailable: nothing more can be done */ }
}

/* Keep this rating, replacing any earlier one for the same dish. */
export function queueRating({ id, name, rating, diningHall = null }, storage = globalThis.localStorage, now = Date.now) {
  const entry = { id, name, rating, diningHall, at: now(), attempts: 0 };
  if (!valid(entry)) return;
  write([...readRatingQueue(storage).filter((e) => e.id !== id), entry], storage);
}

/* A rating that did reach the database makes any older queued one for that dish obsolete. */
export function dropQueuedRating(id, storage = globalThis.localStorage) {
  const list = readRatingQueue(storage);
  if (list.some((e) => e.id === id)) write(list.filter((e) => e.id !== id), storage);
}

/* Send what is waiting, oldest first. `send(entry)` resolves to true when the database has it. It stops at the first one that
 * fails, since the rest would fail too when there is no signal, and counts the attempt. Returns how many were saved. */
export async function flushRatingQueue(send, storage = globalThis.localStorage) {
  let list = readRatingQueue(storage);
  let saved = 0;
  while (list.length) {
    const [first, ...rest] = list;
    let ok = false;
    try { ok = await send(first); } catch { ok = false; }
    if (ok) { saved += 1; list = rest; write(list, storage); continue; }
    const attempts = (first.attempts ?? 0) + 1;
    list = attempts >= MAX_ATTEMPTS ? rest : [{ ...first, attempts }, ...rest];
    write(list, storage);
    break;
  }
  return saved;
}
