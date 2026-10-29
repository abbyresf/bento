import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { planPlates, planPlate, plateRole } from '../src/utils/platePlanner.js';

const dir = new URL('./fixtures/menus/', import.meta.url).pathname;
const days = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(dir + f, 'utf8')));
const R = { allergies: [], avoidIngredients: [] };
const LUNCH = { calories: 825, protein: 49, carbs: 94, fat: 32 };
const HEAVY = { calories: 1391, protein: 42, carbs: 210, fat: 42 };
const meals = [];
for (const d of days) for (const [hall, m] of Object.entries(d.locations)) for (const [meal, items] of Object.entries(m)) {
  if (items.length) meals.push({ label: `${d.date} ${hall} ${meal}`, items });
}

test('every real meal gets a plate', () => {
  assert.ok(meals.length >= 20);
  for (const { label, items } of meals) assert.ok(planPlate(items, LUNCH, { restrictions: R }), label);
});

test('a plate comes from one station, plus fruit or soup on the side', () => {
  for (const { label, items } of meals) for (const [target, fuel] of [[LUNCH, false], [HEAVY, true]]) {
    for (const plate of planPlates(items, target, { restrictions: R, fuel }).slice(0, 5)) {
      for (const { item } of plate.items) {
        const side = ['fruit', 'soup'].includes(plateRole(item));
        const sideStarch = plate.format === 'line' && plateRole(item) === 'starch';  // from a grain bar, for a line with none
        assert.ok(side || sideStarch || item.stations.includes(plate.station), `${label}: ${item.name} is not at ${plate.station}`);
      }
    }
  }
});

test('sauces, dressings, toppings and desserts never make a plate on their own', () => {
  for (const { label, items } of meals) {
    const best = planPlate(items, LUNCH, { restrictions: R });
    const roles = best.items.map(({ item }) => plateRole(item));
    assert.ok(roles.some((r) => ['main', 'protein', 'vegetable', 'yogurt'].includes(r)), `${label}: no main`);
    assert.ok(!roles.includes('dessert'), `${label}: dessert on the plate`);
  }
});

test('the best plate lands near the target', () => {
  for (const { label, items } of meals.filter((m) => !m.label.endsWith('breakfast'))) {
    const t = planPlate(items, LUNCH, { restrictions: R }).totals;
    assert.ok(Math.abs(t.calories / LUNCH.calories - 1) < 0.2, `${label}: ${Math.round(t.calories)} cal`);
  }
});

test('in Athlete mode a heavy day fits at least as well, with more carbohydrate overall', () => {
  let plainCarbs = 0;
  let fuelCarbs = 0;
  for (const { label, items } of meals) {
    const plain = planPlate(items, HEAVY, { restrictions: R });
    const fuel = planPlate(items, HEAVY, { restrictions: R, fuel: true });
    assert.ok(fuel.score <= plain.score + 1e-9, label);   // a third scoop is a choice, never a requirement
    plainCarbs += plain.totals.carbs;
    fuelCarbs += fuel.totals.carbs;
  }
  assert.ok(fuelCarbs > plainCarbs);
});

test('restrictions apply to every item on every plate', () => {
  const veg = { ...R, vegetarian: true };
  for (const { label, items } of meals) for (const plate of planPlates(items, LUNCH, { restrictions: veg }).slice(0, 10)) {
    for (const { item } of plate.items) assert.ok(item.tags.includes('vegetarian') || item.tags.includes('vegan'), `${label}: ${item.name}`);
  }
});

test('a composed dish takes no extra starch, and a sandwich grows whole', () => {
  for (const { items } of meals) for (const plate of planPlates(items, HEAVY, { restrictions: R, fuel: true }).slice(0, 10)) {
    const roles = plate.items.map(({ item }) => plateRole(item));
    if (plate.format === 'line' && roles[0] === 'main') assert.ok(!roles.includes('starch'), plate.items[0].item.name);
    if (plate.format === 'sandwich') assert.equal(new Set(plate.items.filter(({ item }) => !['fruit', 'soup'].includes(plateRole(item))).map((e) => e.servings)).size, 1);
  }
});

test('a menu without station names gives no plates, so the app can fall back', () => {
  const bare = meals[0].items.map(({ stations, stationName, ...rest }) => rest);
  assert.equal(planPlate(bare, LUNCH, { restrictions: R }), null);
});

test('roles the old classifier got wrong', () => {
  const n = (name, calories = 200) => ({ name, nutrition: { calories, protein: 5, carbs: 20, fat: 5 }, tags: [], allergens: [], ingredients: [] });
  assert.equal(plateRole(n('Chocolate Brownie')), 'dessert');
  assert.equal(plateRole(n("Assorted Sweet Loren's Cookies")), 'dessert');
  assert.equal(plateRole(n('Reuben Sandwich', 630)), 'main');
  assert.equal(plateRole(n('Romaine Lettuce', 15)), 'greens');
  assert.equal(plateRole(n('Apple Maple Glazed Turkey', 250)), 'protein');
});
