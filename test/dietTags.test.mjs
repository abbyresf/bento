// Dietary tags reach the restriction filter. In late October 2026 Brandeis renamed the field its dietary labels come in,
// every dish parsed with no tags, and a vegetarian, vegan or gluten-free student saw no dishes at all. These pin both
// page shapes, and the allergen spellings the filter matches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { parseBrandeisDoc } from '../src/services/brandeisParse.js';
import { TUFTS_CONFIG } from '../src/services/menuFetcher.js';
import { passesHardRestrictions } from '../src/utils/mealOptimizer.js';

const dish = (id, name, labels) => `
  <li class="menu-item-li">
    <a class="show-nutrition" data-recipe="${id}">${name}</a>
    <script type="application/json" id="recipe-nutrition-${id}">${JSON.stringify({
      facts: [{ label: 'Calories', value: '300' }, { label: 'Protein', value: '10' }],
      serving_size: '1 cup',
      allergens_list: '',
      ...labels,
    })}</script>
  </li>`;

const page = (items) => parse(`
  <div id="menu-tabs">
    <a class="c-tabs-nav__link"><span class="c-tabs-nav__link-inner">Lunch</span></a>
    <div class="c-tab"><div class="menu-station"><h4>Entree</h4><ul>${items.join('')}</ul></div></div>
  </div>`);

const only = (key) => ({ allergies: [], [key]: true });
const names = (items, key) => items.filter((i) => passesHardRestrictions(i, only(key))).map((i) => i.name);

test('Brandeis labels in the current shape (attributes[].icon) tag dishes', () => {
  const { meals } = parseBrandeisDoc(page([
    dish('a', 'Lentil Stew', { attributes: [{ icon: 'vegan', name: 'Vegan' }, { icon: 'made_without_gluten', name: 'Made without Gluten' }] }),
    dish('b', 'Cheese Pizza', { attributes: [{ icon: 'vegetarian', name: 'Vegetarian' }] }),
    dish('c', 'Roast Chicken', { attributes: [{ icon: 'local_brandeis', name: 'Local' }] }),
  ]));
  const items = meals.lunch;
  assert.deepEqual(names(items, 'vegetarian'), ['Lentil Stew', 'Cheese Pizza']);
  assert.deepEqual(names(items, 'vegan'), ['Lentil Stew']);
  assert.deepEqual(names(items, 'glutenFree'), ['Lentil Stew']);
});

test('Brandeis labels in the old shape (preferences[].html_attribute) still tag dishes', () => {
  const { meals } = parseBrandeisDoc(page([
    dish('a', 'Tofu Bowl', { preferences: [{ html_attribute: 'vegan' }] }),
    dish('b', 'Beef Tacos', { preferences: [] }),
  ]));
  assert.deepEqual(names(meals.lunch, 'vegetarian'), ['Tofu Bowl']);
});

test('Tufts tree nuts block a tree-nut allergy', () => {
  const food = (name, icons) => ({ name, rounded_nutrition_info: { calories: 200 }, icons: { food_icons: icons } });
  const { meals } = TUFTS_CONFIG.parseLocationPage(JSON.stringify({ meals: { lunch: [
    food('Almond Cake', [{ slug: 'tree-nuts', help_text: 'Contains Tree Nut', behavior: 1 }]),
    food('Rice', []),
  ] } }));
  const safe = meals.lunch.filter((i) => passesHardRestrictions({ ...i, ingredients: i.ingredients ?? [] }, { allergies: [], treeNuts: true }));
  assert.deepEqual(safe.map((i) => i.name), ['Rice']);
});
