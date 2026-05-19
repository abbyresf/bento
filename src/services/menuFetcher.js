// Generic dining menu fetcher.
//
// fetchDiningMenu(config) accepts a university config object and returns menus
// in the standard shape. See BRANDEIS_CONFIG below for the expected shape.
//
// CORS: In development, Vite proxies /api/dining/* → brandeishospitality.com.
//       In production, a Vercel serverless function handles the same path.

// ── Brandeis helpers ──────────────────────────────────────────────────────────

function brandeisTabLabelToMealPeriod(label) {
  const l = label.toLowerCase();
  if (l.includes('breakfast') || l.includes('brunch') || l.includes('continental')) return 'breakfast';
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
    tags,
    ingredients,
    allergens,
  };
}

function brandeisParseLocationPage(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
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

// ── Brandeis config ───────────────────────────────────────────────────────────

export const BRANDEIS_CONFIG = {
  locations: {
    sherman: {
      id: 'sherman',
      slug: 'the-farm-table-at-sherman-2',
      name: 'Farm Table at Sherman',
      shortName: 'Farm Table',
    },
    usdan: {
      id: 'usdan',
      slug: 'lower-usdan',
      name: 'Usdan Kitchen',
      shortName: 'Usdan',
    },
    kosher: {
      id: 'kosher',
      slug: 'the-farm-table-at-sherman',
      name: 'Kosher Table at Sherman',
      shortName: 'Kosher',
      allItemsKosher: true,
    },
  },
  getDiningUrl(slug, dateStr) {
    return `/api/dining/locations/${slug}/?date=${dateStr}`;
  },
  parseLocationPage: brandeisParseLocationPage,
};

// ── Generic fetcher ───────────────────────────────────────────────────────────

// Fetch today's full menu for all locations defined in config.
// Returns the same shape as generateTodaysMenu() in mockMenu.js.
// Throws if all fetches return empty menus — callers handle the fallback.
export async function fetchDiningMenu(config) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const locationResults = await Promise.all(
    Object.entries(config.locations).map(async ([locationId, locationConfig]) => {
      try {
        const url = config.getDiningUrl(locationConfig.slug, dateStr);
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${locationConfig.slug}`);
        const html = await res.text();
        const { meals, isOpen } = config.parseLocationPage(html);
        // Force-tag every item from an allItemsKosher location so the optimizer
        // can safely include them for kosher dietary restrictions.
        if (locationConfig.allItemsKosher) {
          Object.values(meals).forEach(items =>
            items.forEach(item => { if (!item.tags.includes('kosher')) item.tags.push('kosher'); })
          );
        }
        return [locationId, { ...locationConfig, meals, isOpen }];
      } catch (err) {
        console.warn(`Failed to fetch ${locationConfig.name}:`, err.message);
        return [locationId, { ...locationConfig, meals: { breakfast: [], lunch: [], dinner: [] }, isOpen: true }];
      }
    })
  );

  const result = {
    date: dateStr,
    locations: Object.fromEntries(locationResults),
  };

  const totalItems = Object.values(result.locations)
    .flatMap((loc) => Object.values(loc.meals))
    .flat().length;

  if (totalItems === 0) {
    throw new Error('All location fetches returned empty menus');
  }

  return result;
}

// Convenience wrapper — existing callers don't need to change
export const fetchBrandeisMenu = () => fetchDiningMenu(BRANDEIS_CONFIG);
