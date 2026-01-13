// Meal optimization algorithm
// Uses a greedy heuristic to select meals that best match nutrition targets

import { MEAL_DISTRIBUTION, calculateMealTargets } from './tdeeCalculator';

// Check if item passes hard dietary restrictions
export function passesHardRestrictions(item, restrictions) {
  // Check standard dietary tags
  if (restrictions.vegetarian && !item.tags.includes('vegetarian')) return false;
  if (restrictions.vegan && !item.tags.includes('vegan')) return false;
  if (restrictions.glutenFree && !item.tags.includes('glutenFree')) return false;
  if (restrictions.dairyFree && !item.tags.includes('dairyFree')) return false;
  if (restrictions.nutFree && !item.tags.includes('nutFree')) return false;
  if (restrictions.halal && !item.tags.includes('halal')) return false;
  if (restrictions.kosher && !item.tags.includes('kosher')) return false;

  // Check allergen ingredients (hard block)
  if (restrictions.allergies && restrictions.allergies.length > 0) {
    const ingredientList = item.ingredients.join(' ').toLowerCase();
    for (const allergen of restrictions.allergies) {
      if (ingredientList.includes(allergen.toLowerCase())) {
        return false;
      }
    }
  }

  return true;
}

// Check soft restrictions (preferences to avoid but not block)
export function getSoftPenalty(item, restrictions) {
  let penalty = 0;

  if (restrictions.avoidIngredients && restrictions.avoidIngredients.length > 0) {
    const ingredientList = item.ingredients.join(' ').toLowerCase();
    for (const avoid of restrictions.avoidIngredients) {
      if (ingredientList.includes(avoid.toLowerCase())) {
        penalty += 50; // Soft penalty for avoided ingredients
      }
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

// Categorize items by type (entree, side, beverage, etc.)
function categorizeItems(items) {
  const categories = {
    entrees: [],
    sides: [],
    beverages: [],
    salads: [],
    soups: [],
    breakfast: [],
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
    } else {
      categories.entrees.push(item);
    }
  }

  return categories;
}

// Select best item from a list given constraints
function selectBestItem(items, target, currentTotals, restrictions, recentItemIds, excludeIds = new Set()) {
  let bestItem = null;
  let bestScore = Infinity;

  for (const item of items) {
    if (excludeIds.has(item.id)) continue;
    if (!passesHardRestrictions(item, restrictions)) continue;

    const baseScore = scoreItem(item, target, currentTotals);
    const softPenalty = getSoftPenalty(item, restrictions);
    const varietyPenalty = getVarietyPenalty(item.id, recentItemIds);
    const totalScore = baseScore + softPenalty + varietyPenalty;

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
export function optimizeMeal(availableItems, mealTarget, restrictions, recentItemIds) {
  const categorized = categorizeItems(availableItems);
  const selected = [];
  const currentTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const usedIds = new Set();
  const warnings = [];

  // Determine meal structure based on time of day
  const isBreakfast = categorized.breakfast.length > 0;

  if (isBreakfast) {
    // Breakfast: 2-3 items from breakfast station + beverage
    const targetItems = 3;

    for (let i = 0; i < targetItems && categorized.breakfast.length > 0; i++) {
      const item = selectBestItem(categorized.breakfast, mealTarget, currentTotals, restrictions, recentItemIds, usedIds);
      if (item) {
        selected.push({
          ...item,
          reason: generateReason(item, mealTarget, currentTotals),
        });
        currentTotals.calories += item.nutrition.calories;
        currentTotals.protein += item.nutrition.protein;
        currentTotals.carbs += item.nutrition.carbs;
        currentTotals.fat += item.nutrition.fat;
        usedIds.add(item.id);
      }
    }

    // Add beverage
    const beverage = selectBestItem(categorized.beverages, mealTarget, currentTotals, restrictions, recentItemIds, usedIds);
    if (beverage) {
      selected.push({
        ...beverage,
        reason: 'Beverage',
      });
      currentTotals.calories += beverage.nutrition.calories;
      currentTotals.protein += beverage.nutrition.protein;
      currentTotals.carbs += beverage.nutrition.carbs;
      currentTotals.fat += beverage.nutrition.fat;
    }
  } else {
    // Lunch/Dinner: 1 entree + 1-2 sides + optional salad/soup + beverage

    // 1. Select entree
    const entree = selectBestItem(categorized.entrees, mealTarget, currentTotals, restrictions, recentItemIds, usedIds);
    if (entree) {
      selected.push({
        ...entree,
        reason: generateReason(entree, mealTarget, currentTotals),
      });
      currentTotals.calories += entree.nutrition.calories;
      currentTotals.protein += entree.nutrition.protein;
      currentTotals.carbs += entree.nutrition.carbs;
      currentTotals.fat += entree.nutrition.fat;
      usedIds.add(entree.id);
    }

    // 2. Select side
    const side = selectBestItem(categorized.sides, mealTarget, currentTotals, restrictions, recentItemIds, usedIds);
    if (side) {
      selected.push({
        ...side,
        reason: generateReason(side, mealTarget, currentTotals),
      });
      currentTotals.calories += side.nutrition.calories;
      currentTotals.protein += side.nutrition.protein;
      currentTotals.carbs += side.nutrition.carbs;
      currentTotals.fat += side.nutrition.fat;
      usedIds.add(side.id);
    }

    // 3. Add salad if room in calorie budget
    if (currentTotals.calories < mealTarget.calories * 0.7) {
      const salad = selectBestItem(categorized.salads, mealTarget, currentTotals, restrictions, recentItemIds, usedIds);
      if (salad) {
        selected.push({
          ...salad,
          reason: generateReason(salad, mealTarget, currentTotals),
        });
        currentTotals.calories += salad.nutrition.calories;
        currentTotals.protein += salad.nutrition.protein;
        currentTotals.carbs += salad.nutrition.carbs;
        currentTotals.fat += salad.nutrition.fat;
        usedIds.add(salad.id);
      }
    }

    // 4. Add beverage
    const beverage = selectBestItem(categorized.beverages, mealTarget, currentTotals, restrictions, recentItemIds, usedIds);
    if (beverage) {
      selected.push({
        ...beverage,
        reason: 'Beverage',
      });
      currentTotals.calories += beverage.nutrition.calories;
      currentTotals.protein += beverage.nutrition.protein;
      currentTotals.carbs += beverage.nutrition.carbs;
      currentTotals.fat += beverage.nutrition.fat;
    }
  }

  // Check if we hit targets reasonably
  const caloriePercent = (currentTotals.calories / mealTarget.calories) * 100;
  const proteinPercent = (currentTotals.protein / mealTarget.protein) * 100;

  if (selected.length === 0) {
    warnings.push('No items match your dietary restrictions for this meal');
  } else {
    if (caloriePercent < 70) {
      warnings.push(`Meal is under calorie target (${Math.round(caloriePercent)}%)`);
    } else if (caloriePercent > 130) {
      warnings.push(`Meal exceeds calorie target (${Math.round(caloriePercent)}%)`);
    }
    if (proteinPercent < 60) {
      warnings.push('Consider adding protein-rich foods');
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

// Optimize full day across all meals
export function optimizeDay(menu, nutritionTargets, restrictions, recentItemIds, mealDistribution = MEAL_DISTRIBUTION) {
  const mealTargets = calculateMealTargets(nutritionTargets, mealDistribution);
  const result = {
    sherman: {},
    usdan: {},
    dailyTotals: {
      sherman: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      usdan: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    },
    targets: nutritionTargets,
    warnings: [],
  };

  for (const meal of ['breakfast', 'lunch', 'dinner']) {
    // Optimize for Sherman
    if (menu.locations.sherman.meals[meal]) {
      const shermanResult = optimizeMeal(
        menu.locations.sherman.meals[meal],
        mealTargets[meal],
        restrictions,
        recentItemIds
      );
      result.sherman[meal] = shermanResult;

      result.dailyTotals.sherman.calories += shermanResult.totals.calories;
      result.dailyTotals.sherman.protein += shermanResult.totals.protein;
      result.dailyTotals.sherman.carbs += shermanResult.totals.carbs;
      result.dailyTotals.sherman.fat += shermanResult.totals.fat;
    }

    // Optimize for Usdan
    if (menu.locations.usdan.meals[meal]) {
      const usdanResult = optimizeMeal(
        menu.locations.usdan.meals[meal],
        mealTargets[meal],
        restrictions,
        recentItemIds
      );
      result.usdan[meal] = usdanResult;

      result.dailyTotals.usdan.calories += usdanResult.totals.calories;
      result.dailyTotals.usdan.protein += usdanResult.totals.protein;
      result.dailyTotals.usdan.carbs += usdanResult.totals.carbs;
      result.dailyTotals.usdan.fat += usdanResult.totals.fat;
    }
  }

  return result;
}
