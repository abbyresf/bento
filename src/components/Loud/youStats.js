/* Numbers for the You tab (Loud pilot), from the last two weeks of meal history. Pure, so it runs in Node tests.
 *
 * Rows look like { meal_type, meal_date?, confirmed_at, items: [{ id, name, nutrition: { protein } }] }. A meal confirmed
 * twice on one day counts once (the latest row wins), the same rule the rest of the app uses. Protein follows Insights:
 * the listed nutrition of each item, one serving. */

const pad = (n) => String(n).padStart(2, '0');
export const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOf = (row) => row.meal_date ?? localDay(new Date(row.confirmed_at));

export function dedupe(rows) {
  const latest = new Map();
  for (const r of rows ?? []) {
    const key = `${dayOf(r)}|${r.meal_type}`;
    const prev = latest.get(key);
    if (!prev || Date.parse(r.confirmed_at) > Date.parse(prev.confirmed_at)) latest.set(key, r);
  }
  return [...latest.values()];
}

/* The last `n` days ending today, oldest first, as local date strings. */
export function lastDays(n, today = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    out.push(localDay(d));
  }
  return out;
}

export function weekSummary(rows, proteinTarget, today = new Date()) {
  const meals = dedupe(rows);
  const week = lastDays(7, today);
  const prior = new Set(lastDays(14, today).slice(0, 7));
  const thisWeek = meals.filter((m) => week.includes(dayOf(m)));

  const proteinByDay = week.map((d) => thisWeek
    .filter((m) => dayOf(m) === d)
    .reduce((sum, m) => sum + (m.items ?? []).reduce((s, it) => s + (it?.nutrition?.protein ?? 0), 0), 0));
  const daysWithMeals = proteinByDay.filter((p, i) => thisWeek.some((m) => dayOf(m) === week[i])).length;

  const seenBefore = new Set(meals.filter((m) => prior.has(dayOf(m))).flatMap((m) => (m.items ?? []).map((it) => it?.id)));
  const newDishes = new Set(thisWeek.flatMap((m) => (m.items ?? []).map((it) => it?.id)).filter((id) => id && !seenBefore.has(id)));

  return {
    days: week,
    mealsLogged: thisWeek.length,
    avgProtein: daysWithMeals ? Math.round(proteinByDay.reduce((a, b) => a + b, 0) / daysWithMeals) : 0,
    newDishes: newDishes.size,
    proteinByDay: proteinByDay.map(Math.round),
    // A day counts as on goal at 80% of the target, the same bar Insights uses.
    daysOnGoal: proteinTarget ? proteinByDay.filter((p) => p >= proteinTarget * 0.8).length : 0,
  };
}

/* Which of the last 14 days had at least one logged meal, oldest first. */
export function activeDays(rows, today = new Date()) {
  const logged = new Set(dedupe(rows).map(dayOf));
  return lastDays(14, today).map((d) => ({ day: d, logged: logged.has(d), today: d === localDay(today) }));
}
