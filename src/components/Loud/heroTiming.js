/* Pure helpers for the Loud Today hero, kept apart from the component so they can be tested in Node. */

/* Hours as a fraction of the day, the same scale mealHours uses. */
export const nowHours = (now) => now.getHours() + now.getMinutes() / 60;

export function countdown(start, now) {
  const mins = Math.max(0, Math.round((start - nowHours(now)) * 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/* The meal the hero is about: the first one that is not eaten and not over. Breakfast is left out for a student who
 * skips it, dinner when they are eating out. Null when the day is done. */
export function pickNextMeal(meals, now = new Date()) {
  const t = nowHours(now);
  return meals.find((m) => m.active && !m.confirmed && t < m.hours.end) ?? null;
}

