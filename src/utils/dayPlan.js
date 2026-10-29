/* How the day's targets are split across the meals Bento plans.
 *
 * Normally breakfast, lunch and dinner take 25%, 37.5% and 37.5% of the day. Two things change that:
 *   skip breakfast  a student who never eats breakfast at the dining hall. The breakfast share is spread over the
 *                   meals that remain, so lunch and dinner become two larger meals and the day's total does not change.
 *   dinner out      a student eating dinner somewhere else today. Dinner is left off the plan and nothing is added to
 *                   the other meals to cover it, so the plan is only for the meals eaten at the dining hall and the
 *                   day's targets shrink to match.
 *
 * Once a meal is decided (a plate the student built by hand, or one confirmed), the meals still to come are planned
 * around it: their targets are what is left of the day's, shared by their weights. A hand-built lunch of 1,200 calories
 * leaves a lighter dinner, and a small lunch leaves a bigger one. The result is kept within 35% to 180% of a meal's normal
 * size, so a very large or very small meal never produces a nonsense plan for the next one. */
import { MEAL_DISTRIBUTION } from './tdeeCalculator.js';
import { planMeal } from './platePlanner.js';

export const MEALS = ['breakfast', 'lunch', 'dinner'];
const MIN_FACTOR = 0.35;
const MAX_FACTOR = 1.8;

export function mealShares({ skipBreakfast = false, dinnerOut = false } = {}) {
  let s = { ...MEAL_DISTRIBUTION };
  if (skipBreakfast) {
    const rest = s.lunch + s.dinner;
    s = { breakfast: 0, lunch: s.lunch / rest, dinner: s.dinner / rest };
  }
  if (dinnerOut) s = { ...s, dinner: 0 };
  return s;
}

export const activeMeals = (shares) => MEALS.filter((m) => (shares?.[m] ?? 0) > 0);
const sumShares = (shares) => MEALS.reduce((n, m) => n + (shares?.[m] ?? 0), 0);

const FIELDS = ['calories', 'protein', 'carbs', 'fat'];
const dailyOf = (daily, f) => (f === 'calories' ? daily.calories : daily.macros[f]);

/* The targets for the day as the plan sees it: the daily numbers times the share of the day that is being planned. */
export function dayTargetsFor(daily, shares) {
  const k = sumShares(shares);
  return {
    ...daily,
    calories: Math.round(daily.calories * k),
    macros: Object.fromEntries(['protein', 'carbs', 'fat'].map((f) => [f, Math.round(daily.macros[f] * k)])),
  };
}

/* The target for each meal. `fixed` is { meal: { calories, protein, carbs, fat } } for meals already decided. A decided
 * meal keeps its normal share (its Bento plate stays as it was), an undecided meal gets what is left, shared by weight,
 * and a meal that is not planned gets zeros. */
export function mealTargetsFor(daily, shares, fixed = {}) {
  const active = activeMeals(shares);
  const anyFixed = active.some((a) => fixed[a]);
  const free = active.filter((m) => !fixed[m]);
  const dayShare = sumShares(shares);
  const freeShare = free.reduce((n, m) => n + shares[m], 0);
  const out = {};
  for (const m of MEALS) {
    out[m] = {};
    for (const f of FIELDS) {
      const normal = dailyOf(daily, f) * (shares[m] ?? 0);
      let v = normal;
      if (free.includes(m) && freeShare > 0 && anyFixed) {
        const left = Math.max(0, dailyOf(daily, f) * dayShare - active.reduce((n, a) => n + (fixed[a]?.[f] ?? 0), 0));
        v = Math.min(normal * MAX_FACTOR, Math.max(normal * MIN_FACTOR, left * (shares[m] / freeShare)));
      }
      out[m][f] = Math.round(v);
    }
  }
  return out;
}

/* Plans again the meals still to come, around the ones already decided. `prevPlan` is the plan from optimizeDay. Decided
 * meals are left exactly as they are. Returns a new plan. */
export function replanMeals({ menu, daily, shares, fixed, restrictions, recentIds, ratingsById, prevPlan }) {
  const targets = mealTargetsFor(daily, shares, fixed);
  const next = { ...prevPlan };
  for (const locId of Object.keys(menu.locations ?? {})) {
    const used = new Set(recentIds);
    const locPlan = { ...(prevPlan[locId] ?? {}) };
    for (const meal of MEALS) {
      const raw = menu.locations[locId]?.meals?.[meal];
      if (!(shares[meal] > 0) || !raw) { delete locPlan[meal]; continue; }
      // A decided meal stays exactly as it is.
      if (fixed[meal] && prevPlan[locId]?.[meal]) { prevPlan[locId][meal].items.forEach((i) => used.add(i.id)); continue; }
      const res = planMeal(raw, targets[meal], restrictions, used, meal, ratingsById);
      locPlan[meal] = res;
      res.items.forEach((i) => used.add(i.id));
    }
    next[locId] = locPlan;
  }
  return next;
}
