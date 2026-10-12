import test from 'node:test';
import assert from 'node:assert/strict';
import { mealShares, activeMeals, dayTargetsFor, mealTargetsFor, replanMeals } from '../src/utils/dayPlan.js';
import { optimizeDay } from '../src/utils/mealOptimizer.js';
import { mockCampusMenu } from '../src/lib/mockCampusMenu.js';

const daily = { calories: 2200, macros: { protein: 130, carbs: 250, fat: 85 } };
const config = { locations: { north: { id: 'north', name: 'North Hall', shortName: 'North Hall' }, commons: { id: 'commons', name: 'The Commons', shortName: 'Commons' } } };
const R = { allergies: [], avoidIngredients: [] };
const menu = mockCampusMenu(config);
const plan = (shares) => optimizeDay(menu, daily, R, new Set(), shares, new Map());
const cal = (p, m, loc = 'north') => p[loc][m]?.totals.calories;
const fix = (c) => ({ calories: c, protein: c * 0.06, carbs: c * 0.11, fat: c * 0.04 });

test('the shares of the day', () => {
  assert.deepEqual(mealShares(), { breakfast: 0.25, lunch: 0.375, dinner: 0.375 });
  assert.deepEqual(mealShares({ skipBreakfast: true }), { breakfast: 0, lunch: 0.5, dinner: 0.5 });          // two larger meals, same day
  assert.deepEqual(mealShares({ dinnerOut: true }), { breakfast: 0.25, lunch: 0.375, dinner: 0 });           // nothing added to cover dinner
  assert.deepEqual(mealShares({ skipBreakfast: true, dinnerOut: true }), { breakfast: 0, lunch: 0.5, dinner: 0 });
  assert.deepEqual(activeMeals(mealShares({ skipBreakfast: true })), ['lunch', 'dinner']);
});

test('the day\'s targets shrink with the meals that are planned', () => {
  assert.equal(dayTargetsFor(daily, mealShares()).calories, 2200);
  assert.equal(dayTargetsFor(daily, mealShares({ skipBreakfast: true })).calories, 2200);                    // the same day in two meals
  assert.equal(dayTargetsFor(daily, mealShares({ dinnerOut: true })).calories, 1375);                        // 62.5% of the day
  assert.equal(dayTargetsFor(daily, mealShares({ dinnerOut: true })).macros.protein, 81);
});

test('without a decided meal every meal gets its normal share', () => {
  const t = mealTargetsFor(daily, mealShares());
  assert.deepEqual([t.breakfast.calories, t.lunch.calories, t.dinner.calories], [550, 825, 825]);
  const s = mealTargetsFor(daily, mealShares({ skipBreakfast: true }));
  assert.deepEqual([s.breakfast.calories, s.lunch.calories, s.dinner.calories], [0, 1100, 1100]);
});

test('a decided meal changes what the meals still to come are asked for', () => {
  const small = mealTargetsFor(daily, mealShares(), { lunch: fix(300) });
  const big = mealTargetsFor(daily, mealShares(), { lunch: fix(1300) });
  assert.ok(small.dinner.calories > 825, 'a small lunch leaves a bigger dinner');
  assert.ok(big.dinner.calories < 825, 'a big lunch leaves a lighter dinner');
  assert.equal(big.lunch.calories, 825);                                                                       // the decided meal keeps its own share
  // breakfast and lunch decided: dinner gets what is left
  assert.equal(mealTargetsFor(daily, mealShares(), { breakfast: fix(500), lunch: fix(900) }).dinner.calories, 800);
  // a huge lunch cannot starve dinner: it stays at 35% of normal
  assert.equal(mealTargetsFor(daily, mealShares(), { lunch: fix(2600) }).dinner.calories, Math.round(825 * 0.35));
  // a tiny lunch cannot inflate dinner past 180% of normal
  assert.ok(mealTargetsFor(daily, mealShares({ skipBreakfast: true }), { lunch: fix(50) }).dinner.calories <= Math.round(1100 * 1.8));
});

test('skipping breakfast plans no breakfast and two larger meals', () => {
  const base = plan(mealShares());
  const skip = plan(mealShares({ skipBreakfast: true }));
  assert.ok(base.north.breakfast && base.commons.breakfast);
  assert.equal(skip.north.breakfast, undefined);
  assert.equal(skip.commons.breakfast, undefined);
  assert.ok(cal(skip, 'lunch') > cal(base, 'lunch') + 150, 'lunch is larger');
  assert.ok(cal(skip, 'dinner') > cal(base, 'dinner') + 150, 'dinner is larger');
});

test('eating dinner out plans no dinner and leaves the other meals alone', () => {
  const base = plan(mealShares());
  const out = plan(mealShares({ dinnerOut: true }));
  assert.equal(out.north.dinner, undefined);
  assert.equal(cal(out, 'lunch'), cal(base, 'lunch'));
  assert.equal(cal(out, 'breakfast'), cal(base, 'breakfast'));
});

test('a hand-built lunch redoes the dinner around it, and leaves the lunch alone', () => {
  const shares = mealShares();
  const base = plan(shares);
  const run = (fixed) => replanMeals({ menu, daily, shares, fixed, restrictions: R, recentIds: new Set(), ratingsById: new Map(), prevPlan: base });
  const big = run({ lunch: fix(1300) });
  const small = run({ lunch: fix(300) });
  assert.ok(cal(big, 'dinner') < cal(base, 'dinner'), 'a big lunch gives a lighter dinner');
  assert.ok(cal(small, 'dinner') > cal(base, 'dinner'), 'a small lunch gives a bigger dinner');
  assert.equal(big.north.lunch, base.north.lunch);                                                             // the decided meal is the same object
  for (const loc of ['north', 'commons']) assert.ok(big[loc].dinner, `${loc} dinner is replanned`);
  // no repeats of a dish already on the day's other plates at that hall
  const lunchIds = new Set(big.north.lunch.items.map((i) => i.id));
  assert.ok(big.north.dinner.items.every((i) => !lunchIds.has(i.id)));
});

test('replanning with dinner out or breakfast skipped drops those meals', () => {
  const shares = mealShares({ skipBreakfast: true, dinnerOut: true });
  const base = plan(mealShares());
  const re = replanMeals({ menu, daily, shares, fixed: { lunch: fix(700) }, restrictions: R, recentIds: new Set(), ratingsById: new Map(), prevPlan: base });
  assert.equal(re.north.breakfast, undefined);
  assert.equal(re.north.dinner, undefined);
  assert.ok(re.north.lunch);
});
