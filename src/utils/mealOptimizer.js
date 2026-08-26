// Meal optimization algorithm
// Uses a greedy heuristic to select meals that best match nutrition targets

import { MEAL_DISTRIBUTION, calculateMealTargets } from './tdeeCalculator.js';
import { getRole, ROLE, ACCESSORY_ROLES, isNutritionalBeverage } from './foodRoles.js';

// Structured allergens Brandeis publishes in allergens_list.
// Keys match restriction fields; values match the normalized allergens_list strings.
const STRUCTURED_ALLERGENS = [
  ['milk',      'milk'],
  ['eggs',      'eggs'],
  ['wheat',     'wheat'],
  ['soy',       'soy'],
  ['fish',      'fish'],
  ['shellfish', 'shellfish'],
  ['treeNuts',  'tree nuts'],
  ['peanuts',   'peanuts'],
  ['sesame',    'sesame'],
];

// Check if item passes hard dietary restrictions.
export function passesHardRestrictions(item, restrictions) {
  // Structured allergens — checked against item.allergens (scraped from allergens_list)
  const itemAllergens = item.allergens || [];
  for (const [key, allergenName] of STRUCTURED_ALLERGENS) {
    if (restrictions[key] && itemAllergens.includes(allergenName)) return false;
  }

  // Free-text custom allergies — checked against ingredient text as fallback
  if (restrictions.allergies && restrictions.allergies.length > 0) {
    const ingredientText = [...(item.allergens || []), ...(item.ingredients || [])].join(' ').toLowerCase();
    for (const allergen of restrictions.allergies) {
      if (ingredientText.includes(allergen.toLowerCase())) return false;
    }
  }

  // Dietary tag hard blocks (tags Brandeis actually labels)
  // vegan items satisfy vegetarian too
  if (restrictions.vegetarian && !item.tags.includes('vegetarian') && !item.tags.includes('vegan')) return false;
  if (restrictions.vegan      && !item.tags.includes('vegan'))       return false;
  if (restrictions.glutenFree && !item.tags.includes('glutenFree'))  return false;
  if (restrictions.kosher     && !item.tags.includes('kosher'))       return false;
  return true;
}

// Check soft restrictions (preferences to deprioritise but not hard-block)
export function getSoftPenalty(item, restrictions) {
  let penalty = 0;

  // Soft "prefer to avoid" ingredients
  if (restrictions.avoidIngredients && restrictions.avoidIngredients.length > 0) {
    const ingredientList = item.ingredients.join(' ').toLowerCase();
    for (const avoid of restrictions.avoidIngredients) {
      if (ingredientList.includes(avoid.toLowerCase())) penalty += 50;
    }
  }

  return penalty;
}

// Score how well an item fits the target (lower is better)
function scoreItem(item, target, currentTotals) {
  const remaining = {
    calories: target.calories - currentTotals.calories,
    protein: target.protein - currentTotals.protein,
    carbs: target.carbs - currentTotals.carbs,
    fat: target.fat - currentTotals.fat,
  };

  // Calculate how well this item fills the gap
  const calorieScore = Math.abs(remaining.calories - item.nutrition.calories);
  const proteinScore = Math.abs(remaining.protein - item.nutrition.protein) * 4; // Weight protein higher
  const carbScore = Math.abs(remaining.carbs - item.nutrition.carbs);
  const fatScore = Math.abs(remaining.fat - item.nutrition.fat);

  // Penalize going over targets more than under
  const overPenalty =
    Math.max(0, item.nutrition.calories - remaining.calories) * 2 +
    Math.max(0, item.nutrition.fat - remaining.fat) * 3;

  // Reward fiber directly. Dining-hall menus are full of near-identical sides
  // that differ mainly in fiber, and macro fitting alone treats a 9g bean
  // side as interchangeable with a 1g one.
  const fiberBonus = Math.min(item.nutrition.fiber ?? 0, 8) * 10;

  return calorieScore + proteinScore + carbScore + fatScore + overPenalty - fiberBonus;
}

// Get variety penalty based on recent history
function getVarietyPenalty(itemId, recentItemIds) {
  return recentItemIds.has(itemId) ? 100 : 0;
}

// Categorize items by type (entree, side, beverage, etc.)
function categorizeItems(items) {
  const categories = {
    entrees: [],
    sides: [],
    beverages: [],
    salads: [],
    soups: [],
    breakfast: [],
    bakery: [], // breads, rolls, pastries — sides/add-ons, not standalone entrees
  };

  for (const item of items) {
    if (item.station === 'beverage') {
      categories.beverages.push(item);
    } else if (item.station === 'soup') {
      categories.soups.push(item);
    } else if (item.station === 'salad') {
      categories.salads.push(item);
    } else if (item.station === 'sides') {
      categories.sides.push(item);
    } else if (item.station === 'breakfast') {
      categories.breakfast.push(item);
    } else if (item.station === 'bakery') {
      categories.bakery.push(item);
    } else {
      categories.entrees.push(item);
    }
  }

  return categories;
}

// Keywords used to identify the dominant protein in a dish
const PROTEIN_KEYWORDS = ['chicken', 'turkey', 'beef', 'pork', 'tuna', 'salmon', 'fish', 'shrimp', 'tofu', 'egg', 'ham', 'bacon', 'lamb', 'crab', 'lobster'];

// Extract the dominant protein from an item's name + ingredients
function extractMainProtein(item) {
  const text = [item.name, ...item.ingredients].join(' ').toLowerCase();
  for (const kw of PROTEIN_KEYWORDS) {
    if (text.includes(kw)) return kw;
  }
  return null;
}

// Penalize items that would make the overall meal feel incoherent when combined
// with already-selected items — e.g. a chicken entree + a chicken salad topping.
function getWithinMealPenalty(item, selectedItems) {
  if (selectedItems.length === 0) return 0;
  let penalty = 0;
  const itemProtein = extractMainProtein(item);
  for (const sel of selectedItems) {
    if (itemProtein && extractMainProtein(sel) === itemProtein) {
      penalty += 300; // same primary protein already in this meal
    }
  }
  return penalty;
}

// Brandeis publishes some items with every macro at zero. That is missing
// data, not an empty food, and such items must not be scored against a target.
function hasUsableNutrition(item) {
  const n = item?.nutrition ?? {};
  return (n.calories ?? 0) > 0 || (n.protein ?? 0) > 0 || (n.carbs ?? 0) > 0;
}

// Proteins people actually eat in the morning. Without this, the breakfast
// anchor is whichever protein scores best campus-wide — which is how shawarma
// beef ends up recommended at 8am.
const BREAKFAST_PROTEIN = /\b(egg|eggs|omelet|omelette|frittata|scrambled|yogurt|cottage cheese|bacon|sausage|ham|lox|smoked salmon|tofu scramble|skyr)\b/i;

// Penalize items that don't belong in the given meal context
function getMealContextPenalty(item, mealType) {
  if (!mealType) return 0;
  const s = item.station;

  if (mealType === 'breakfast' && getRole(item) === ROLE.PROTEIN && !BREAKFAST_PROTEIN.test(item.name ?? '')) {
    return 200;
  }

  if (mealType === 'breakfast') {
    // Preferred breakfast stations — no penalty
    if (['breakfast', 'bakery', 'beverage', 'allgood'].includes(s)) return 0;
    // Sides/salads/soups can occasionally appear at breakfast (e.g. fruit, yogurt toppings)
    // but should be strongly down-ranked relative to real breakfast items
    if (['sides', 'salad', 'soup'].includes(s)) return 150;
    // Full lunch/dinner stations have no place at breakfast
    if (['grill', 'deli', 'pizza', 'entree'].includes(s)) return 300;
    return 75; // Unknown station — mild penalty
  }

  if (mealType === 'lunch' || mealType === 'dinner') {
    // Breakfast-station items should not appear at lunch or dinner
    if (s === 'breakfast') return 300;
    return 0;
  }

  return 0;
}

// Bonus applied to items the user has favorited (negative = improves score)
const FAVORITE_BONUS = -80;

// Select best item from a list given constraints
function selectBestItem(items, target, currentTotals, restrictions, recentItemIds, excludeIds = new Set(), mealType = null, selectedItems = [], favoriteIds = new Set()) {
  let bestItem = null;
  let bestScore = Infinity;

  for (const item of items) {
    if (excludeIds.has(item.id)) continue;
    if (!passesHardRestrictions(item, restrictions)) continue;
    // Items published with no nutrition at all cannot be reasoned about, and
    // they score as a perfect fit for whatever budget is left — an item of
    // "zero" is always closest to a small remaining gap.
    if (!hasUsableNutrition(item)) continue;

    const baseScore = scoreItem(item, target, currentTotals);
    const softPenalty = getSoftPenalty(item, restrictions);
    const varietyPenalty = getVarietyPenalty(item.id, recentItemIds);
    const contextPenalty = getMealContextPenalty(item, mealType);
    const withinMealPenalty = getWithinMealPenalty(item, selectedItems);
    const favoriteBonus = favoriteIds.has(item.id) ? FAVORITE_BONUS : 0;
    const totalScore = baseScore + softPenalty + varietyPenalty + contextPenalty + withinMealPenalty + favoriteBonus;

    if (totalScore < bestScore) {
      bestScore = totalScore;
      bestItem = item;
    }
  }

  return bestItem;
}

// Generate explanation for why an item was selected
function generateReason(item, target, currentTotals) {
  const nutrition = item.nutrition;
  const remaining = {
    protein: target.protein - currentTotals.protein,
    carbs: target.carbs - currentTotals.carbs,
  };

  // Check what this item is good for
  if (nutrition.protein >= 15 && nutrition.protein >= remaining.protein * 0.3) {
    return 'High protein to meet your goal';
  }
  if (nutrition.fiber && nutrition.fiber >= 4) {
    return 'Good source of fiber';
  }
  if (nutrition.calories < 150 && nutrition.protein >= 5) {
    return 'Light option with protein';
  }
  if (item.tags.includes('vegan') || item.tags.includes('vegetarian')) {
    return 'Plant-based option';
  }
  if (nutrition.fat < 5 && nutrition.calories < 200) {
    return 'Low-fat choice';
  }
  if (item.station === 'allgood') {
    return 'Allergen-friendly option';
  }

  return 'Balanced nutrition';
}

// Optimize a single meal
export function optimizeMeal(availableItems, mealTarget, restrictions, recentItemIds, mealType = null, favoriteIds = new Set()) {
  const categorized = categorizeItems(availableItems);
  const selected = [];
  const currentTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const usedIds = new Set();
  const warnings = [];

  // Use explicitly passed mealType; fall back to inferring from station labels only if not provided
  const isBreakfast = mealType
    ? mealType === 'breakfast'
    : categorized.breakfast.length > 0;

  // Helper to add a selected item and update running totals
  function addItem(item, reason) {
    selected.push({ ...item, reason: reason || generateReason(item, mealTarget, currentTotals) });
    currentTotals.calories += item.nutrition.calories;
    currentTotals.protein += item.nutrition.protein;
    currentTotals.carbs += item.nutrition.carbs;
    currentTotals.fat += item.nutrition.fat;
    usedIds.add(item.id);
  }

  // Condiments and garnishes are never plate components. They are the reason a
  // balsamic vinaigrette used to win a slot: with a small calorie gap left,
  // a dressing scores better than any real food.
  const eligible = availableItems.filter(item => !ACCESSORY_ROLES.has(getRole(item)));

  // Pick the best item among the given roles. Roles are tried in order, so a
  // composed dish is preferred to a bare protein for the anchor slot.
  // `reserve` holds calories back for the slots still to be filled. Without it
  // a single 330-calorie banana bread consumes the whole breakfast budget and
  // the plate never reaches its protein target.
  function pickRole(roles, { reserve = 0 } = {}) {
    const budgetedTarget = reserve
      ? { ...mealTarget, calories: Math.max(mealTarget.calories - reserve, currentTotals.calories) }
      : mealTarget;
    for (const role of roles) {
      const pool = eligible.filter(item => getRole(item) === role);
      if (pool.length === 0) continue;
      const item = selectBestItem(pool, budgetedTarget, currentTotals, restrictions, recentItemIds, usedIds, mealType, selected, favoriteIds);
      if (item) return item;
    }
    return null;
  }

  const roomFor = fraction => currentTotals.calories < mealTarget.calories * fraction;

  // Topping up protein is not a macro-gap problem: the generic score rewards
  // whatever best fits the remaining calories, which is how a 7g cottage
  // cheese beat 22g of chicken. Here the most protein that still fits wins.
  function pickProteinTopUp() {
    const remaining = mealTarget.calories - currentTotals.calories;
    let best = null;
    for (const item of eligible) {
      if (usedIds.has(item.id)) continue;
      if (getRole(item) !== ROLE.PROTEIN) continue;
      if (!hasUsableNutrition(item)) continue;
      if (!passesHardRestrictions(item, restrictions)) continue;
      if (getMealContextPenalty(item, mealType) >= 200) continue;
      if (getWithinMealPenalty(item, selected) > 0) continue;
      if (item.nutrition.calories > remaining * 1.15) continue;
      if (!best || item.nutrition.protein > best.nutrition.protein) best = item;
    }
    return best;
  }

  if (isBreakfast) {
    // Breakfast is anchored on protein — eggs, yogurt, cottage cheese — so a
    // pastry can never become the centrepiece of the meal.
    const anchor = pickRole([ROLE.PROTEIN, ROLE.COMPOSED], { reserve: 150 });
    if (anchor) addItem(anchor);

    // Protein is brought to a floor before any calories go to carbohydrate.
    // Filling the grain slot first lets a large pastry take the whole budget.
    if (currentTotals.protein < mealTarget.protein * 0.6) {
      const more = pickProteinTopUp();
      if (more) addItem(more);
    }

    const grain = pickRole([ROLE.GRAIN], { reserve: 80 });
    if (grain) addItem(grain);

    const produce = pickRole([ROLE.FRUIT, ROLE.VEGETABLE]);
    if (produce) addItem(produce);
  } else {
    // Lunch and dinner: an anchor, a vegetable, and a carbohydrate. The
    // structure is filled first and the macro fit decides which item within
    // each role — not whether the role gets filled at all.
    const anchor = pickRole([ROLE.COMPOSED, ROLE.PROTEIN]);
    if (anchor) addItem(anchor);
    const anchorRole = anchor ? getRole(anchor) : null;

    // A vegetable goes on every plate, even when the calorie budget is tight.
    const vegetable = pickRole([ROLE.VEGETABLE]);
    if (vegetable) addItem(vegetable);

    // Protein floor before carbohydrate, for the same reason as breakfast.
    if (currentTotals.protein < mealTarget.protein * 0.7) {
      const more = pickProteinTopUp();
      if (more) addItem(more);
    }

    // A composed dish already carries its carbohydrate, so only add a grain
    // when the anchor was a bare protein or carbs are still well short.
    const needsGrain = anchorRole !== ROLE.COMPOSED
      || currentTotals.carbs < mealTarget.carbs * 0.5;
    if (needsGrain) {
      const grain = pickRole([ROLE.GRAIN]);
      if (grain) addItem(grain);
    }

    // Soup or fruit rounds the meal out only if real room remains.
    if (roomFor(0.7)) {
      const extra = pickRole([ROLE.SOUP, ROLE.FRUIT]);
      if (extra) addItem(extra);
    }
  }

  // A beverage earns a slot only when it carries nutrition — milk or a protein
  // smoothie. Water and black coffee are not a recommendation.
  const beverages = eligible.filter(item => getRole(item) === ROLE.BEVERAGE && isNutritionalBeverage(item));
  if (beverages.length > 0 && roomFor(0.9)) {
    const beverage = selectBestItem(beverages, mealTarget, currentTotals, restrictions, recentItemIds, usedIds, mealType, selected, favoriteIds);
    if (beverage) addItem(beverage, 'Beverage');
  }

  // Dessert is only ever an extra: the plate must already be complete and the
  // calories must genuinely fit.
  const hasStructure = selected.some(i => {
    const r = getRole(i);
    return r === ROLE.PROTEIN || r === ROLE.COMPOSED;
  });
  if (hasStructure && roomFor(0.8)) {
    const dessertPool = eligible.filter(item => getRole(item) === ROLE.DESSERT);
    const dessert = selectBestItem(dessertPool, mealTarget, currentTotals, restrictions, recentItemIds, usedIds, mealType, selected, favoriteIds);
    if (dessert && currentTotals.calories + dessert.nutrition.calories <= mealTarget.calories * 1.05) {
      addItem(dessert, 'Fits your remaining calories');
    }
  }

  // Check if we hit targets reasonably
  const caloriePercent = (currentTotals.calories / mealTarget.calories) * 100;
  const proteinPercent = (currentTotals.protein / mealTarget.protein) * 100;

  if (selected.length === 0) {
    warnings.push('No items available for this meal at this location');
  } else {
    if (caloriePercent < 70) {
      warnings.push(`Meal is under calorie target (${Math.round(caloriePercent)}%)`);
    } else if (caloriePercent > 130) {
      warnings.push(`Meal exceeds calorie target (${Math.round(caloriePercent)}%)`);
    }
    if (proteinPercent < 60) {
      warnings.push('Consider adding protein-rich foods');
    }

    // Structure is prioritised over hitting macros exactly, so when the hall
    // genuinely has no vegetable to offer, say so rather than quietly
    // shipping a plate without one.
    const rolesOnPlate = new Set(selected.map(getRole));
    if (!rolesOnPlate.has(ROLE.VEGETABLE) && !rolesOnPlate.has(ROLE.SOUP)) {
      warnings.push('No vegetable side available at this location right now');
    }

    // Halal is not labeled by Brandeis — warn when active
    if (restrictions.halal) {
      warnings.push('Brandeis Dining doesn\'t label halal items — always verify with dining staff');
    }
  }

  return {
    items: selected,
    totals: currentTotals,
    target: mealTarget,
    warnings,
  };
}

// Find best alternative for an item
export function findAlternative(currentItem, availableItems, mealTarget, currentMealTotals, restrictions, recentItemIds, excludeIds) {
  // Remove current item's contribution from totals
  const totalsWithoutItem = {
    calories: currentMealTotals.calories - currentItem.nutrition.calories,
    protein: currentMealTotals.protein - currentItem.nutrition.protein,
    carbs: currentMealTotals.carbs - currentItem.nutrition.carbs,
    fat: currentMealTotals.fat - currentItem.nutrition.fat,
  };

  // Offer a swap that plays the same part in the meal. Matching on role rather
  // than station keeps a chicken entree swapping for other mains instead of
  // for whatever shares its dining-hall station label — which, at the salad
  // bar, means dressings and shredded cheese.
  const usable = availableItems.filter(item => !ACCESSORY_ROLES.has(getRole(item)));
  const currentRole = getRole(currentItem);
  const sameRole = usable.filter(item => getRole(item) === currentRole);
  const candidates = sameRole.length > 1 ? sameRole : usable;

  const allExcluded = new Set([...excludeIds, currentItem.id]);
  const alternative = selectBestItem(candidates, mealTarget, totalsWithoutItem, restrictions, recentItemIds, allExcluded);

  if (alternative) {
    return {
      ...alternative,
      reason: generateReason(alternative, mealTarget, totalsWithoutItem),
    };
  }

  return null;
}

// Find multiple ranked alternatives for an item (for dropdown display)
export function findAlternatives(currentItem, availableItems, mealTarget, currentMealTotals, restrictions, recentItemIds, excludeIds, count = 4) {
  const results = [];
  const cumExcludeIds = new Set(excludeIds);

  for (let i = 0; i < count; i++) {
    const alt = findAlternative(currentItem, availableItems, mealTarget, currentMealTotals, restrictions, recentItemIds, cumExcludeIds);
    if (!alt) break;
    results.push(alt);
    cumExcludeIds.add(alt.id);
  }

  return results;
}

// Find personalized recommended additions for a meal (e.g. a 3rd item)
// Uses the same scoring/penalty logic as the main optimizer, applied to the
// remaining macro budget after existing items are already on the plate.
export function findRecommendedAdditions(availableItems, mealTarget, currentTotals, restrictions, recentItemIds, excludeIds, mealType = null, selectedItems = [], count = 3, favoriteIds = new Set()) {
  const results = [];
  const cumExcludeIds = new Set(excludeIds);

  // Suggestions were dominated by 10-calorie salad-bar toppings, because with
  // a nearly-full plate the smallest thing on the menu is the closest macro
  // fit. Drop accessories, then lead with whatever the plate is actually
  // missing before falling back to a general best fit.
  const usable = availableItems.filter(item => !ACCESSORY_ROLES.has(getRole(item)));
  const rolesOnPlate = new Set(selectedItems.map(getRole));
  const missingRoles = [ROLE.PROTEIN, ROLE.VEGETABLE, ROLE.GRAIN].filter(role => {
    if (role === ROLE.PROTEIN) return !rolesOnPlate.has(ROLE.PROTEIN) && !rolesOnPlate.has(ROLE.COMPOSED);
    if (role === ROLE.GRAIN) return !rolesOnPlate.has(ROLE.GRAIN) && !rolesOnPlate.has(ROLE.COMPOSED);
    return !rolesOnPlate.has(role);
  });

  for (let i = 0; i < count; i++) {
    // Each pass re-checks which roles are still missing, so the suggestions
    // fill the gaps in order rather than offering three of the same thing.
    const stillMissing = missingRoles.filter(role => !results.some(r => getRole(r) === role));
    let pool = usable;
    if (stillMissing.length > 0) {
      const gapPool = usable.filter(item => stillMissing.includes(getRole(item)));
      if (gapPool.length > 0) pool = gapPool;
    }

    const candidate = selectBestItem(
      pool,
      mealTarget,
      currentTotals,
      restrictions,
      recentItemIds,
      cumExcludeIds,
      mealType,
      selectedItems,
      favoriteIds
    );
    if (!candidate) break;
    results.push({
      ...candidate,
      reason: generateReason(candidate, mealTarget, currentTotals),
    });
    cumExcludeIds.add(candidate.id);
  }

  return results;
}

// Optimize full day across all meals — works with any set of location IDs.
export function optimizeDay(menu, nutritionTargets, restrictions, recentItemIds, mealDistribution = MEAL_DISTRIBUTION, favoriteIds = new Set()) {
  const mealTargets  = calculateMealTargets(nutritionTargets, mealDistribution);
  const locationIds  = Object.keys(menu.locations ?? {});

  const result = {
    ...Object.fromEntries(locationIds.map(id => [id, {}])),
    dailyTotals: Object.fromEntries(locationIds.map(id => [id, { calories: 0, protein: 0, carbs: 0, fat: 0 }])),
    targets:  nutritionTargets,
    warnings: [],
  };

  // Accumulate items used across meals today so later meals (dinner) avoid the
  // same picks as earlier ones (lunch). Starts with history-based recent items.
  const dailyUsedIds = new Set(recentItemIds);

  for (const meal of ['breakfast', 'lunch', 'dinner']) {
    for (const locId of locationIds) {
      const locMeals = menu.locations[locId]?.meals;
      if (!locMeals?.[meal]) continue;

      const locResult = optimizeMeal(
        locMeals[meal],
        mealTargets[meal],
        restrictions,
        dailyUsedIds,
        meal,
        favoriteIds
      );
      result[locId][meal] = locResult;
      locResult.items.forEach(item => dailyUsedIds.add(item.id));

      result.dailyTotals[locId].calories += locResult.totals.calories;
      result.dailyTotals[locId].protein  += locResult.totals.protein;
      result.dailyTotals[locId].carbs    += locResult.totals.carbs;
      result.dailyTotals[locId].fat      += locResult.totals.fat;
    }
  }

  return result;
}
