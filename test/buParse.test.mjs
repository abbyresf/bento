import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseBuMenuPage, buListedDates, buMealPeriod, buStationKind, sliceBuDay } from '../src/services/buParse.js';
import { getUniversityConfig, BU_CONFIG } from '../src/services/menuFetcher.js';
import { UNIVERSITIES } from '../src/data/universities.js';

// A cut-down copy of a real Warren Towers page (2 Nov 2026): a regular dish, a create-your-own line, a smoothie,
// a dinner dish with allergens, a late-night section and a brunch day.
const page = fs.readFileSync(new URL('./fixtures/bu-warren-excerpt.html', import.meta.url), 'utf8');

test('lists every date on the page, and slices one day out', () => {
  assert.deepEqual([...new Set(buListedDates(page))], ['2026-11-02', '2026-11-03']);
  const day = sliceBuDay(page, '2026-11-02');
  assert.ok(day.includes('Plant-Based Chorizo Breakfast Taco'));
  assert.ok(!day.includes('2026-11-03-brunch'));
  assert.equal(sliceBuDay(page, '2030-01-01'), null);
});

test('a date the page does not list is a closed day, not an error', () => {
  const r = parseBuMenuPage(page, '2030-01-01');
  assert.equal(r.isOpen, false);
  assert.deepEqual(r.meals, { breakfast: [], lunch: [], dinner: [] });
});

test('reads a regular dish: nutrition, serving, tags, allergens, ingredients', () => {
  const taco = parseBuMenuPage(page, '2026-11-02').meals.breakfast.find((d) => d.name === 'Plant-Based Chorizo Breakfast Taco');
  assert.equal(taco.id, 'bu_plant_based_chorizo_breakfast_taco');
  assert.deepEqual(taco.nutrition, { calories: 385, protein: 12, carbs: 30, fat: 25, sodium: 870, fiber: 4, sugar: 2 });
  assert.deepEqual(taco.tags.sort(), ['vegan', 'vegetarian']);
  assert.deepEqual(taco.allergens.sort(), ['soy', 'wheat']);
  assert.equal(taco.stationName, 'Home');
  assert.equal(taco.meal, 'breakfast');
  assert.equal(taco.serving.label, '1 each');
  assert.ok(taco.ingredients.includes('fresh yellow onion'));
});

test('leaves out create-your-own lines, which have no honest numbers', () => {
  const names = parseBuMenuPage(page, '2026-11-02').meals.breakfast.map((d) => d.name);
  assert.ok(!names.some((n) => /create your own/i.test(n)));
});

test('uses the allergen vocabulary the restrictions filter expects', () => {
  const dinner = parseBuMenuPage(page, '2026-11-02').meals.dinner[0];
  assert.equal(dinner.name, 'Crispy Chicken');
  for (const a of dinner.allergens) assert.ok(['milk', 'eggs', 'soy', 'wheat', 'fish', 'shellfish', 'treeNuts', 'peanuts', 'sesame'].includes(a), a);
  assert.ok(dinner.allergens.includes('milk'));
});

test('skips sections that are not breakfast, lunch or dinner', () => {
  const r = parseBuMenuPage(page, '2026-11-02');
  assert.equal(r.meals.breakfast.length + r.meals.lunch.length + r.meals.dinner.length, 3);
});

test('brunch is breakfast before 11am and lunch from 11am', () => {
  assert.equal(buMealPeriod('brunch', '9:30 AM - 11:00 AM'), 'breakfast');
  assert.equal(buMealPeriod('brunch', '11:00 AM - 2:00 PM'), 'lunch');
  assert.equal(buMealPeriod('brunch', '12:00 PM - 2:00 PM'), 'lunch');
  assert.equal(buMealPeriod('latenight'), null);
  assert.equal(parseBuMenuPage(page, '2026-11-03').meals.breakfast.length, 1);
});

test('station kinds', () => {
  assert.equal(buStationKind('Grill'), 'grill');
  assert.equal(buStationKind('Gluten Free'), 'allgood');
  assert.equal(buStationKind('Salad Bar'), 'salad');
  assert.equal(buStationKind('World'), 'entree');
});

test('BU is wired in but off until it is launched', () => {
  const bu = UNIVERSITIES.find((u) => u.id === 'bu');
  assert.equal(bu.name, 'Boston University');
  assert.equal(bu.itemPrefix, 'bu_');
  assert.equal(bu.available, false);
  assert.equal(getUniversityConfig('bu'), BU_CONFIG);
  assert.deepEqual(Object.keys(BU_CONFIG.locations), ['warren', 'marciano', 'west', 'granby']);
  assert.match(BU_CONFIG.getDiningUrl('warren', '2026-11-02'), /\/api\/bu\?slug=warren&date=2026-11-02$/);
  const parsed = BU_CONFIG.parseLocationPage(JSON.stringify({ meals: { breakfast: [], lunch: [{ id: 'bu_x' }], dinner: [] }, isOpen: true }));
  assert.equal(parsed.isOpen, true);
  assert.equal(BU_CONFIG.parseLocationPage('not json').isOpen, false);
  // Brandeis keeps its own short name now that BU is a school too.
  assert.equal(UNIVERSITIES.find((u) => u.id === 'brandeis').abbreviation, 'Brandeis');
});
