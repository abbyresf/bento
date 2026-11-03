/* The short line above the day's bento box. Playful on purpose and lowercase, like a note on a lunchbox, while every number
 * stays plain wording elsewhere on the screen. The variant is picked from the date, so the line is the same all day and
 * changes tomorrow. No em dashes or semicolons, as in the rest of Bento's copy. */
const NAMES = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner' };

const pick = (list, seed) => list[Math.abs(seed) % list.length];

/* meals: [{ id, active, confirmed }] in day order. `seed` is any stable number for the day. */
export function boxVoice({ meals = [], seed = 0 } = {}) {
  const active = meals.filter((m) => m.active);
  if (active.length === 0) return 'nothing planned. enjoy the day.';
  const done = active.filter((m) => m.confirmed);
  const next = active.find((m) => !m.confirmed);
  if (!next) {
    return pick(["box packed. lid's on.", 'all packed. nothing left to do.', "that's a full box."], seed);
  }
  const name = NAMES[next.id] ?? next.id;
  if (done.length === 0) {
    return pick([`the box is empty. ${name} first.`, `fresh box. start with ${name}.`, `${name} is up. pack it.`], seed);
  }
  const left = active.length - done.length;
  return pick([
    `${done.length} packed, ${left} to go. ${name} next.`,
    `box is filling up. ${name} next.`,
    `nice. ${left === 1 ? 'one more' : `${left} more`}, starting with ${name}.`,
  ], seed);
}
