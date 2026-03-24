// Menu fetcher for Brandeis University dining (brandeishospitality.com)
//
// Brandeis uses a custom WordPress-based dining CMS. Menu data is embedded
// directly in the HTML of each location page as inline JSON inside hidden divs.
// This fetcher scrapes those pages and parses the data into our standard shape.
//
// CORS: In development, Vite proxies /api/dining/* → brandeishospitality.com.
//       In production, set VITE_CORS_PROXY_URL to a CORS proxy endpoint.

// Brandeis-specific configuration — easy to move to a config file later
const BRANDEIS = {
  locations: {
    sherman: {
      id: 'sherman',
      slug: 'the-farm-table-at-sherman-2',
      name: 'Farm Table at Sherman',
      shortName: 'Sherman',
    },
    usdan: {
      id: 'usdan',
      slug: 'lower-usdan',
      name: 'Usdan Kitchen',
      shortName: 'Usdan',
    },
  },
};

// Return the URL to use for a Brandeis dining location page.
// Both dev (Vite proxy) and production (Vercel serverless function) use /api/dining/*,
// so no environment variable is needed — the routing just works in both cases.
function getDiningUrl(locationSlug, dateStr) {
  return `/api/dining/locations/${locationSlug}/?date=${dateStr}`;
}

// Map a tab label (from the site) to our meal period keys.
// Returns null for periods we don't show (Light Lunch, Mid-Day Dining, etc.)
function tabLabelToMealPeriod(label) {
  const l = label.toLowerCase();
  if (l.includes('breakfast') || l.includes('brunch') || l.includes('continental')) return 'breakfast';
  if (l.includes('lunch')) return 'lunch';
  if (l.includes('dinner') || l.includes('supper')) return 'dinner';
  return null;
}

// Map a station name from the site to our internal station keys
function parseStation(stationName) {
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

// Map Brandeis preference html_attribute values to our dietary tag keys
function mapPreference(attr) {
  switch (attr) {
    case 'vegan': return ['vegan', 'vegetarian'];
    case 'vegetarian': return ['vegetarian'];
    case 'made_without_gluten': return ['glutenFree'];
    case 'dairy_free': return ['dairyFree'];
    case 'nut_free': return ['nutFree'];
    case 'halal': return ['halal'];
    case 'kosher': return ['kosher'];
    default: return [];
  }
}

// Extract a numeric nutrition value from the facts array by label
function getNutritionValue(facts, label) {
  const fact = facts.find((f) => f.label.toLowerCase().includes(label.toLowerCase()));
  return fact ? Math.round(Number(fact.value) || 0) : 0;
}

// Parse one menu item <li> element into our standard food item shape
function parseMenuItemEl(liEl, mealPeriod, stationName) {
  const link = liEl.querySelector('a.show-nutrition');
  if (!link) return null;

  const name = link.textContent.trim();
  if (!name) return null;

  // The recipe ID is in the link's data-recipe attribute
  const recipeId = link.getAttribute('data-recipe');
  const nutritionEl = recipeId
    ? liEl.querySelector(`#recipe-nutrition-${recipeId}`)
    : null;

  let nutrition = { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, fiber: 0, sugar: 0 };
  let tags = [];
  let ingredients = [];

  if (nutritionEl) {
    try {
      const data = JSON.parse(nutritionEl.textContent);
      const facts = data.facts || [];

      nutrition = {
        calories: getNutritionValue(facts, 'calorie'),
        protein: getNutritionValue(facts, 'protein'),
        carbs: getNutritionValue(facts, 'carbohydrate'),
        fat: getNutritionValue(facts, 'total fat'),
        sodium: getNutritionValue(facts, 'sodium'),
        fiber: getNutritionValue(facts, 'fiber'),
        sugar: getNutritionValue(facts, 'sugar'),
      };

      // Build dietary tags from preferences
      const tagSet = new Set();
      for (const pref of data.preferences || []) {
        for (const tag of mapPreference(pref.html_attribute)) {
          tagSet.add(tag);
        }
      }
      tags = Array.from(tagSet);

      // Parse ingredients from the ingredient list string
      if (data.ingredients_list) {
        ingredients = data.ingredients_list
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 20); // cap to avoid huge arrays
      }
    } catch {
      // Nutrition JSON malformed — continue with empty values
    }
  }

  return {
    id: `bh_${recipeId || name.replace(/\W+/g, '_').toLowerCase()}`,
    name,
    station: parseStation(stationName),
    meal: mealPeriod,
    nutrition,
    tags,
    ingredients,
  };
}

// Parse a full location page HTML string into our meals structure
function parseLocationPage(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const meals = { breakfast: [], lunch: [], dinner: [] };

  const tabsEl = doc.getElementById('menu-tabs');
  if (!tabsEl) return { meals, isOpen: false }; // Location has no menu today (e.g. Usdan on weekends)

  const tabLinks = tabsEl.querySelectorAll('.c-tabs-nav__link');
  const tabContents = tabsEl.querySelectorAll('.c-tab');

  tabLinks.forEach((link, i) => {
    const labelEl = link.querySelector('.c-tabs-nav__link-inner');
    if (!labelEl) return;

    const mealPeriod = tabLabelToMealPeriod(labelEl.textContent);
    if (!mealPeriod) return; // Skip Light Lunch, Mid-Day Dining, etc.

    const tabContent = tabContents[i];
    if (!tabContent) return;

    const stations = tabContent.querySelectorAll('.menu-station');
    stations.forEach((stationEl) => {
      const stationNameEl = stationEl.querySelector('h4');
      const stationName = stationNameEl ? stationNameEl.textContent.trim() : '';

      stationEl.querySelectorAll('li.menu-item-li').forEach((liEl) => {
        const item = parseMenuItemEl(liEl, mealPeriod, stationName);
        if (item) meals[mealPeriod].push(item);
      });
    });
  });

  return { meals, isOpen: true };
}

// Fetch and parse the menu for one location
async function fetchLocationMenu(locationConfig, dateStr) {
  const url = getDiningUrl(locationConfig.slug, dateStr);
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${locationConfig.slug}`);
  const html = await res.text();
  return parseLocationPage(html);
}

// Fetch today's full menu for all Brandeis dining locations.
// Returns the same shape as generateTodaysMenu() in mockMenu.js.
// Throws if all fetches fail — callers handle the fallback.
export async function fetchBrandeisMenu() {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0];
  const { locations } = BRANDEIS;

  const locationResults = await Promise.all(
    Object.entries(locations).map(async ([locationId, locationConfig]) => {
      try {
        const { meals, isOpen } = await fetchLocationMenu(locationConfig, dateStr);
        return [locationId, { ...locationConfig, meals, isOpen }];
      } catch (err) {
        console.warn(`Failed to fetch ${locationConfig.name}:`, err.message);
        // Fetch failure ≠ closed. Don't show "closed" just because the request failed.
        return [locationId, { ...locationConfig, meals: { breakfast: [], lunch: [], dinner: [] }, isOpen: true }];
      }
    })
  );

  const result = {
    date: dateStr,
    locations: Object.fromEntries(locationResults),
  };

  // If every location returned empty meals, the fetch effectively failed
  const totalItems = Object.values(result.locations)
    .flatMap((loc) => Object.values(loc.meals))
    .flat().length;

  if (totalItems === 0) {
    throw new Error('All location fetches returned empty menus');
  }

  return result;
}
