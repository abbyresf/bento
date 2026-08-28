// Meal composition invariants, checked against a real Brandeis menu.
//
// Run: node test/mealPlan.test.mjs
//
// These assertions exist because the optimizer used to fill slots purely by
// macro fit, which produced plates like "Chocolate Whoopie Pie + Cottage
// Cheese" for breakfast and suggested balsamic vinaigrette as a course. The
// rules below must hold for every diner, not just an unrestricted one, so
// each case runs across a range of dietary profiles.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { optimizeMeal, findRecommendedAdditions, findAlternatives, optimizeDay, passesHardRestrictions } from '../src/utils/mealOptimizer.js';
import { getRole, ROLE, ACCESSORY_ROLES } from '../src/utils/foodRoles.js';
import { fetchDiningMenu, BRANDEIS_CONFIG } from '../src/services/menuFetcher.js';

const here = dirname(fileURLToPath(import.meta.url));
const menu = JSON.parse(readFileSync(join(here, 'fixtures/brandeis-menu-2026-08-26.json'), 'utf8'));

const toItems = (rows, meal) => rows.map((r, i) => ({
  id: `${meal}-${i}`,
  name: r.name,
  station: r.station,
  meal,
  nutrition: { calories: r.cal, protein: r.pro, carbs: r.carb, fat: r.fat, fiber: r.fib, sodium: 0, sugar: 0 },
  tags: r.tags ?? [],
  ingredients: [],
  allergens: r.allergens ?? [],
}));

const TARGETS = {
  breakfast: { calories: 450, protein: 30, carbs: 55, fat: 15 },
  lunch:     { calories: 700, protein: 45, carbs: 80, fat: 25 },
  dinner:    { calories: 750, protein: 50, carbs: 85, fat: 28 },
};

// The composition rules must not depend on which restrictions are active.
const PROFILES = [
  ['no restrictions',   {}],
  ['vegetarian',        { vegetarian: true }],
  ['vegan',             { vegan: true }],
  ['gluten free',       { glutenFree: true }],
  ['kosher',            { kosher: true }],
  ['vegan + GF',        { vegan: true, glutenFree: true }],
  ['dairy + nut allergy', { milk: true, treeNuts: true }],
  ['vegetarian + milk allergy', { vegetarian: true, milk: true }],
];

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
  return ok;
};

for (const [profileName, restrictions] of PROFILES) {
  console.log(`\n### ${profileName}`);

  for (const meal of ['breakfast', 'lunch', 'dinner']) {
    const items = toItems(menu[meal], meal);
    const target = TARGETS[meal];
    const plan = optimizeMeal(items, target, restrictions, new Set(), meal);
    const roles = plan.items.map(getRole);
    const names = plan.items.map(i => i.name).join(', ');

    // A profile can legitimately have too little food to build a plate from;
    // that is a menu problem, not a composition bug. Only assert on plates
    // the optimizer actually produced.
    if (plan.items.length === 0) {
      console.log(`  ${meal}: no plate (nothing on the menu fits this profile)`);
      continue;
    }

    check(`${meal}: no condiments or garnishes on the plate`,
      !roles.some(r => ACCESSORY_ROLES.has(r)),
      plan.items.filter(i => ACCESSORY_ROLES.has(getRole(i))).map(i => i.name).join(', '));

    check(`${meal}: has a protein source`,
      roles.includes(ROLE.PROTEIN) || roles.includes(ROLE.COMPOSED), names);

    check(`${meal}: dessert is never the anchor`,
      getRole(plan.items[0]) !== ROLE.DESSERT, names);

    check(`${meal}: every item has real nutrition data`,
      plan.items.every(i => i.nutrition.calories > 0 || i.nutrition.protein > 0 || i.nutrition.carbs > 0),
      names);

    check(`${meal}: respects hard restrictions`,
      plan.items.every(i => {
        if (restrictions.vegan && !i.tags.includes('vegan')) return false;
        if (restrictions.vegetarian && !i.tags.includes('vegetarian') && !i.tags.includes('vegan')) return false;
        if (restrictions.glutenFree && !i.tags.includes('glutenFree')) return false;
        if (restrictions.kosher && !i.tags.includes('kosher')) return false;
        if (restrictions.milk && i.allergens.includes('milk')) return false;
        if (restrictions.treeNuts && i.allergens.includes('tree nuts')) return false;
        return true;
      }), names);

    check(`${meal}: does not blow past the calorie target`,
      plan.totals.calories <= target.calories * 1.25,
      `${plan.totals.calories} vs ${target.calories}`);

    // Lunch and dinner should carry produce whenever the menu offers any that
    // fits the profile. Breakfast is exempt: dining halls rarely serve one.
    if (meal !== 'breakfast') {
      const producePossible = items.some(i =>
        [ROLE.VEGETABLE, ROLE.SOUP, ROLE.FRUIT].includes(getRole(i)) &&
        (!restrictions.vegan || i.tags.includes('vegan')) &&
        (!restrictions.glutenFree || i.tags.includes('glutenFree')) &&
        (!restrictions.kosher || i.tags.includes('kosher')));
      if (producePossible) {
        check(`${meal}: includes a vegetable, soup or fruit`,
          roles.some(r => [ROLE.VEGETABLE, ROLE.SOUP, ROLE.FRUIT].includes(r)), names);
      }
    }

    // Suggestions were the worst offender: every one used to be a 10-calorie
    // salad-bar topping.
    const used = new Set(plan.items.map(i => i.id));
    const recs = findRecommendedAdditions(items, target, plan.totals, restrictions, new Set(), used, meal, plan.items, 3);
    check(`${meal}: suggestions contain no condiments or garnishes`,
      !recs.some(r => ACCESSORY_ROLES.has(getRole(r))),
      recs.filter(r => ACCESSORY_ROLES.has(getRole(r))).map(r => r.name).join(', '));

    check(`${meal}: suggestions respect hard restrictions`,
      recs.every(i => {
        if (restrictions.vegan && !i.tags.includes('vegan')) return false;
        if (restrictions.glutenFree && !i.tags.includes('glutenFree')) return false;
        if (restrictions.kosher && !i.tags.includes('kosher')) return false;
        return true;
      }), recs.map(r => r.name).join(', '));

    const fiber = plan.items.reduce((s, i) => s + (i.nutrition.fiber ?? 0), 0);
    console.log(`  ${meal}: ${plan.totals.calories}cal ${plan.totals.protein}p ${fiber}fib — ${names}`);
  }
}

// ── The student's own ratings ─────────────────────────────────────────────────
// A low rating has to actually do something. Before this existed, telling
// Bento you disliked a dish changed nothing at all: only 4-5 stars were read,
// so a one-star meal could be recommended again the next day at full weight.

console.log('\n### ratings');
{
  const items = toItems(menu.lunch, 'lunch');
  const target = TARGETS.lunch;
  const base = optimizeMeal(items, target, {}, new Set(), 'lunch', new Map());
  const anchor = base.items[0];

  const onePlate = optimizeMeal(items, target, {}, new Set(), 'lunch', new Map([[anchor.id, 1]]));
  check('one star drops the item from the plate',
    !onePlate.items.some(i => i.id === anchor.id), anchor.name);

  const threePlate = optimizeMeal(items, target, {}, new Set(), 'lunch', new Map([[anchor.id, 3]]));
  check('three stars is a no-op',
    threePlate.items.map(i => i.id).join() === base.items.map(i => i.id).join());

  const fivePlate = optimizeMeal(items, target, {}, new Set(), 'lunch', new Map([[anchor.id, 5]]));
  check('five stars keeps the item',
    fivePlate.items.some(i => i.id === anchor.id), anchor.name);

  // Swaps are where a student is actively asking for something else, so the
  // signal has to reach them too.
  const cold = findAlternatives(base.items[1] ?? base.items[0], items, target, base.totals, {}, new Set(), new Set(), 6, new Map());
  if (cold.length) {
    const warm = findAlternatives(base.items[1] ?? base.items[0], items, target, base.totals, {}, new Set(), new Set(), 6, new Map([[cold[0].id, 1]]));
    check('a disliked dish sinks in the swap list',
      warm.findIndex(a => a.id === cold[0].id) !== 0, cold[0].name);
    const liked = findAlternatives(base.items[1] ?? base.items[0], items, target, base.totals, {}, new Set(), new Set(), 6, new Map([[cold[3]?.id, 5]]));
    if (cold[3]) {
      check('a liked dish rises in the swap list',
        liked.findIndex(a => a.id === cold[3].id) < 3, cold[3].name);
    }
  }

  // Penalties, not exclusions: a thin menu must still yield a real plate even
  // if the student has disliked everything on it.
  const kosherItems = items.filter(i => i.tags.includes('kosher'));
  const allDisliked = new Map(kosherItems.map(i => [i.id, 1]));
  const thin = optimizeMeal(items, target, { kosher: true }, new Set(), 'lunch', allDisliked);
  check('disliking every available item still produces a plate',
    thin.items.length > 0);
  check('that plate still respects the restriction',
    thin.items.every(i => i.tags.includes('kosher')));
  console.log(`  lunch: ${base.items.map(i => i.name).join(', ')}`);
}

// ── Locations are alternatives, not a sequence ────────────────────────────────
// A student eats at one hall. Sharing the "seen already" set across locations
// meant whichever was optimized second got a worse plate, penalised for food
// the student would never eat.

console.log('\n### location independence');
{
  const meals = {
    breakfast: toItems(menu.breakfast, 'breakfast'),
    lunch:     toItems(menu.lunch, 'lunch'),
    dinner:    toItems(menu.dinner, 'dinner'),
  };
  const dayTargets = { calories: 2000, macros: { protein: 130, carbs: 230, fat: 70 } };
  const plan = (order) => optimizeDay(
    { locations: Object.fromEntries(order.map(id => [id, { meals }])) },
    dayTargets, {}, new Set());
  const show = (r, loc) => ['breakfast', 'lunch', 'dinner']
    .map(m => r[loc][m].items.map(i => i.id).join()).join('|');

  const a = plan(['sherman', 'usdan']);
  const b = plan(['usdan', 'sherman']);

  check('identical menus give both locations the same plan',
    show(a, 'sherman') === show(a, 'usdan'));
  check('plans do not depend on which location is optimized first',
    show(a, 'sherman') === show(b, 'sherman') && show(a, 'usdan') === show(b, 'usdan'));
  console.log(`  sherman: ${a.sherman.lunch.items.map(i => i.name).join(', ')}`);
}

// ── Build My Plate obeys the same filters ─────────────────────────────────────
// Browsing the menu by hand used to show everything, so a kosher or vegan
// student could be offered items Bento would never recommend them. The manual
// list is filtered with the same predicate the optimizer uses.

console.log('\n### build my plate');
{
  const items = toItems(menu.lunch, 'lunch');
  for (const [profileName, restrictions] of PROFILES) {
    const allowed = items.filter(i => passesHardRestrictions(i, restrictions));
    check(`${profileName}: browser offers nothing that breaks the restriction`,
      allowed.every(i => {
        if (restrictions.vegan && !i.tags.includes('vegan')) return false;
        if (restrictions.vegetarian && !i.tags.includes('vegetarian') && !i.tags.includes('vegan')) return false;
        if (restrictions.glutenFree && !i.tags.includes('glutenFree')) return false;
        if (restrictions.kosher && !i.tags.includes('kosher')) return false;
        if (restrictions.milk && i.allergens.includes('milk')) return false;
        if (restrictions.treeNuts && i.allergens.includes('tree nuts')) return false;
        return true;
      }));
    // Whatever the optimizer puts on the plate must be findable by hand too,
    // or a student could not rebuild their own recommended meal.
    const plan = optimizeMeal(items, TARGETS.lunch, restrictions, new Set(), 'lunch');
    const allowedIds = new Set(allowed.map(i => i.id));
    check(`${profileName}: every recommended item is browsable`,
      plan.items.every(i => allowedIds.has(i.id)),
      plan.items.filter(i => !allowedIds.has(i.id)).map(i => i.name).join(', '));
  }
  console.log(`  kosher sees ${items.filter(i => passesHardRestrictions(i, { kosher: true })).length} of ${items.length} lunch items`);
}

// ── One dish, one entry ───────────────────────────────────────────────────────
// Brandeis lists a dish under every station that serves it — sliced red onions
// appear three times at Usdan lunch and four times at dinner. Selection is by
// id, so every copy matched: the browse list showed the dish three times and a
// single tap put three servings on the plate and in the meal card.

console.log('\n### duplicate menu items');
{
  const dish = (id, name, station) => ({
    id, name, station, meal: 'lunch',
    nutrition: { calories: 10, protein: 0, carbs: 1, fat: 0, fiber: 0 },
    tags: [], ingredients: [], allergens: [],
  });

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => 'x' });

  const config = {
    ...BRANDEIS_CONFIG,
    parseLocationPage: () => ({ isOpen: true, meals: {
      breakfast: [],
      lunch: [
        dish('bh_A', 'Sliced Red Onions', 'grill'),
        dish('bh_B', 'Grilled Chicken', 'grill'),
        dish('bh_A', 'Sliced Red Onions', 'salad'),
        dish('bh_A', 'Sliced Red Onions', 'deli'),
      ],
      dinner: [],
    }}),
  };

  const menu = await fetchDiningMenu(config, '2026-08-27');
  globalThis.fetch = realFetch;

  for (const [locId, data] of Object.entries(menu.locations)) {
    const ids = data.meals.lunch.map(i => i.id);
    check(`${locId}: no dish appears twice in one meal`,
      ids.length === new Set(ids).size, ids.join(', '));
  }

  // The bug as a student met it: selecting one dish must yield one serving.
  const lunch = menu.locations.usdan.meals.lunch;
  const selected = new Set(['bh_A']);
  const picked = [...selected].map(id => lunch.find(i => i.id === id)).filter(Boolean);
  check('selecting one dish adds exactly one serving', picked.length === 1,
    `got ${picked.length}`);
  console.log(`  usdan lunch: ${lunch.length} items from 4 raw rows`);
}

console.log(failures === 0 ? '\nAll composition invariants hold.' : `\n${failures} assertion(s) failed.`);
process.exit(failures ? 1 : 0);
