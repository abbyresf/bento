/* The Brandeis menu parser, shared by the browser and the API.
 *
 * This used to live only in the browser, which meant every student downloaded
 * 17.9 MB of dining-hall HTML per app open and ran DOMParser over it on the
 * main thread. On a phone that is seconds of blocking work and well over
 * 100 MB of DOM, and an iOS PWA gets evicted for far less. It presented as
 * "Fetching today's menu" hanging forever.
 *
 * The logic is identical on both sides on purpose: one module, two callers, so
 * the server cannot quietly drift from what the client used to produce.
 *
 *   browser   new DOMParser().parseFromString(html, 'text/html')
 *   API       parse(html) from node-html-parser
 *
 * Both expose getElementById, querySelector, querySelectorAll, textContent and
 * getAttribute, which is everything used below. Nothing here may reach for a
 * browser global.
 */

import { parseServingSize } from '../utils/servingSize.js';

// Between the three real meal services Brandeis runs a rolling snack counter:
// "Continental (10am-11am)" on weekdays, "Mid-Day Dining (2:30pm-5pm)", and
// "Light Lunch (2:30pm-5pm)" at weekends. They are fruit, yogurt and cottage
// cheese rather than a meal, and they do not belong on a breakfast or lunch
// plate. Matched before anything else, because "Light Lunch" contains the word
// "lunch" and was being counted as lunch, and "Continental" was explicitly
// mapped to breakfast.
const BRANDEIS_SNACK_SERVICE = /continental|mid-?day|light lunch/;

// "Brunch (9:30am-11am)" and "Brunch (11am-2:30pm)" both run on a Saturday and
// they are not the same meal. The label carries the start time, so use it:
// before 11am is the breakfast sitting, 11am onwards is the lunch sitting.
// Mapping both to breakfast, as this did, left Saturday with no lunch at all.
function labelStartHour(label) {
  const m = label.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const meridiem = m[3].toLowerCase();
  if (meridiem === 'pm' && hour !== 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return hour + (m[2] ? parseInt(m[2], 10) / 60 : 0);
}

function brandeisTabLabelToMealPeriod(label) {
  const l = label.toLowerCase();

  if (BRANDEIS_SNACK_SERVICE.test(l)) return null;

  if (l.includes('brunch')) {
    const start = labelStartHour(l);
    return start !== null && start >= 11 ? 'lunch' : 'breakfast';
  }

  if (l.includes('breakfast')) return 'breakfast';
  if (l.includes('lunch')) return 'lunch';
  if (l.includes('dinner') || l.includes('supper')) return 'dinner';
  return null;
}

function brandeisParseStation(stationName) {
  const s = stationName.toLowerCase();
  if (s.includes('allgood') && s.includes('salad')) return 'salad';
  if (s.includes('allgood')) return 'allgood';
  if (s.includes('grill') || s.includes('hearth')) return 'grill';
  if (s.includes('deli') || s.includes('sandwich')) return 'deli';
  if (s.includes('salad') || s.includes('greens') || s.includes('produce')) return 'salad';
  if (s.includes('soup')) return 'soup';
  if (s.includes('grain') || s.includes('rice') || s.includes('side') || s.includes('starch')) return 'sides';
  if (s.includes('beverage') || s.includes('drink') || s.includes('coffee') || s.includes('juice')) return 'beverage';
  if (s.includes('bakery') || s.includes('dessert') || s.includes('pastry') || s.includes('chobani')) return 'bakery';
  if (s.includes('breakfast') || s.includes('morning') || s.includes('egg') || s.includes('waffle')) return 'breakfast';
  if (s.includes('pizza') || s.includes('oven')) return 'pizza';
  return 'entree';
}

function brandeisMapPreference(attr) {
  switch (attr) {
    case 'vegan':              return ['vegan', 'vegetarian'];
    case 'vegetarian':         return ['vegetarian'];
    case 'made_without_gluten': return ['glutenFree'];
    case 'dairy_free':         return ['dairyFree'];
    case 'nut_free':           return ['nutFree'];
    case 'halal':              return ['halal'];
    case 'kosher':             return ['kosher'];
    default:                   return [];
  }
}

function getNutritionValue(facts, label) {
  const fact = facts.find((f) => f.label.toLowerCase().includes(label.toLowerCase()));
  return fact ? Math.round(Number(fact.value) || 0) : 0;
}

function brandeisParseMenuItemEl(liEl, mealPeriod, stationName) {
  const link = liEl.querySelector('a.show-nutrition');
  if (!link) return null;

  const name = link.textContent.trim();
  if (!name) return null;

  const recipeId = link.getAttribute('data-recipe');
  const nutritionEl = recipeId ? liEl.querySelector(`#recipe-nutrition-${recipeId}`) : null;

  let nutrition = { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, fiber: 0, sugar: 0 };
  let tags = [];
  let ingredients = [];
  let allergens = [];
  // { amount, unit, label } or null. Absent on roughly 6% of dishes, so every
  // consumer has to cope with null rather than assume it is there.
  let serving = null;

  if (nutritionEl) {
    try {
      const data = JSON.parse(nutritionEl.textContent);
      const facts = data.facts || [];

      nutrition = {
        calories: getNutritionValue(facts, 'calorie'),
        protein:  getNutritionValue(facts, 'protein'),
        carbs:    getNutritionValue(facts, 'carbohydrate'),
        fat:      getNutritionValue(facts, 'total fat'),
        sodium:   getNutritionValue(facts, 'sodium'),
        fiber:    getNutritionValue(facts, 'fiber'),
        sugar:    getNutritionValue(facts, 'sugar'),
      };

      const tagSet = new Set();
      for (const pref of data.preferences || []) {
        for (const tag of brandeisMapPreference(pref.html_attribute)) tagSet.add(tag);
      }
      tags = Array.from(tagSet);

      if (data.ingredients_list) {
        ingredients = data.ingredients_list
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 20);
      }

      serving = parseServingSize(data.serving_size);

      if (data.allergens_list) {
        allergens = data.allergens_list
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
      }
    } catch {
      // Nutrition JSON malformed — continue with empty values
    }
  }

  return {
    id: `bh_${recipeId || name.replace(/\W+/g, '_').toLowerCase()}`,
    name,
    station: brandeisParseStation(stationName),
    meal: mealPeriod,
    nutrition,
    serving,
    tags,
    ingredients,
    allergens,
  };
}

/**
 * @param doc a parsed document: a DOM Document, or a node-html-parser root.
 */
export function parseBrandeisDoc(doc) {
  const meals = { breakfast: [], lunch: [], dinner: [] };

  const tabsEl = doc.getElementById('menu-tabs');
  if (!tabsEl) return { meals, isOpen: false };

  const tabLinks = tabsEl.querySelectorAll('.c-tabs-nav__link');
  const tabContents = tabsEl.querySelectorAll('.c-tab');

  tabLinks.forEach((link, i) => {
    const labelEl = link.querySelector('.c-tabs-nav__link-inner');
    if (!labelEl) return;

    const mealPeriod = brandeisTabLabelToMealPeriod(labelEl.textContent);
    if (!mealPeriod) return;

    const tabContent = tabContents[i];
    if (!tabContent) return;

    tabContent.querySelectorAll('.menu-station').forEach((stationEl) => {
      const stationNameEl = stationEl.querySelector('h4');
      const stationName = stationNameEl ? stationNameEl.textContent.trim() : '';

      stationEl.querySelectorAll('li.menu-item-li').forEach((liEl) => {
        const item = brandeisParseMenuItemEl(liEl, mealPeriod, stationName);
        if (item) meals[mealPeriod].push(item);
      });
    });
  });

  return { meals, isOpen: true };
}
