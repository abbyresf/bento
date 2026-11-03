/* The Boston University menu parser. Server side only: api/bu.js runs it.
 *
 * bu.edu/dining/location/<hall>/ lists a week of menus in one page, a few MB of
 * HTML per hall. One <ol data-menudate="YYYY-MM-DD"> holds a day, one
 * <li class="menu-meal-period"> holds a meal, and each dish carries its
 * calories, protein and carbs in a short overview, the full label (total fat,
 * sodium, fiber) in a table, and diets and allergens as class-named list items.
 *
 * Only the requested day is cut out of the page before parsing, so a 15 MB page
 * costs one slice and a ~1.8 MB parse. `parseBuMenuPage` returns the same
 * { meals, isOpen } the Brandeis and Tufts parsers do.
 *
 * Create-your-own stations (an omelet, a bowl) list one dish whose numbers are
 * the maximum of every topping, and BU's own page says "nutrition varies with
 * options". Putting that figure on a plate would be a lie, so those dishes are
 * left out. */
import { parse } from 'node-html-parser';
import { parseServingSize } from '../utils/servingSize.js';

const num = (text) => {
  const m = String(text ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Math.round(Number(m[0])) : 0;
};

/* The meal sitting a page section belongs to, or null for anything that is not
   a breakfast, lunch or dinner. "Brunch" is the breakfast sitting before 11am
   and the lunch sitting from 11am, the same rule the Brandeis parser uses. */
export function buMealPeriod(slug, timesText = '') {
  const s = String(slug ?? '').toLowerCase();
  if (s === 'breakfast' || s === 'lunch' || s === 'dinner') return s;
  if (s === 'brunch') {
    const m = String(timesText).match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (!m) return 'lunch';
    let hour = parseInt(m[1], 10);
    const pm = m[3].toLowerCase() === 'pm';
    if (pm && hour !== 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
    return hour >= 11 ? 'lunch' : 'breakfast';
  }
  return null;
}

/* The coarse station kind the plate planner groups by. */
export function buStationKind(name = '') {
  const s = name.toLowerCase();
  if (s.includes('gluten')) return 'allgood';
  if (s.includes('grill')) return 'grill';
  if (s.includes('deli') || s.includes('sandwich')) return 'deli';
  if (s.includes('salad')) return 'salad';
  if (s.includes('soup')) return 'soup';
  if (s.includes('bakery') || s.includes('dessert')) return 'bakery';
  if (s.includes('pizza')) return 'pizza';
  if (s.includes('beverage') || s.includes('drink') || s.includes('coffee')) return 'beverage';
  return 'entree';
}

const DIET_TAGS = {
  vegan: ['vegan', 'vegetarian'],
  vegetarian: ['vegetarian'],
  'gluten-free': ['glutenFree'],
  halal: ['halal'],
  kosher: ['kosher'],
};

// BU's allergen class names, in the vocabulary the app's restrictions use.
const ALLERGENS = {
  milk: 'milk', egg: 'eggs', soy: 'soy', wheat: 'wheat', fish: 'fish', shellfish: 'shellfish',
  'tree-nuts': 'treeNuts', peanuts: 'peanuts', sesame: 'sesame',
};

const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/* "Salsa Verde (tomatillos, onions), Fresh Onion" is two ingredients. Split on commas outside brackets and
   keep the name before any bracket. */
function topLevelIngredients(text) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth += 1;
    else if ((ch === ')' || ch === ']') && depth > 0) depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.replace(/\s*[([].*$/s, '').trim().toLowerCase()).filter(Boolean);
}

function labelValue(el, label) {
  for (const tr of el.querySelectorAll('table.nutrition-label tr')) {
    const nutrient = tr.querySelector('.nutrition-label-nutrient');
    if (nutrient && nutrient.textContent.trim().toLowerCase() === label) {
      return num(tr.querySelector('.nutrition-label-amount')?.textContent);
    }
  }
  return 0;
}

function parseDish(li, mealPeriod) {
  const wrapper = li.querySelector('.menu-item-wrapper');
  if (!wrapper) return null;
  const name = wrapper.querySelector('.menu-item-title')?.textContent.trim();
  if (!name) return null;

  // A create-your-own line: one dish standing for many choices. Left out (see the header).
  if (wrapper.querySelector('.js-nutrition-see-options') || li.querySelector('.cyo-nutrition-facts')) return null;

  const cals = wrapper.querySelector('.menu-nutrition-cals strong');
  if (!cals) return null;

  const facts = li.querySelector('section.nutrition-main') ?? li;
  const stationName = wrapper.querySelector('.js-sortby-station')?.textContent.trim() || '';

  const tags = new Set();
  for (const d of wrapper.querySelectorAll('.menu-item-dietary-restriction li')) {
    for (const cls of d.classNames.split(/\s+/)) for (const t of DIET_TAGS[cls] ?? []) tags.add(t);
  }
  const allergens = [];
  for (const a of facts.querySelectorAll('.nutrition-facts-allergens li')) {
    const key = ALLERGENS[a.classNames.split(/\s+/)[0]];
    if (key && !allergens.includes(key)) allergens.push(key);
  }

  const ingredientText = facts.querySelector('.nutrition-facts-ingredients')?.textContent.replace(/^\s*Ingredients:\s*/i, '') ?? '';
  const ingredients = topLevelIngredients(ingredientText).slice(0, 20);

  const protein = num(wrapper.querySelector('.menu-nutrition-protein strong')?.textContent) || labelValue(facts, 'protein');
  const carbs = num(wrapper.querySelector('.menu-nutrition-carbs strong')?.textContent) || labelValue(facts, 'total carbohydrate');

  return {
    id: `bu_${slugOf(name)}`,
    name,
    station: buStationKind(stationName),
    stationName: stationName || null,
    stations: stationName ? [stationName] : [],
    meal: mealPeriod,
    nutrition: {
      calories: num(cals.textContent),
      protein,
      carbs,
      fat: labelValue(facts, 'total fat'),
      sodium: labelValue(facts, 'sodium'),
      fiber: labelValue(facts, 'dietary fiber'),
      sugar: labelValue(facts, 'sugars'),
    },
    serving: parseServingSize(facts.querySelector('.nutrition-serving-size')?.textContent.replace(/^\s*Serving size\s*/i, '').trim()),
    tags: [...tags],
    ingredients,
    allergens,
  };
}

/* The HTML of one day's <ol>, cut from the whole page, or null when the page does not list that date. */
export function sliceBuDay(html, dateStr) {
  const marker = `data-menudate="${dateStr}"`;
  const at = html.indexOf(marker);
  if (at === -1) return null;
  const start = html.lastIndexOf('<ol', at);
  const next = html.indexOf('data-menudate="', at + marker.length);
  const end = next === -1 ? html.length : html.lastIndexOf('<ol', next);
  return html.slice(start, end);
}

/* Every date a page lists, so one scrape can warm the cache for the week. */
export function buListedDates(html) {
  return [...html.matchAll(/data-menudate="(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
}

export function parseBuMenuPage(html, dateStr) {
  const meals = { breakfast: [], lunch: [], dinner: [] };
  const day = sliceBuDay(html, dateStr);
  if (!day) return { meals, isOpen: false };

  const root = parse(day);
  for (const section of root.querySelectorAll('li.menu-meal-period')) {
    const slug = section.querySelector('.js-meal-period-name')?.getAttribute('data-meal-period-slug');
    const mealPeriod = buMealPeriod(slug, section.querySelector('.js-meal-period-times')?.textContent);
    if (!mealPeriod) continue;
    for (const li of section.querySelectorAll('ol.menu-dishes > li')) {
      const item = parseDish(li, mealPeriod);
      if (item) { item.position = meals[mealPeriod].length; meals[mealPeriod].push(item); }
    }
  }
  return { meals, isOpen: Object.values(meals).some((a) => a.length > 0) };
}
