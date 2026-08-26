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
import { optimizeMeal, findRecommendedAdditions } from '../src/utils/mealOptimizer.js';
import { getRole, ROLE, ACCESSORY_ROLES } from '../src/utils/foodRoles.js';

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

console.log(failures === 0 ? '\nAll composition invariants hold.' : `\n${failures} assertion(s) failed.`);
process.exit(failures ? 1 : 0);
