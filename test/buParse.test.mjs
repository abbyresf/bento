import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseBuMenuPage, buListedDates, buMealPeriod, buStationKind, sliceBuDay, buParseHours } from '../src/services/buParse.js';
import { scanIngredients, reconcileDish } from '../src/services/buIngredients.js';
import { passesHardRestrictions } from '../src/utils/mealOptimizer.js';
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

test('a create-your-own line becomes one dish per option, each with its own label', () => {
  const breakfast = parseBuMenuPage(page, '2026-11-02').meals.breakfast;
  assert.ok(!breakfast.some((d) => /create your own/i.test(d.name)), 'the line itself is not a dish');
  const eggs = breakfast.find((d) => d.name === 'Scrambled Eggs');
  assert.equal(eggs.id, 'bu_opt_scrambled_eggs_1_2_cup');
  assert.equal(eggs.stationName, 'Create Your Own Egg Scramble');
  assert.equal(eggs.nutrition.calories, 140);
  assert.equal(eggs.nutrition.fat, 9);
  assert.deepEqual(eggs.allergens, ['eggs']);
  assert.ok(eggs.tags.includes('vegetarian'));
  assert.equal(breakfast.filter((d) => d.stationName === 'Create Your Own Egg Scramble').length, 5);
});

test('uses the allergen vocabulary the restrictions filter expects', () => {
  const dinner = parseBuMenuPage(page, '2026-11-02').meals.dinner[0];
  assert.equal(dinner.name, 'Crispy Chicken');
  for (const a of dinner.allergens) assert.ok(['milk', 'eggs', 'soy', 'wheat', 'fish', 'shellfish', 'treeNuts', 'peanuts', 'sesame'].includes(a), a);
  assert.ok(dinner.allergens.includes('milk'));
});

test('skips sections that are not breakfast, lunch or dinner', () => {
  const r = parseBuMenuPage(page, '2026-11-02');
  assert.equal(r.meals.breakfast.length + r.meals.lunch.length + r.meals.dinner.length, 8);
  assert.ok(!Object.values(r.meals).flat().some((d) => d.position === undefined));
});

test("reads the hall's real hours for each meal", () => {
  assert.deepEqual(parseBuMenuPage(page, '2026-11-02').hours, { breakfast: { start: 7, end: 11 }, dinner: { start: 16, end: 21 } });
  assert.deepEqual(buParseHours('10:30 AM - 4:00 PM'), { start: 10.5, end: 16 });
  assert.deepEqual(buParseHours('12:00 PM - 2:30 PM'), { start: 12, end: 14.5 });
  assert.deepEqual(buParseHours('11:30 PM - 12:30 AM'), null, 'a span past midnight is not a meal here');
  assert.equal(buParseHours(''), null);
  assert.equal(buParseHours('Closed'), null);
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

test('BU is wired in and launched', () => {
  const bu = UNIVERSITIES.find((u) => u.id === 'bu');
  assert.equal(bu.name, 'Boston University');
  assert.equal(bu.itemPrefix, 'bu_');
  assert.equal(bu.available, true);
  assert.equal(getUniversityConfig('bu'), BU_CONFIG);
  assert.deepEqual(Object.keys(BU_CONFIG.locations), ['warren', 'marciano', 'west', 'granby']);
  assert.match(BU_CONFIG.getDiningUrl('warren', '2026-11-02'), /\/api\/bu\?slug=warren&date=2026-11-02$/);
  const parsed = BU_CONFIG.parseLocationPage(JSON.stringify({ meals: { breakfast: [], lunch: [{ id: 'bu_x' }], dinner: [] }, isOpen: true }));
  assert.equal(parsed.isOpen, true);
  assert.equal(BU_CONFIG.parseLocationPage('not json').isOpen, false);
  // Brandeis keeps its own short name now that BU is a school too.
  assert.equal(UNIVERSITIES.find((u) => u.id === 'brandeis').abbreviation, 'Brandeis');
});

// ── The ingredient check ──────────────────────────────────────────────────────

const found = (text) => scanIngredients(text).allergens.sort();

test('finds every allergen in the ingredient text, nested ones included', () => {
  assert.deepEqual(found('Sauce (water, soy sauce [water, soybeans, wheat, salt], sesame oil), Shrimp'), ['sesame', 'shellfish', 'soy', 'wheat']);
  assert.deepEqual(found('Parmesan Cheese, Butter, Eggs, Walnuts, Peanut Oil, Cod, Tahini'), ['eggs', 'fish', 'milk', 'peanuts', 'sesame', 'tree nuts']);
  assert.deepEqual(found('Wheat Flour, Whey Powder, Casein'), ['milk', 'wheat']);
  assert.deepEqual(found('Oyster Sauce, Worcestershire'), ['fish', 'shellfish']);
});

test('plant lookalikes are not dairy, egg or meat', () => {
  assert.deepEqual(found('Oat Milk, Vegan Mayonnaise, Coconut Cream, Cocoa Butter, Peanut Butter, Almond Milk'), ['peanuts', 'tree nuts']);
  assert.deepEqual(found('Vegan Shredded Cheddar Cheese (cheddar-style cheese [water, potato starch, palm oil])'), []);
  assert.deepEqual(found('Eggplant, Butternut Squash, Water Chestnuts, Cream Of Rice, Swiss Chard, Nutmeg, Cream Of Tartar'), []);
  assert.equal(scanIngredients('Vegan Chorizo Sausage Crumbles, Plant-Based Chicken, Beyond Meat Burger Patty, Montreal Steak Seasoning').breaks.vegan, false);
});

test('gluten-free flours and tamari are not wheat', () => {
  assert.deepEqual(found('Rice Flour, Corn Flour, Almond Flour, Gluten-Free Tamari Soy Sauce (water, soybeans)'), ['soy', 'tree nuts']);
  assert.deepEqual(found('Enriched Flour, Panko Breadcrumbs'), ['wheat']);
});

test('refined soybean oil is not read as soy, soy protein is', () => {
  assert.deepEqual(found('Oil Blend (vegetable oil [may contain one or more of the following: 90% soybean and/or canola oil])'), []);
  assert.deepEqual(found('Soybean Oil, French Fries'), []);
  assert.deepEqual(found('Soy Protein Isolate, Soy Lecithin, Tofu, Edamame, Miso'), ['soy']);
});

test('a cross-contact note is kept apart and never filters a dish', () => {
  const r = scanIngredients('Vegan Liquid Egg (water, mung bean protein [MADE IN A FACILITY THAT PROCESSES EGG]), Salsa');
  assert.deepEqual(r.allergens, []);
  assert.deepEqual(r.mayContain, ['eggs']);
  assert.deepEqual(scanIngredients('Beyond Meat Patty (pea protein). Contains No Peanuts Or Tree Nuts').allergens, []);
});

test('diet labels the ingredients contradict are dropped', () => {
  assert.equal(scanIngredients('Beef Broth, Carrots').breaks.vegetarian, true);
  assert.equal(scanIngredients('Pork Sausage').breaks.halal, true);
  assert.equal(scanIngredients('Turkey Bacon').breaks.halal, false);
  assert.equal(scanIngredients('Pepperoni (beef)').breaks.halal, false);
  assert.equal(scanIngredients('Red Wine, Onion').breaks.halal, true);
  assert.equal(scanIngredients('Red Wine Vinegar, Onion').breaks.halal, false);
  assert.equal(scanIngredients('Pure Clover Honey').breaks.vegan, true);
  assert.equal(scanIngredients('Pure Clover Honey').breaks.vegetarian, false);
  assert.equal(scanIngredients('Barley, Malt Extract').breaks.glutenFree, true);
  assert.equal(scanIngredients('Rice, Salt').breaks.glutenFree, false);
});

test('reconciling only ever makes a dish stricter', () => {
  const r = reconcileDish({ allergens: ['milk'], tags: ['vegan', 'vegetarian', 'glutenFree', 'halal'] }, 'Croutons (wheat flour, whey, parmesan)');
  assert.deepEqual(r.allergens.sort(), ['milk', 'wheat']);
  assert.deepEqual(r.tags.sort(), ['halal', 'vegetarian']);
  assert.deepEqual(r.check.removedTags.sort(), ['glutenFree', 'vegan']);
  // A label the ingredients cannot disprove stays, and no tag is ever added.
  const kept = reconcileDish({ allergens: ['sesame'], tags: [] }, 'Water, Salt');
  assert.deepEqual(kept.allergens, ['sesame']);
  assert.deepEqual(kept.tags, []);
  assert.equal(kept.check.addedAllergens, undefined);
});

test('BU allergens use the names the app filter checks', () => {
  const nutty = { id: 'x', tags: [], allergens: ['tree nuts'], ingredients: [] };
  const eggy = { id: 'y', tags: [], allergens: ['eggs'], ingredients: [] };
  assert.equal(passesHardRestrictions(nutty, { treeNuts: true }), false);
  assert.equal(passesHardRestrictions(eggy, { eggs: true }), false);
  for (const a of found('almond milk, walnut, egg, shrimp, cod, sesame, peanut, soy sauce, milk, wheat flour')) {
    assert.ok(['milk', 'eggs', 'wheat', 'soy', 'fish', 'shellfish', 'tree nuts', 'peanuts', 'sesame'].includes(a), a);
  }
  const dish = parseBuMenuPage(page, '2026-11-02').meals.breakfast.find((d) => d.name === 'Plant-Based Chorizo Breakfast Taco');
  assert.equal(passesHardRestrictions(dish, { soy: true }), false);
  assert.equal(passesHardRestrictions(dish, { milk: true }), true, 'the plant cheese is not dairy');
  assert.equal(passesHardRestrictions(dish, { vegan: true }), true);
});
