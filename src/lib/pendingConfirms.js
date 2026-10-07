/* Meals confirmed with no signal, waiting to be saved.
 *
 * A confirmation that cannot reach the database used to be refused, with an
 * error. That was honest but cost data: a student confirming in a dining hall
 * with poor signal had to remember to do it again later, and most would not, so
 * Pulse counted fewer meals than were eaten. Now the confirmation is kept on the
 * phone and sent as soon as there is signal.
 *
 * What is kept is exactly what a normal confirmation sends: the plate, the hall,
 * the date the meal was for, and the moment the student tapped Confirm, so a
 * late sync does not move the meal into a different day or week in Pulse. The
 * answers from the sheet that follows (ratings, and how much of each dish was
 * eaten) ride along, because they cannot be saved without a saved meal.
 *
 * Saving a meal is an upsert on (student, date, meal), so sending the same one
 * twice, for instance after a request that timed out but did arrive, is safe.
 *
 * Stored under a bento_ key so signing out clears it. This module touches only
 * local storage. The sending is in db.js (flushPendingConfirms). */
const KEY = 'bento_pending_confirms_v1';
const MAX_ENTRIES = 60;
const MEALS = ['breakfast', 'lunch', 'dinner'];

const valid = (e) => e && typeof e.date === 'string' && MEALS.includes(e.meal) && Array.isArray(e.items);

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter(valid) : [];
  } catch { return []; }
}

function save(list) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_ENTRIES)));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable: nothing more can be done */ }
}

const same = (a, b) => a.date === b.date && a.meal === b.meal;

export function readQueue() { return load(); }

/* entry: { userId, date, meal, items, hall, confirmedAt }. A second confirmation
 * for the same meal on the same day replaces the first, as it would in the
 * database. */
export function enqueue(entry) {
  const list = load().filter((e) => !same(e, entry));
  list.push({ attempts: 0, ...entry });
  save(list);
}

export function updateEntry(date, meal, patch) {
  const list = load();
  const e = list.find((x) => same(x, { date, meal }));
  if (!e) return false;
  Object.assign(e, patch);
  save(list);
  return true;
}

/* The ratings and plate-waste answers given on the sheet after confirming.
 * Returns false when the entry is already gone, meaning it was sent while the
 * sheet was open, and the caller must send these directly. */
export function attachExtras(date, meal, { ratings, consumed }) {
  return updateEntry(date, meal, { ratings: ratings ?? [], consumed: consumed ?? {} });
}

export function removeEntry(date, meal) {
  save(load().filter((e) => !same(e, { date, meal })));
}

export function bumpAttempts(date, meal) {
  const list = load();
  const e = list.find((x) => same(x, { date, meal }));
  if (!e) return 0;
  e.attempts = (e.attempts ?? 0) + 1;
  save(list);
  return e.attempts;
}

/* { breakfast, lunch, dinner } booleans: which meals on `date` are waiting. */
export function pendingMealsFor(date) {
  const out = { breakfast: false, lunch: false, dinner: false };
  for (const e of load()) if (e.date === date) out[e.meal] = true;
  return out;
}

export function clearQueue() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/* Did this failure come from having no usable connection, as opposed to the
 * database refusing the write? Only the first is worth queueing. A refusal
 * carries a database code (a five character SQLSTATE or PGRST...) and would
 * fail the same way again, so it is shown to the student instead. */
const OFFLINE_MESSAGE = /failed to fetch|load failed|networkerror|network request failed|network error|internet connection|offline|timed out|timeout|connection (lost|was lost|reset|refused)|econn/i;
export function isOfflineError(err) {
  if (err?.offline === true || err?.code === 'offline') return true;
  if (/^(\d{5}|PGRST\d+|signed-out|no-row)$/.test(String(err?.code ?? ''))) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return OFFLINE_MESSAGE.test(String(err?.message ?? ''));
}

/* Rejects with an offline error if `promise` has not settled in `ms`. A request
 * on a bad connection can hang for a minute, and the Confirm button should not
 * spin that long. If the request does arrive later, the upsert makes the queued
 * copy harmless. */
export function withTimeout(promise, ms = 12000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error('The connection timed out');
      e.offline = true; e.code = 'offline';
      reject(e);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
