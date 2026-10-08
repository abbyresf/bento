/* Duo: the pure parts of friends and "I'm here".
 *
 * Nothing here touches the network or the screen, so it can be tested. The
 * database side is supabase/migrations/043_duo_foundation.sql and the design is
 * SOCIAL_SPEC.md. Copy follows the Bento voice: short, active, no exclamation
 * marks that overpromise, nothing about amounts eaten. */

/* How long an "I'm here" lasts is chosen by the sender and stored with each tap
 * (here_until). The database accepts 15 to 120 minutes and defaults to 60. A server
 * that has not run migration 044 sends no here_until, and then a tap is treated as
 * the old fixed 90 minutes. */
export const DEFAULT_MINUTES = 60;
export const DURATIONS = [30, 60, 90];
export const LEGACY_PING_MINUTES = 90;
export const NAME_MAX = 20;

/* Same alphabet the database uses to make a code: no I, L or O. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

/* Typed or pasted codes come in with spaces, dashes and any case. */
export function normalizeCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidCode(raw) {
  const c = normalizeCode(raw);
  return c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch));
}

/* "ABCD2345" reads better as "ABCD 2345". */
export function formatCode(raw) {
  const c = normalizeCode(raw);
  return c.length > 4 ? `${c.slice(0, 4)} ${c.slice(4)}` : c;
}

export const JOIN_HOST = 'www.bentodining.com';

export function joinUrl(code) {
  return `https://${JOIN_HOST}/join/${normalizeCode(code)}`;
}

/* Pulls a code out of a link the app was opened with. Accepts the https link,
 * and a bare /join/CODE path from the web. Returns null for anything else, so a
 * sign-in redirect or a random link is never mistaken for an invite. */
export function parseJoinLink(url) {
  if (typeof url !== 'string') return null;
  let path;
  try {
    const u = new URL(url, `https://${JOIN_HOST}`);
    if (u.host !== JOIN_HOST && !url.startsWith('/')) return null;
    path = u.pathname;
  } catch {
    return null;
  }
  const m = /^\/join\/([A-Za-z0-9-]+)\/?$/.exec(path);
  if (!m) return null;
  return isValidCode(m[1]) ? normalizeCode(m[1]) : null;
}

/* The words that go in the message. The link does the work, so the text is short. */
export function inviteMessage(name, code) {
  const who = cleanName(name);
  const intro = who ? `${who} invited you to share meals on Bento.` : 'Share meals with me on Bento.';
  return `${intro} Open this link on your phone: ${joinUrl(code)}`;
}

export function cleanName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

/* Returns an error message, or null when the name is fine. */
export function nameProblem(raw) {
  const n = cleanName(raw);
  if (n.length === 0) return 'Add a name your buddies will know.';
  if (n.length > NAME_MAX) return `Keep it to ${NAME_MAX} characters.`;
  return null;
}

const toMs = (t) => (typeof t === 'number' ? t : Date.parse(t));

/* When a friend's tap ends, as milliseconds, or null. */
export function pingUntil(friend) {
  if (!friend) return null;
  if (friend.here_until) {
    const u = toMs(friend.here_until);
    return Number.isNaN(u) ? null : u;
  }
  if (friend.here_at) {
    const t = toMs(friend.here_at);
    return Number.isNaN(t) ? null : t + LEGACY_PING_MINUTES * 60000;
  }
  return null;
}

/* Minutes left until an end time, rounded up, never below zero. */
export function minutesLeft(until, now = Date.now()) {
  if (!until) return 0;
  const u = toMs(until);
  if (Number.isNaN(u)) return 0;
  return Math.max(0, Math.ceil((u - now) / 60000));
}

export function pingIsLive(until, now = Date.now()) {
  return minutesLeft(until, now) > 0;
}

export function durationLabel(minutes) {
  if (minutes === 60) return '1 hour';
  return `${minutes} minutes`;
}

const MEAL_WORD = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner' };

export function clock(at) {
  const d = new Date(typeof at === 'number' ? at : Date.parse(at));
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${m}`;
}

/* One line for a friend on the Today screen: "Usdan, lunch, 12:42". The time is
 * the time they tapped, so a row the phone has not refreshed is obvious. A friend
 * with no live ping gets null and is shown without a line. */
export function presenceLine(friend, now = Date.now()) {
  if (!friend?.here_hall || !pingIsLive(pingUntil(friend), now)) return null;
  const meal = MEAL_WORD[friend.here_meal];
  return [friend.here_hall, meal, clock(friend.here_at)].filter(Boolean).join(', ');
}

/* Friends who are at a hall now, newest first. */
export function hereNow(friends = [], now = Date.now()) {
  return friends
    .filter((f) => presenceLine(f, now))
    .sort((a, b) => Date.parse(b.here_at) - Date.parse(a.here_at));
}

/* Which meal "I'm here" should default to, by the hour. Same cut-offs as the
 * rest of the app (getCurrentMeal). */
export function mealForHour(hour) {
  if (hour < 10) return 'breakfast';
  if (hour < 14) return 'lunch';
  return 'dinner';
}

/* What the push says. Fixed wording, so a friend's name is the only free text. */
export function pushText(senderName, hall) {
  const who = cleanName(senderName) || 'A buddy';
  return `${who} is at ${String(hall ?? '').trim() || 'the dining hall'}`;
}

/* Turns a database error into something a student can act on. The codes are the
 * messages raised by the functions in migration 043. */
export function errorText(err) {
  const code = String(err?.message ?? err ?? '');
  const table = {
    not_signed_in: 'Sign in to use friends.',
    profile_incomplete: 'Add your name and school first.',
    too_many_invites: 'You have 5 open invites. Wait for one to expire or be used.',
    invalid_code: 'That code did not work. Check it and try again.',
    too_many_attempts: 'Too many tries. Wait an hour and try again.',
    friend_limit: 'One of you has reached the limit of 20 buddies.',
    ping_limit: 'You have used all 6 of today’s "I’m here" taps.',
    invalid_hall: 'Pick a dining hall.',
    invalid_meal: 'Pick a meal.',
    not_friends: 'You are not buddies with this person.',
  };
  for (const [k, v] of Object.entries(table)) if (code.includes(k)) return v;
  return 'Something went wrong. Try again.';
}

/* The statuses duo_redeem returns instead of raising. */
export function redeemText(status) {
  return {
    invalid_code: errorText('invalid_code'),
    too_many_attempts: errorText('too_many_attempts'),
    friend_limit: errorText('friend_limit'),
  }[status] ?? errorText('');
}

/* A missing function or table means migration 043 has not been run. Duo hides
 * itself then, the way the closet copes with a missing outfit column. */
export function isMissingFeature(err) {
  const code = String(err?.code ?? '');
  const msg = String(err?.message ?? '');
  return code === 'PGRST202' || code === '42883' || code === '42P01'
    || /could not find the function|schema cache/i.test(msg);
}
