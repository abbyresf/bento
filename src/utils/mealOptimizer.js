// Meal optimization algorithm
// Uses a greedy heuristic to select meals that best match nutrition targets

import { MEAL_DISTRIBUTION, calculateMealTargets } from './tdeeCalculator';

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

  return calorieScore + proteinScore + carbScore + fatScore + overPenalty;
}

// Get variety penalty based on recent history
function getVarietyPenalty(itemId, recentItemIds) {
  return recentItemIds.has(itemId) ? 100 : 0;
}

// Returns true for items that are toppings/add-ons rather than standalone meal items.
// These should only be included after a substantial main item is already selected,
// never as the primary pick (e.g. pumpkin seeds, chia seeds, flax seeds).
function isSupplementItem(item) {
  return item.nutrition.calories < 80 && item.nutrition.protein < 3;
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

// Returns true for salad-station items that are raw protein toppings rather than
// complete salad dishes (e.g. "Sliced Grilled Chicken" at the salad bar).
// These shouldn't be recommended as a standalone salad component.
function isSaladTopping(item) {
  if (item.station !== 'salad') return false;
  // A real salad dish has meaningful carbs or fiber
  if (item.nutrition.carbs >= 8 || (item.nutrition.fiber ?? 0) >= 2) return false;
  // High-protein, low-carb/fiber salad-bar items are protein toppings
  return item.nutrition.protein >= 8;
}

// Penalize items that don't belong in the given meal context
function getMealContextPenalty(item, mealType) {
  if (!mealType) return 0;
  const s = item.station;

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

  if (isBreakfast) {
    // Breakfast: pick 1-2 substantial main items first, then optionally one supplement.
    // "Main" = not a supplement (not a topping/add-on with trivial calories/protein).
    // This prevents pumpkin seeds / chia seeds from being the primary recommendation.
    const mainPool = availableItems.filter((item) => !isSupplementItem(item));
    const supplementPool = availableItems.filter((item) => isSupplementItem(item));

    // Pick up to 2 main items, then a 3rd if still well under target
    for (let i = 0; i < 2; i++) {
      const item = selectBestItem(mainPool, mealTarget, currentTotals, restrictions, recentItemIds, usedIds, 'breakfast', selected, favoriteIds);
      if (item) addItem(item);
    }
    if (selected.length > 0 && currentTotals.calories < mealTarget.calories * 0.6) {
      const item = selectBestItem(mainPool, mealTarget, currentTotals, restrictions, recentItemIds, usedIds, 'breakfast', selected, favoriteIds);
      if (item) addItem(item);
    }

    // Only add a supplement (e.g. seeds on top of yogurt/oatmeal) if we already have
    // at least one main and still have meaningful calorie headroom
    if (selected.length > 0 && currentTotals.calories < mealTarget.calories * 0.75) {
      const supp = selectBestItem(supplementPool, mealTarget, currentTotals, restrictions, recentItemIds, usedIds, 'breakfast', selected, favoriteIds);
      if (supp) addItem(supp);
    }

    // Add beverage
    const beverage = selectBestItem(categorized.beverages, mealTarget, currentTotals, restrictions, recentItemIds, usedIds, 'breakfast', selected, favoriteIds);
    if (beverage) addItem(beverage, 'Beverage');
  } else {
    // Lunch/Dinner: 1 entree + optional side + optional salad/soup + optional bread + beverage.
    // Bakery items (rolls, bread) are never entrees — they only appear as an extra alongside a real entree.
    // Supplement-type items are skipped entirely for lunch/dinner.

    // 1. Select entree (entrees pool already excludes bakery since categorizeItems splits them)
    const entree = selectBestItem(categorized.entrees, mealTarget, currentTotals, restrictions, recentItemIds, usedIds, mealType, selected, favoriteIds);
    if (entree) addItem(entree);

    // 2. Select side
    const side = selectBestItem(categorized.sides, mealTarget, currentTotals, restrictions, recentItemIds, usedIds, mealType, selected, favoriteIds);
    if (side) addItem(side);

    // 3. Add salad if room in calorie budget.
    // Prefer complete salad dishes (have carbs/fiber) over bare protein toppings
    // like "Sliced Grilled Chicken" — those are salad-bar add-ons, not meals.
    if (currentTotals.calories < mealTarget.calories * 0.7) {
      const completeSalads = categorized.salads.filter((item) => !isSaladTopping(item));
      const saladPool = completeSalads.length > 0 ? completeSalads : categorized.salads;
      const salad = selectBestItem(saladPool, mealTarget, currentTotals, restrictions, recentItemIds, usedIds, mealType, selected, favoriteIds);
      if (salad) addItem(salad);
    }

    // 4. Optionally add a bread/roll alongside the entree (never as the only item)
    if (entree && currentTotals.calories < mealTarget.calories * 0.85) {
      const roll = selectBestItem(categorized.bakery, mealTarget, currentTotals, restrictions, recentItemIds, usedIds, mealType, selected, favoriteIds);
      if (roll) addItem(roll);
    }

    // 5. Add beverage
    const beverage = selectBestItem(categorized.beverages, mealTarget, currentTotals, restrictions, recentItemIds, usedIds, mealType, selected, favoriteIds);
    if (beverage) addItem(beverage, 'Beverage');
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

  // Find items in similar category
  const sameStation = availableItems.filter((item) => item.station === currentItem.station);
  const candidates = sameStation.length > 1 ? sameStation : availableItems;

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

  for (let i = 0; i < count; i++) {
    const candidate = selectBestItem(
      availableItems,
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
