import { useState, useEffect, useCallback } from 'react';
import { generateTodaysMenu, hasMealPassed, MEAL_TIMES } from '../../data/mockMenu';
import { fetchBrandeisMenu } from '../../services/menuFetcher';
import { getNutritionTargets, getDietaryRestrictions, getRecentItemIds, addMealToHistory, setCachedMenu, getCachedMenu } from '../../utils/storage';
import { optimizeDay, findAlternatives } from '../../utils/mealOptimizer';
import MealCard from './MealCard';
import DailySummary from './DailySummary';
import './MealPlan.css';

export default function MealPlan({ onOpenSettings, settingsVersion = 0 }) {
  const [menu, setMenu] = useState(null);
  const [mealPlan, setMealPlan] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState({
    breakfast: 'sherman',
    lunch: 'sherman',
    dinner: 'sherman',
  });
  const [confirmedMeals, setConfirmedMeals] = useState({
    breakfast: false,
    lunch: false,
    dinner: false,
  });
  const [loading, setLoading] = useState(true);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [itemAlternatives, setItemAlternatives] = useState({});

  const loadMenuAndOptimize = useCallback(async (forceRefresh = false) => {
    setLoading(true);

    let menuData = null;
    let usingCache = false;

    if (!forceRefresh) {
      menuData = getCachedMenu();
      if (menuData) usingCache = true;
    }

    if (!menuData) {
      try {
        menuData = await fetchBrandeisMenu();
        setCachedMenu(menuData);
      } catch {
        // Real fetch failed — fall back to mock data
        menuData = generateTodaysMenu();
        usingCache = true;
      }
    }

    setMenu(menuData);
    setUsingCachedData(usingCache);
    setItemAlternatives({});

    // Always re-read preferences from storage so settings changes are picked up
    const targets = getNutritionTargets();
    const restrictions = getDietaryRestrictions();
    const recentItems = getRecentItemIds();

    if (targets) {
      const optimized = optimizeDay(menuData, targets, restrictions, recentItems);
      setMealPlan(optimized);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadMenuAndOptimize();
  }, [loadMenuAndOptimize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-optimize (without refetching menu) when settings change
  useEffect(() => {
    if (settingsVersion === 0 || !menu) return;
    const targets = getNutritionTargets();
    const restrictions = getDietaryRestrictions();
    const recentItems = getRecentItemIds();
    if (targets) {
      const optimized = optimizeDay(menu, targets, restrictions, recentItems);
      setMealPlan(optimized);
      setItemAlternatives({});
    }
  }, [settingsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLocationChange = (meal, location) => {
    setSelectedLocation((prev) => ({ ...prev, [meal]: location }));
  };

  const handleLoadAlternatives = (meal, location, itemIndex, currentItem) => {
    const key = `${location}-${meal}-${itemIndex}`;
    setItemAlternatives((prev) => {
      if (key in prev) return prev;
      const currentMealPlan = mealPlan[location][meal];
      const restrictions = getDietaryRestrictions();
      const recentItems = getRecentItemIds();
      const excludeIds = new Set(currentMealPlan.items.map((i) => i.id));
      const alts = findAlternatives(
        currentItem,
        menu.locations[location].meals[meal],
        currentMealPlan.target,
        currentMealPlan.totals,
        restrictions,
        recentItems,
        excludeIds,
        4
      );
      return { ...prev, [key]: alts };
    });
  };

  const handleSwapToItem = (meal, itemIndex, newItem) => {
    if (!mealPlan) return;
    const location = selectedLocation[meal];
    const key = `${location}-${meal}-${itemIndex}`;

    setMealPlan((prev) => {
      const newPlan = { ...prev };
      const newItems = [...newPlan[location][meal].items];
      newItems[itemIndex] = newItem;

      const newTotals = newItems.reduce(
        (acc, item) => ({
          calories: acc.calories + item.nutrition.calories,
          protein: acc.protein + item.nutrition.protein,
          carbs: acc.carbs + item.nutrition.carbs,
          fat: acc.fat + item.nutrition.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );

      newPlan[location][meal] = { ...newPlan[location][meal], items: newItems, totals: newTotals };

      const dailyTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
      ['breakfast', 'lunch', 'dinner'].forEach((m) => {
        const loc = m === meal ? location : selectedLocation[m];
        if (newPlan[loc]?.[m]) {
          dailyTotals.calories += newPlan[loc][m].totals.calories;
          dailyTotals.protein += newPlan[loc][m].totals.protein;
          dailyTotals.carbs += newPlan[loc][m].totals.carbs;
          dailyTotals.fat += newPlan[loc][m].totals.fat;
        }
      });
      newPlan.dailyTotals[location] = dailyTotals;

      return newPlan;
    });

    // Clear cached alternatives for this slot since the item changed
    setItemAlternatives((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleConfirmMeal = (meal) => {
    const location = selectedLocation[meal];
    const mealItems = mealPlan[location][meal].items;

    // Add to history for variety tracking
    addMealToHistory(mealItems);

    setConfirmedMeals((prev) => ({ ...prev, [meal]: true }));
  };

  const calculateSelectedDayTotals = () => {
    if (!mealPlan) return { calories: 0, protein: 0, carbs: 0, fat: 0 };

    let totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    ['breakfast', 'lunch', 'dinner'].forEach((meal) => {
      const location = selectedLocation[meal];
      if (mealPlan[location] && mealPlan[location][meal]) {
        totals.calories += mealPlan[location][meal].totals.calories;
        totals.protein += mealPlan[location][meal].totals.protein;
        totals.carbs += mealPlan[location][meal].totals.carbs;
        totals.fat += mealPlan[location][meal].totals.fat;
      }
    });
    return totals;
  };

  if (loading) {
    return (
      <div className="meal-plan-loading">
        <div className="spinner"></div>
        <p className="loading-message">Fetching today's Brandeis menu…</p>
        <p className="loading-sub">Optimizing your meal plan</p>
      </div>
    );
  }

  if (!mealPlan) {
    return (
      <div className="meal-plan-error">
        <p>Unable to generate meal plan. Please complete setup first.</p>
        <button onClick={onOpenSettings}>Go to Settings</button>
      </div>
    );
  }

  const dayTotals = calculateSelectedDayTotals();
  const targets = mealPlan.targets;

  return (
    <div className="meal-plan">
      <header className="meal-plan-header">
        <div className="header-content">
          <img src="/logo.png" alt="Bento" className="header-logo" />
          <p className="tagline">Eat well. Every meal.</p>
          <p className="date">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <button className="settings-btn" onClick={onOpenSettings} aria-label="Settings">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </header>

      {usingCachedData && (
        <div className="cache-warning">
          Menu data may be outdated. <button onClick={() => loadMenuAndOptimize(true)}>Refresh</button>
        </div>
      )}

      <DailySummary totals={dayTotals} targets={targets} />

      <div className="meals-timeline">
        {['breakfast', 'lunch', 'dinner'].map((meal) => (
          <MealCard
            key={meal}
            meal={meal}
            mealTime={MEAL_TIMES[meal]}
            isPast={hasMealPassed(meal)}
            shermanPlan={mealPlan.sherman[meal]}
            usdanPlan={mealPlan.usdan[meal]}
            shermanOpen={menu?.locations?.sherman?.isOpen ?? true}
            usdanOpen={menu?.locations?.usdan?.isOpen ?? true}
            selectedLocation={selectedLocation[meal]}
            onLocationChange={(loc) => handleLocationChange(meal, loc)}
            itemAlternatives={itemAlternatives}
            onLoadAlternatives={handleLoadAlternatives}
            onSwapToItem={(index, newItem) => handleSwapToItem(meal, index, newItem)}
            isConfirmed={confirmedMeals[meal]}
            onConfirm={() => handleConfirmMeal(meal)}
          />
        ))}
      </div>
    </div>
  );
}
