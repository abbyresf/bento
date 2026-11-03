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
 * options". That figure would be a lie on a plate, so the line itself is left
 * out and each option under it (Scrambled Eggs, Cheddar, Spinach...) becomes a
 * dish of its own, with its own label, which a student can add one by one.
 *
 * Every dish's ingredient text is also read as a check on BU's allergen and diet
 * labels (see buIngredients.js). */
import { parse } from 'node-html-parser';
import { parseServingSize } from '../utils/servingSize.js';
import { reconcileDish } from './buIngredients.js';

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
  'tree-nuts': 'tree nuts', peanuts: 'peanuts', sesame: 'sesame',
};

const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/* Every ingredient named in the text, nested ones included ("Salsa Verde (tomatillos, onions)" gives salsa verde,
   tomatillos and onions). The app matches a student's own allergy words against this list, so a sesame oil inside
   a sauce has to be in it. */
function allIngredients(text) {
  const names = text
    .replace(/[()[\]]/g, ',')
    .split(/[,;]/)
    .map((s) => s.replace(/\b(?:contains?|less than|\d+%|or less of|of the following)\b/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter((s) => s.length > 1 && s.length < 60);
  return [...new Set(names)].slice(0, 120);
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

/* One dish from its label section. `overview` is the short calories/protein/carbs list shown on the menu card,
   absent for a create-your-own option, whose numbers come from the full label alone. */
function buildItem({ id, name, stationName, groupTitle, facts, overview, mealPeriod }) {
  const tags = [];
  for (const d of facts.querySelectorAll('.menu-item-dietary-restriction li')) {
    for (const cls of d.classNames.split(/\s+/)) for (const t of DIET_TAGS[cls] ?? []) if (!tags.includes(t)) tags.push(t);
  }
  const labeled = [];
  for (const a of facts.querySelectorAll('.nutrition-facts-allergens li')) {
    const key = ALLERGENS[a.classNames.split(/\s+/)[0]];
    if (key && !labeled.includes(key)) labeled.push(key);
  }

  const ingredientText = facts.querySelector('.nutrition-facts-ingredients')?.textContent.replace(/^\s*Ingredients:\s*/i, '').trim() ?? '';
  const { allergens, tags: checkedTags, check } = reconcileDish({ allergens: labeled, tags }, ingredientText);

  const calories = overview ? num(overview.querySelector('.menu-nutrition-cals strong')?.textContent) : labelValue(facts, 'calories');
  const protein = (overview && num(overview.querySelector('.menu-nutrition-protein strong')?.textContent)) || labelValue(facts, 'protein');
  const carbs = (overview && num(overview.querySelector('.menu-nutrition-carbs strong')?.textContent)) || labelValue(facts, 'total carbohydrate');

  const stations = [groupTitle ?? stationName].filter(Boolean);
  return {
    id,
    name,
    station: buStationKind(stationName),
    stationName: stations[0] ?? null,
    stations,
    meal: mealPeriod,
    nutrition: {
      calories, protein, carbs,
      fat: labelValue(facts, 'total fat'),
      sodium: labelValue(facts, 'sodium'),
      fiber: labelValue(facts, 'dietary fiber'),
      sugar: labelValue(facts, 'sugars'),
    },
    serving: parseServingSize(facts.querySelector('.nutrition-serving-size')?.textContent.replace(/^\s*Serving size\s*/i, '').trim()),
    tags: checkedTags,
    ingredients: allIngredients(ingredientText),
    allergens,
    // What the ingredient check changed against BU's labels, and whether there was anything to check.
    ...(Object.keys(check).length ? { ingredientCheck: check } : {}),
    ...(ingredientText ? {} : { noIngredients: true }),
  };
}

function parseDishes(li, mealPeriod) {
  const wrapper = li.querySelector('.menu-item-wrapper');
  if (!wrapper) return [];
  const name = wrapper.querySelector('.menu-item-title')?.textContent.trim();
  if (!name) return [];
  const stationName = wrapper.querySelector('.js-sortby-station')?.textContent.trim() || '';

  // A create-your-own line: its options are the dishes.
  const cyoRows = li.querySelectorAll('.nutrition-label-cyo > li.nutrition-label-cyo-section');
  if (cyoRows.length) {
    const groupTitle = /^create your own$/i.test(name) && stationName ? `Create your own (${stationName})` : name;
    return cyoRows.map((row) => {
      const optionName = row.querySelector('.nutrition-label-cyo-ingredient')?.textContent.trim();
      const facts = row.querySelector('section.nutrition-create-your-own');
      if (!optionName || !facts) return null;
      const serving = facts.querySelector('.nutrition-serving-size')?.textContent.replace(/^\s*Serving size\s*/i, '').trim() ?? '';
      return buildItem({ id: `bu_opt_${slugOf(optionName)}_${slugOf(serving)}`, name: optionName, stationName, groupTitle, facts, overview: null, mealPeriod });
    }).filter(Boolean);
  }
  // A create-your-own line whose options did not come with it: its own figure is the maximum of every topping.
  if (wrapper.querySelector('.js-nutrition-see-options') || /varies with options/i.test(wrapper.querySelector('.menu-nodata')?.textContent ?? '')) return [];

  const overview = wrapper.querySelector('.menu-nutrition-overview');
  if (!overview?.querySelector('.menu-nutrition-cals')) return [];
  const facts = li.querySelector('section.nutrition-main') ?? li;
  return [buildItem({ id: `bu_${slugOf(name)}`, name, stationName, facts, overview, mealPeriod })];
}

/* "7:00 AM - 11:00 AM" as { start: 7, end: 11 } in hours (10:30 is 10.5), or null. */
export function buParseHours(text = '') {
  const parts = [...String(text).matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi)];
  if (parts.length < 2) return null;
  const toHours = (m) => {
    let h = parseInt(m[1], 10) % 12;
    if (m[3].toLowerCase() === 'pm') h += 12;
    return h + (m[2] ? parseInt(m[2], 10) / 60 : 0);
  };
  const start = toHours(parts[0]);
  const end = toHours(parts[1]);
  return end > start ? { start, end } : null;
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
  const hours = {};
  const day = sliceBuDay(html, dateStr);
  if (!day) return { meals, isOpen: false, hours };

  const root = parse(day);
  for (const section of root.querySelectorAll('li.menu-meal-period')) {
    const slug = section.querySelector('.js-meal-period-name')?.getAttribute('data-meal-period-slug');
    const times = section.querySelector('.js-meal-period-times')?.textContent;
    const mealPeriod = buMealPeriod(slug, times);
    if (!mealPeriod) continue;

    // When two sittings map to one meal (brunch and lunch), the meal runs from the first start to the last end.
    const span = buParseHours(times);
    if (span) hours[mealPeriod] = hours[mealPeriod] ? { start: Math.min(hours[mealPeriod].start, span.start), end: Math.max(hours[mealPeriod].end, span.end) } : span;

    for (const li of section.querySelectorAll('ol.menu-dishes > li')) {
      for (const item of parseDishes(li, mealPeriod)) {
        item.position = meals[mealPeriod].length;
        meals[mealPeriod].push(item);
      }
    }
  }
  return { meals, isOpen: Object.values(meals).some((a) => a.length > 0), hours };
}
