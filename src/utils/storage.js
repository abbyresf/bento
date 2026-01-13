// LocalStorage utilities for NutriRecs

const KEYS = {
  USER_PROFILE: 'nutrirecs_user_profile',
  NUTRITION_TARGETS: 'nutrirecs_nutrition_targets',
  DIETARY_RESTRICTIONS: 'nutrirecs_dietary_restrictions',
  MEAL_HISTORY: 'nutrirecs_meal_history',
  CACHED_MENU: 'nutrirecs_cached_menu',
  ONBOARDING_COMPLETE: 'nutrirecs_onboarding_complete',
};

// Generic storage functions
function getItem(key) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (e) {
    console.error('Error reading from localStorage:', e);
    return null;
  }
}

function setItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('Error writing to localStorage:', e);
    return false;
  }
}

function removeItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.error('Error removing from localStorage:', e);
    return false;
  }
}

// User Profile
export function getUserProfile() {
  return getItem(KEYS.USER_PROFILE);
}

export function setUserProfile(profile) {
  return setItem(KEYS.USER_PROFILE, profile);
}

// Nutrition Targets
export function getNutritionTargets() {
  return getItem(KEYS.NUTRITION_TARGETS);
}

export function setNutritionTargets(targets) {
  return setItem(KEYS.NUTRITION_TARGETS, targets);
}

// Dietary Restrictions
export function getDietaryRestrictions() {
  return getItem(KEYS.DIETARY_RESTRICTIONS) || {
    vegetarian: false,
    vegan: false,
    glutenFree: false,
    dairyFree: false,
    nutFree: false,
    halal: false,
    kosher: false,
    allergies: [],
    avoidIngredients: [],
  };
}

export function setDietaryRestrictions(restrictions) {
  return setItem(KEYS.DIETARY_RESTRICTIONS, restrictions);
}

// Meal History (for variety tracking)
export function getMealHistory() {
  const history = getItem(KEYS.MEAL_HISTORY) || [];
  // Filter to last 14 days
  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  return history.filter((entry) => entry.timestamp > twoWeeksAgo);
}

export function addMealToHistory(mealItems) {
  const history = getMealHistory();
  history.push({
    timestamp: Date.now(),
    items: mealItems,
  });
  return setItem(KEYS.MEAL_HISTORY, history);
}

export function clearMealHistory() {
  return removeItem(KEYS.MEAL_HISTORY);
}

// Get recently eaten item IDs (for variety penalty)
export function getRecentItemIds() {
  const history = getMealHistory();
  const itemIds = new Set();
  history.forEach((entry) => {
    entry.items.forEach((item) => itemIds.add(item.id));
  });
  return itemIds;
}

// Cached Menu
export function getCachedMenu() {
  const cached = getItem(KEYS.CACHED_MENU);
  if (!cached) return null;

  // Check if cache is from today
  const today = new Date().toDateString();
  if (cached.date === today) {
    return cached.menu;
  }
  return null;
}

export function setCachedMenu(menu) {
  return setItem(KEYS.CACHED_MENU, {
    date: new Date().toDateString(),
    menu,
  });
}

// Onboarding Status
export function isOnboardingComplete() {
  return getItem(KEYS.ONBOARDING_COMPLETE) === true;
}

export function setOnboardingComplete(complete) {
  return setItem(KEYS.ONBOARDING_COMPLETE, complete);
}

// Clear all data
export function clearAllData() {
  Object.values(KEYS).forEach(removeItem);
}
