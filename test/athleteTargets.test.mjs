import test from 'node:test';
import assert from 'node:assert/strict';
import { athleteDailyTargets, athleteSettings, wouldBreakFloor, RANGES, LOADS } from '../src/utils/athleteTargets.js';

test('the defaults are the middle of each published range', () => {
  const s = athleteSettings();
  assert.deepEqual(s.carbs, { rest: 4, light: 6, heavy: 8, double: 10 });
  assert.equal(s.protein, 1.6);
  assert.equal(s.fatShare, 0.275);
});

test('a 70 kg athlete on a light day', () => {
  const t = athleteDailyTargets({ weightKg: 70, bmr: 1600, load: 'light' });
  assert.equal(t.macros.protein, 112);                          // 1.6 g/kg
  assert.equal(t.macros.carbs, 420);                            // 6 g/kg
  assert.equal(t.calories, Math.round((4 * 112 + 4 * 420) / 0.725));
  // fat is 27.5% of the day's energy
  assert.ok(Math.abs((t.macros.fat * 9) / t.calories - 0.275) < 0.005);
});

test('harder days get more carbohydrate and more energy, protein stays the same', () => {
  const days = LOADS.map((load) => athleteDailyTargets({ weightKg: 70, bmr: 1600, load }));
  for (let i = 1; i < days.length; i++) {
    assert.ok(days[i].macros.carbs > days[i - 1].macros.carbs);
    assert.ok(days[i].calories > days[i - 1].calories);
    assert.equal(days[i].macros.protein, days[0].macros.protein);
  }
});

test('the athlete moves a number, and it stays inside the range', () => {
  const custom = { protein: 2.0, carbs: { heavy: 9 }, fatShare: 0.2 };
  const t = athleteDailyTargets({ weightKg: 80, load: 'heavy', custom });
  assert.equal(t.macros.protein, 160);
  assert.equal(t.macros.carbs, 720);
  const out = athleteSettings({ protein: 5, carbs: { rest: 0 }, fatShare: 0.9 });
  assert.equal(out.protein, RANGES.protein[1]);
  assert.equal(out.carbs.rest, RANGES.carbs.rest[0]);
  assert.equal(out.fatShare, RANGES.fatShare[1]);
});

test('a value that is not a number is ignored', () => {
  assert.deepEqual(athleteSettings({ protein: 'lots', carbs: { light: NaN } }), athleteSettings());
});

test('no day goes under resting needs: carbohydrate is raised to meet them', () => {
  const low = { protein: 1.2, carbs: { rest: 3 }, fatShare: 0.2 };
  const t = athleteDailyTargets({ weightKg: 45, bmr: 1300, load: 'rest', custom: low });
  assert.equal(t.calories, 1300);
  assert.ok(t.macros.carbs > 3 * 45);
  assert.equal(t.macros.protein, 54);
});

test('a setting that would go under the floor is caught', () => {
  assert.equal(wouldBreakFloor({ weightKg: 45, bmr: 1300, custom: { protein: 1.2, carbs: { rest: 3 }, fatShare: 0.2 } }), true);
  assert.equal(wouldBreakFloor({ weightKg: 70, bmr: 1600, custom: {} }), false);
  assert.equal(wouldBreakFloor({ weightKg: 70, bmr: null, custom: {} }), false);
});

test('no body weight means no athlete targets, so the normal ones stay', () => {
  assert.equal(athleteDailyTargets({ weightKg: 0 }), null);
  assert.equal(athleteDailyTargets({ weightKg: undefined }), null);
});

test('an unknown load falls back to light', () => {
  assert.deepEqual(athleteDailyTargets({ weightKg: 70, load: 'huge' }), athleteDailyTargets({ weightKg: 70, load: 'light' }));
});

test('track and cross country use the athletics protein range, other sports the general one', async () => {
  const { rangesFor } = await import('../src/utils/athleteTargets.js');
  assert.deepEqual(rangesFor('track').protein, [1.3, 1.7]);
  assert.deepEqual(rangesFor('cross-country').protein, [1.3, 1.7]);
  assert.deepEqual(rangesFor('soccer').protein, [1.2, 2.0]);
  assert.deepEqual(rangesFor(null).protein, [1.2, 2.0]);
  assert.equal(athleteSettings({}, 'track').protein, 1.5);
  assert.equal(athleteSettings({ protein: 2.0 }, 'track').protein, 1.7);      // kept inside the sport's range
  assert.equal(athleteDailyTargets({ weightKg: 60, load: 'light', sport: 'track' }).macros.protein, 90);
});

test('in Athlete mode a heavy day gets a bigger plate, and a normal plan is unchanged', async () => {
  const { optimizeDay } = await import('../src/utils/mealOptimizer.js');
  const { mockCampusMenu } = await import('../src/lib/mockCampusMenu.js');
  const { mealShares } = await import('../src/utils/dayPlan.js');
  const menu = mockCampusMenu({ locations: { north: { id: 'north', name: 'North', shortName: 'North' } } });
  const R = { allergies: [], avoidIngredients: [] };
  const day = (t, options) => {
    const p = optimizeDay(menu, t, R, new Set(), mealShares(), new Map(), options);
    return ['breakfast', 'lunch', 'dinner'].reduce((a, m) => ({ cal: a.cal + p.north[m].totals.calories, c: a.c + p.north[m].totals.carbs }), { cal: 0, c: 0 });
  };
  const heavy = athleteDailyTargets({ weightKg: 70, bmr: 1600, load: 'heavy' });
  const light = athleteDailyTargets({ weightKg: 70, bmr: 1600, load: 'light' });
  const plain = day(heavy, {});
  const fuel = day(heavy, { fuel: true });
  assert.ok(fuel.c > plain.c + 80, 'more carbohydrate');
  assert.ok(fuel.c >= heavy.macros.carbs * 0.8, 'within 20% of the carb target');
  assert.ok(fuel.cal <= heavy.calories * 1.05, 'never well past the calories');
  assert.ok(day(heavy, { fuel: true }).cal > day(light, { fuel: true }).cal, 'a heavy day is bigger than a light one');
  // Without the option nothing changes: the same plate as before the option existed.
  const normal = { calories: 2200, macros: { protein: 130, carbs: 250, fat: 85 } };
  assert.deepEqual(day(normal, {}), day(normal, undefined));
});

test('the fuel pass never adds an item the restrictions block', async () => {
  const { optimizeMeal } = await import('../src/utils/mealOptimizer.js');
  const target = { calories: 1400, protein: 42, carbs: 210, fat: 40 };
  const n = (calories, carbs) => ({ calories, protein: 4, carbs, fat: 2 });
  const items = [
    { id: 'a', name: 'Grilled Chicken', station: 'grill', tags: [], allergens: [], ingredients: [], nutrition: { calories: 300, protein: 40, carbs: 0, fat: 8 } },
    { id: 'b', name: 'Steamed Broccoli', station: 'sides', tags: ['vegan', 'vegetarian'], allergens: [], ingredients: [], nutrition: n(60, 10) },
    { id: 'c', name: 'Wheat Bread Roll', station: 'bakery', tags: [], allergens: ['wheat'], ingredients: [], nutrition: n(200, 40) },
    { id: 'd', name: 'Jasmine Rice', station: 'sides', tags: ['vegan', 'vegetarian'], allergens: [], ingredients: [], nutrition: n(200, 44) },
  ];
  const res = optimizeMeal(items, target, { allergies: [], avoidIngredients: [], wheat: true }, new Set(), 'lunch', new Map(), { fuel: true });
  assert.ok(!res.items.some((i) => i.id === 'c'), 'the wheat roll stays off');
  assert.ok(res.items.some((i) => i.id === 'd' && (i.servings ?? 1) > 1), 'rice is the fuel instead');
});

test('in Athlete mode the protein top-up is the one closest to the target, not the biggest', async () => {
  const { optimizeMeal } = await import('../src/utils/mealOptimizer.js');
  const target = { calories: 1200, protein: 40, carbs: 150, fat: 40 };
  const item = (id, name, station, protein, calories, tags = []) =>
    ({ id, name, station, tags, allergens: [], ingredients: [], nutrition: { calories, protein, carbs: 10, fat: 5 } });
  const items = [
    item('v', 'Vegetable Lasagna', 'entree', 12, 300, ['vegan', 'vegetarian']),
    item('b', 'Steamed Broccoli', 'sides', 3, 60, ['vegan', 'vegetarian']),
    item('s', 'Grilled Steak', 'grill', 45, 450),
    item('c', 'Grilled Chicken Breast', 'grill', 24, 220),
  ];
  const R = { allergies: [], avoidIngredients: [] };
  const plain = optimizeMeal(items, target, R, new Set(), 'dinner', new Map());
  const fuel = optimizeMeal(items, target, R, new Set(), 'dinner', new Map(), { fuel: true });
  assert.ok(plain.items.some((i) => i.id === 's'), 'without Athlete mode the biggest protein wins, as before');
  assert.ok(fuel.items.some((i) => i.id === 'c') && !fuel.items.some((i) => i.id === 's'), 'in Athlete mode the closer one wins');
});
