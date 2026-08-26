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
      name: 'Sherman Dining Hall',
      shortName: 'Sherman',
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

// Fetch the full menu for all locations defined in config.
// dateStr — optional YYYY-MM-DD; defaults to today.
// Throws if all fetches return empty menus — callers handle the fallback.
export async function fetchDiningMenu(config, dateStr = null) {
  if (!dateStr) {
    const now = new Date();
    dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

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

  const locations = Object.fromEntries(locationResults);

  // Merge kosher table into sherman so students can build a plate from both
  // without switching locations. Kosher items are already tagged 'kosher'.
  if (locations.kosher && locations.sherman) {
    for (const period of ['breakfast', 'lunch', 'dinner']) {
      locations.sherman.meals[period] = [
        ...(locations.sherman.meals[period] ?? []),
        ...(locations.kosher.meals[period] ?? []),
      ];
    }
    locations.sherman.isOpen = locations.sherman.isOpen || locations.kosher.isOpen;
    delete locations.kosher;
  }

  const result = {
    date: dateStr,
    locations,
  };

  // Only treat as a hard failure if every location came back from the catch block
  // (isOpen: true with empty meals = fetch error). If at least one location returned
  // isOpen: false, the server responded normally — halls are just closed.
  const allFailed = Object.values(result.locations).every(
    loc => loc.isOpen === true &&
      loc.meals.breakfast.length === 0 &&
      loc.meals.lunch.length === 0 &&
      loc.meals.dinner.length === 0
  );

  if (allFailed) {
    throw new Error('All location fetches returned empty menus');
  }

  return result;
}

export const fetchBrandeisMenu = (dateStr = null) => fetchDiningMenu(BRANDEIS_CONFIG, dateStr);

// ── Tufts helpers ─────────────────────────────────────────────────────────────

// Maps a Nutrislice icon slug/help_text to a Bento allergen key.
// Returns null if the slug is not a recognized allergen.
function tuftsMapAllergen(slug) {
  switch (slug) {
    case 'milk':       return 'milk';
    case 'egg':        return 'eggs';
    case 'soy':        return 'soy';
    case 'gluten':
    case 'wheat':      return 'wheat';
    case 'fish':       return 'fish';
    case 'shellfish':  return 'shellfish';
    case 'tree-nuts':
    case 'tree_nuts':
    case 'treenuts':   return 'treeNuts';
    case 'peanuts':
    case 'peanut':     return 'peanuts';
    case 'sesame':     return 'sesame';
    default:           return null;
  }
}

// Maps a Nutrislice icon slug to a Bento dietary tag.
// Returns null if it's not a recognized dietary tag.
function tuftsMapTag(slug, helpText) {
  const h = helpText.toLowerCase();
  if (slug === 'vegan'         || h.includes('vegan'))        return ['vegan', 'vegetarian'];
  if (slug === 'vegetarian'    || h.includes('vegetarian'))   return ['vegetarian'];
  if (slug === 'halal'         || h.includes('halal'))        return ['halal'];
  if (slug === 'kosher'        || h.includes('kosher'))       return ['kosher'];
  if (slug === 'gluten-free'   || h.includes('gluten-free') || h.includes('gluten free')) return ['glutenFree'];
  if (slug === 'dairy-free'    || h.includes('dairy-free')  || h.includes('dairy free'))  return ['dairyFree'];
  if (slug === 'nut-free'      || h.includes('nut-free')    || h.includes('nut free'))    return ['nutFree'];
  return null;
}

function tuftsParseStation(foodCategory) {
  const s = (foodCategory ?? '').toLowerCase();
  if (s.includes('grill'))                                            return 'grill';
  if (s.includes('deli') || s.includes('sandwich'))                  return 'deli';
  if (s.includes('salad') || s.includes('greens'))                   return 'salad';
  if (s.includes('soup'))                                             return 'soup';
  if (s.includes('side') || s.includes('grain') || s.includes('rice')) return 'sides';
  if (s.includes('beverage') || s.includes('drink'))                 return 'beverage';
  if (s.includes('bakery') || s.includes('dessert') || s.includes('pastry')) return 'bakery';
  if (s.includes('breakfast') || s.includes('egg') || s.includes('waffle')) return 'breakfast';
  if (s.includes('pizza'))                                            return 'pizza';
  return 'entree';
}

function tuftsParseFood(food, mealPeriod) {
  const n = food.rounded_nutrition_info ?? {};
  const foodIcons = food.icons?.food_icons ?? [];

  const tagSet = new Set();
  const allergens = [];

  for (const icon of foodIcons) {
    const slug     = (icon.slug ?? '').toLowerCase();
    const helpText = icon.help_text ?? '';
    // behavior === 1 and help_text starts with "Contains" → allergen
    if (icon.behavior === 1 || helpText.toLowerCase().startsWith('contains')) {
      const allergen = tuftsMapAllergen(slug);
      if (allergen) allergens.push(allergen);
    } else {
      const tags = tuftsMapTag(slug, helpText);
      if (tags) tags.forEach(t => tagSet.add(t));
    }
  }

  return {
    id:        `tu_${food.id ?? food.name.replace(/\W+/g, '_').toLowerCase()}`,
    name:      food.name,
    station:   tuftsParseStation(food.food_category),
    meal:      mealPeriod,
    nutrition: {
      calories: Math.round(n.calories  ?? 0),
      protein:  Math.round(n.g_protein ?? 0),
      carbs:    Math.round(n.g_carbs   ?? 0),
      fat:      Math.round(n.g_fat     ?? 0),
      sodium:   Math.round(n.mg_sodium ?? 0),
      fiber:    Math.round(n.g_fiber   ?? 0),
      sugar:    Math.round(n.g_sugar   ?? 0),
    },
    tags:        Array.from(tagSet),
    ingredients: [],
    allergens,
  };
}

// Parses the combined JSON response from /api/tufts.
// The response shape is: { date, slug, meals: { breakfast: [food], lunch: [food], dinner: [food] } }
function tuftsParseLocationPage(json) {
  const meals = { breakfast: [], lunch: [], dinner: [] };
  let data;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return { meals, isOpen: false };
  }

  for (const period of ['breakfast', 'lunch', 'dinner']) {
    const foods = data.meals?.[period] ?? [];
    for (const food of foods) {
      if (food?.name) meals[period].push(tuftsParseFood(food, period));
    }
  }

  const isOpen = Object.values(meals).some(arr => arr.length > 0);
  return { meals, isOpen };
}

// ── Tufts config ──────────────────────────────────────────────────────────────

export const TUFTS_CONFIG = {
  locations: {
    carmichael: {
      id:        'carmichael',
      slug:      'carmichael-dining-hall',
      name:      'Carmichael Dining Hall',
      shortName: 'Carmichael',
      allItemsKosher: false,
    },
    dewick: {
      id:        'dewick',
      slug:      'dewick-dining',
      name:      'Dewick-MacPhie Dining Hall',
      shortName: 'Dewick',
      allItemsKosher: false,
    },
  },
  getDiningUrl(slug, dateStr) {
    return `/api/tufts?slug=${slug}&date=${dateStr}`;
  },
  parseLocationPage: tuftsParseLocationPage,
};

// ── University router ─────────────────────────────────────────────────────────

export function getUniversityConfig(universityId) {
  switch (universityId) {
    case 'tufts':    return TUFTS_CONFIG;
    case 'brandeis':
    default:         return BRANDEIS_CONFIG;
  }
}

export const fetchTuftsMenu = (dateStr = null) => fetchDiningMenu(TUFTS_CONFIG, dateStr);
