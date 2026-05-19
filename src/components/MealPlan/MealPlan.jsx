import { useState, useEffect, useCallback, useRef } from 'react';

// Local date (YYYY-MM-DD) — avoids UTC date rollover after 8pm Eastern
const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
import { hasMealPassed, MEAL_TIMES } from '../../data/mockMenu';
import { fetchBrandeisMenu } from '../../services/menuFetcher';
import { getNutritionTargets, getDietaryRestrictions, getRecentItemIds, getFavoriteIds, addMealToHistory, removeMealFromHistory, setCachedMenu, getCachedMenu, incrementStreak, getStreak } from '../../lib/db';
import { getNewBadge } from '../../data/badges';
import { optimizeDay, findAlternatives, findRecommendedAdditions } from '../../utils/mealOptimizer';
import MealCard from './MealCard';
import DailySummary from './DailySummary';
import StreakBadge from '../Streak/StreakBadge';
import StreakCelebration from '../Streak/StreakCelebration';
import BadgeCelebration from '../Badges/BadgeCelebration';
import BadgesPanel from '../Badges/BadgesPanel';
import './MealPlan.css';

export default function MealPlan({ settingsVersion = 0 }) {
  const [menu, setMenu] = useState(null);
  const [mealPlan, setMealPlan] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState({
    breakfast: 'usdan',
    lunch: 'usdan',
    dinner: 'usdan',
  });
  const locationDefaultApplied = useRef(false);
  const [confirmedMeals, setConfirmedMeals] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('bento_confirmed_meals_v2') || '{}');
      if (stored.date === localDateStr()) return stored.meals;
    } catch { /* localStorage unavailable */ }
    return { breakfast: false, lunch: false, dinner: false };
  });
  const [confirmingMeals, setConfirmingMeals] = useState({ breakfast: false, lunch: false, dinner: false });
  const [loading, setLoading] = useState(true);
  const [usingCachedData, setUsingCachedData] = useState(null); // null | 'cache' | 'offline'
  const [itemAlternatives, setItemAlternatives] = useState({});
  const [recommendations, setRecommendations] = useState({ breakfast: null, lunch: null, dinner: null });
  const [restrictions, setRestrictions] = useState(null);
  const [streak, setStreak] = useState({ currentStreak: 0, longestStreak: 0, lastConfirmedDate: null });
  const [showStreakCelebration, setShowStreakCelebration] = useState(false);
  const [pendingBadge, setPendingBadge] = useState(null);
  const [newBadge, setNewBadge] = useState(null);
  const [showBadgesPanel, setShowBadgesPanel] = useState(false);
  const [customMeals, setCustomMeals] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('bento_custom_meals_v1') || '{}');
      if (stored.date === localDateStr()) return stored.meals || { breakfast: null, lunch: null, dinner: null };
    } catch { /* localStorage unavailable */ }
    return { breakfast: null, lunch: null, dinner: null };
  });
  const [confirmedMealIds, setConfirmedMealIds] = useState({ breakfast: null, lunch: null, dinner: null });
  const [, setTick] = useState(0);

  const loadMenuAndOptimize = useCallback(async (forceRefresh = false) => {
    setLoading(true);

    let menuData = null;
    let cacheState = null; // null | 'cache' | 'offline'

    if (!forceRefresh) {
      menuData = getCachedMenu();
      if (menuData) {
        // Check age of cache
        try {
          const raw = JSON.parse(localStorage.getItem('bento_cached_menu'));
          if (raw && Date.now() - raw.fetchedAt > 60 * 60 * 1000) {
            cacheState = 'cache'; // old enough to show refresh banner
          } else {
            cacheState = null; // fresh cache, no banner needed
          }
        } catch { cacheState = null; }
      }
    }

    if (!menuData) {
      try {
        menuData = await fetchBrandeisMenu();
        setCachedMenu(menuData);
      } catch {
        menuData = {
          date: localDateStr(),
          locations: {
            sherman: { id: 'sherman', name: 'Farm Table at Sherman', shortName: 'Farm Table', meals: { breakfast: [], lunch: [], dinner: [] }, isOpen: false },
            usdan:   { id: 'usdan',   name: 'Usdan Kitchen',           shortName: 'Usdan',       meals: { breakfast: [], lunch: [], dinner: [] }, isOpen: false },
            kosher:  { id: 'kosher',  name: 'Kosher Table at Sherman', shortName: 'Kosher',      meals: { breakfast: [], lunch: [], dinner: [] }, isOpen: false },
          },
        };
        cacheState = 'offline';
      }
    }

    setMenu(menuData);
    setUsingCachedData(cacheState);
    setItemAlternatives({});
    setRecommendations({ breakfast: null, lunch: null, dinner: null });

    try {
      const [targets, fetchedRestrictions, recentItems] = await Promise.all([
        getNutritionTargets(),
        getDietaryRestrictions(),
        getRecentItemIds(),
      ]);

      setRestrictions(fetchedRestrictions);

      if (targets) {
        const favoriteIds = await getFavoriteIds();
        const optimized = optimizeDay(menuData, targets, fetchedRestrictions, recentItems, undefined, favoriteIds);
        setMealPlan(optimized);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMenuAndOptimize();
    getStreak().then(s => setStreak(s));
  }, [loadMenuAndOptimize]);

  // Retroactive streak check: if menu loads and all available meals are already confirmed
  // (e.g. confirmed before deploy or in a prior session), fire the streak now.
  // incrementStreak() deduplicates by date so this is safe to call unconditionally.
  useEffect(() => {
    if (!menu) return;
    const availableMeals = ['breakfast', 'lunch', 'dinner'].filter(m => {
      const s = menu?.locations?.sherman?.meals?.[m]?.length ?? 0;
      const u = menu?.locations?.usdan?.meals?.[m]?.length ?? 0;
      const k = menu?.locations?.kosher?.meals?.[m]?.length ?? 0;
      return s > 0 || u > 0 || k > 0;
    });
    if (availableMeals.length === 0 || !availableMeals.every(m => confirmedMeals[m])) return;
    incrementStreak().then(result => {
      if (!result) return;
      setStreak({ currentStreak: result.currentStreak, longestStreak: result.longestStreak, lastConfirmedDate: localDateStr() });
      const badge = getNewBadge(result.prevLongest, result.longestStreak);
      setPendingBadge(badge);
      setShowStreakCelebration(true);
    });
  }, [menu]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render every minute so hasMealPassed() stays current while the page is open
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // On first load: if kosher user, default all meals to kosher table;
  // otherwise auto-select the location that actually has items for each meal.
  useEffect(() => {
    if (!mealPlan || !restrictions || locationDefaultApplied.current) return;
    locationDefaultApplied.current = true;

    if (restrictions.kosher) {
      setSelectedLocation({ breakfast: 'kosher', lunch: 'kosher', dinner: 'kosher' });
      return;
    }

    setSelectedLocation(prev => {
      const next = { ...prev };
      for (const meal of ['breakfast', 'lunch', 'dinner']) {
        const currentItems = mealPlan[prev[meal]]?.[meal]?.items ?? [];
        if (currentItems.length === 0) {
          const bestLoc = ['sherman', 'usdan', 'kosher'].find(
            loc => (mealPlan[loc]?.[meal]?.items ?? []).length > 0
          );
          if (bestLoc) next[meal] = bestLoc;
        }
      }
      return next;
    });
  }, [mealPlan, restrictions]);

  // Re-optimize (without refetching menu) when settings change
  useEffect(() => {
    if (settingsVersion === 0 || !menu) return;
    let cancelled = false;
    async function reoptimize() {
      const [targets, fetchedRestrictions, recentItems] = await Promise.all([
        getNutritionTargets(),
        getDietaryRestrictions(),
        getRecentItemIds(),
      ]);
      if (cancelled) return;
      setRestrictions(fetchedRestrictions);
      // Auto-switch to kosher table when kosher restriction is enabled/disabled
      if (fetchedRestrictions.kosher) {
        setSelectedLocation({ breakfast: 'kosher', lunch: 'kosher', dinner: 'kosher' });
      } else {
        // Reset to default location if kosher was turned off
        setSelectedLocation(prev => {
          const defaultLoc = Object.keys(menu.locations ?? {}).find(k => k !== 'kosher') ?? 'usdan';
          const allKosher = Object.values(prev).every(l => l === 'kosher');
          return allKosher ? { breakfast: defaultLoc, lunch: defaultLoc, dinner: defaultLoc } : prev;
        });
      }
      if (targets) {
        const favoriteIds = await getFavoriteIds();
        if (cancelled) return;
        const optimized = optimizeDay(menu, targets, fetchedRestrictions, recentItems, undefined, favoriteIds);
        setMealPlan(optimized);
        setItemAlternatives({});
        setRecommendations({ breakfast: null, lunch: null, dinner: null });
      }
    }
    reoptimize();
    return () => { cancelled = true; };
  }, [settingsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLocationChange = (meal, location) => {
    setSelectedLocation((prev) => ({ ...prev, [meal]: location }));
    setRecommendations((prev) => ({ ...prev, [meal]: null }));
  };

  const handleLoadRecommendations = async (meal) => {
    if (recommendations[meal] !== null) return;
    const location = selectedLocation[meal];
    const currentMealPlan = mealPlan[location][meal];
    const [restrictions, recentItems, favoriteIds] = await Promise.all([
      getDietaryRestrictions(),
      getRecentItemIds(),
      getFavoriteIds(),
    ]);
    const excludeIds = new Set(currentMealPlan.items.map((i) => i.id));
    const recs = findRecommendedAdditions(
      menu.locations[location].meals[meal],
      currentMealPlan.target,
      currentMealPlan.totals,
      restrictions,
      recentItems,
      excludeIds,
      meal,
      currentMealPlan.items,
      3,
      favoriteIds
    );
    setRecommendations((prev) => ({ ...prev, [meal]: recs }));
  };

  const handleAddItem = (meal, item) => {
    const location = selectedLocation[meal];
    setMealPlan((prev) => {
      const currentItems = prev[location][meal].items;
      // Guard: prevent double-add (React Strict Mode calls updaters twice)
      if (currentItems.some((i) => i.id === item.id)) return prev;
      const newItems = [...currentItems, { ...item, userAdded: true }];
      const newTotals = newItems.reduce(
        (acc, i) => ({
          calories: acc.calories + (i.nutrition?.calories ?? 0),
          protein: acc.protein + (i.nutrition?.protein ?? 0),
          carbs: acc.carbs + (i.nutrition?.carbs ?? 0),
          fat: acc.fat + (i.nutrition?.fat ?? 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );
      // Deep-copy the location level to avoid mutating prev[location]
      const newPlan = {
        ...prev,
        [location]: {
          ...prev[location],
          [meal]: { ...prev[location][meal], items: newItems, totals: newTotals },
        },
      };

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
      newPlan.dailyTotals = { ...prev.dailyTotals, [location]: dailyTotals };
      return newPlan;
    });
    setRecommendations((prev) => ({ ...prev, [meal]: null }));
  };

  const handleRemoveItem = (meal, itemId) => {
    const location = selectedLocation[meal];
    setMealPlan((prev) => {
      const currentItems = prev[location][meal].items;
      // Guard: bail if item not found (also protects against Strict Mode double-invocation)
      if (!currentItems.some((i) => i.id === itemId)) return prev;
      const newItems = currentItems.filter((i) => i.id !== itemId);
      const newTotals = newItems.reduce(
        (acc, i) => ({
          calories: acc.calories + (i.nutrition?.calories ?? 0),
          protein: acc.protein + (i.nutrition?.protein ?? 0),
          carbs: acc.carbs + (i.nutrition?.carbs ?? 0),
          fat: acc.fat + (i.nutrition?.fat ?? 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );
      // Deep-copy the location level to avoid mutating prev[location]
      const newPlan = {
        ...prev,
        [location]: {
          ...prev[location],
          [meal]: { ...prev[location][meal], items: newItems, totals: newTotals },
        },
      };

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
      newPlan.dailyTotals = { ...prev.dailyTotals, [location]: dailyTotals };
      return newPlan;
    });
  };

  const handleLoadAlternatives = async (meal, location, itemIndex, currentItem) => {
    const key = `${location}-${meal}-${itemIndex}`;
    if (key in itemAlternatives) return;
    const currentMealPlan = mealPlan[location][meal];
    const [restrictions, recentItems] = await Promise.all([
      getDietaryRestrictions(),
      getRecentItemIds(),
    ]);
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
    setItemAlternatives((prev) => ({ ...prev, [key]: alts }));
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

      newPlan[location] = {
        ...newPlan[location],
        [meal]: { ...newPlan[location][meal], items: newItems, totals: newTotals },
      };

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
      newPlan.dailyTotals = { ...prev.dailyTotals, [location]: dailyTotals };

      return newPlan;
    });

    // Clear cached alternatives for this slot since the item changed
    setItemAlternatives((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleUndo = async (meal) => {
    const rowId = confirmedMealIds[meal];
    if (rowId) await removeMealFromHistory(rowId);
    const updatedConfirmed = { ...confirmedMeals, [meal]: false };
    setConfirmedMeals(updatedConfirmed);
    setConfirmedMealIds(prev => ({ ...prev, [meal]: null }));
    try {
      localStorage.setItem('bento_confirmed_meals_v2', JSON.stringify({ date: localDateStr(), meals: updatedConfirmed }));
    } catch { /* localStorage unavailable */ }
  };

  const handleBrowserDone = (meal, selectedItems) => {
    const newPlan = selectedItems.length === 0 ? null : {
      items: selectedItems,
      totals: selectedItems.reduce((acc, item) => ({
        calories: acc.calories + (item.nutrition?.calories || 0),
        protein:  acc.protein  + (item.nutrition?.protein  || 0),
        carbs:    acc.carbs    + (item.nutrition?.carbs    || 0),
        fat:      acc.fat      + (item.nutrition?.fat      || 0),
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 }),
    };
    setCustomMeals(prev => {
      const next = { ...prev, [meal]: newPlan };
      try {
        localStorage.setItem('bento_custom_meals_v1', JSON.stringify({ date: localDateStr(), meals: next }));
      } catch { /* localStorage unavailable */ }
      return next;
    });
  };

  const handleConfirmMeal = async (meal) => {
    if (confirmingMeals[meal] || confirmedMeals[meal]) return;
    setConfirmingMeals(prev => ({ ...prev, [meal]: true }));
    const location = selectedLocation[meal];
    const mealItems = customMeals[meal]?.items ?? mealPlan[location][meal].items;
    const rowId = await addMealToHistory(mealItems);
    setConfirmingMeals(prev => ({ ...prev, [meal]: false }));
    const updatedConfirmed = { ...confirmedMeals, [meal]: true };
    setConfirmedMeals(updatedConfirmed);
    setConfirmedMealIds(prev => ({ ...prev, [meal]: rowId }));
    try {
      localStorage.setItem('bento_confirmed_meals_v2', JSON.stringify({ date: localDateStr(), meals: updatedConfirmed }));
    } catch { /* localStorage unavailable */ }
    const availableMeals = ['breakfast', 'lunch', 'dinner'].filter(m => {
      const s = menu?.locations?.sherman?.meals?.[m]?.length ?? 0;
      const u = menu?.locations?.usdan?.meals?.[m]?.length ?? 0;
      const k = menu?.locations?.kosher?.meals?.[m]?.length ?? 0;
      return s > 0 || u > 0 || k > 0;
    });
    const allConfirmed = availableMeals.length > 0 && availableMeals.every(m => updatedConfirmed[m]);
    if (allConfirmed) {
      const result = await incrementStreak();
      if (result) {
        setStreak({ currentStreak: result.currentStreak, longestStreak: result.longestStreak, lastConfirmedDate: localDateStr() });
        const badge = getNewBadge(result.prevLongest, result.longestStreak);
        setPendingBadge(badge);
        setShowStreakCelebration(true);
      }
    }
  };

  const handleStreakCelebrationDismiss = () => {
    setShowStreakCelebration(false);
    if (pendingBadge) {
      setNewBadge(pendingBadge);
      setPendingBadge(null);
    }
  };

  const calculateSelectedDayTotals = () => {
    if (!mealPlan) return { calories: 0, protein: 0, carbs: 0, fat: 0 };

    let totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    ['breakfast', 'lunch', 'dinner'].forEach((meal) => {
      const custom = customMeals[meal];
      if (custom) {
        totals.calories += custom.totals.calories;
        totals.protein  += custom.totals.protein;
        totals.carbs    += custom.totals.carbs;
        totals.fat      += custom.totals.fat;
      } else {
        const location = selectedLocation[meal];
        if (mealPlan[location] && mealPlan[location][meal]) {
          totals.calories += mealPlan[location][meal].totals.calories;
          totals.protein  += mealPlan[location][meal].totals.protein;
          totals.carbs    += mealPlan[location][meal].totals.carbs;
          totals.fat      += mealPlan[location][meal].totals.fat;
        }
      }
    });
    return totals;
  };

  if (loading) {
    return (
      <div className="meal-plan-loading">
        <div className="spinner"></div>
        <p className="loading-message">Fetching today's menu…</p>
        <p className="loading-sub">Optimizing your meal plan</p>
      </div>
    );
  }

  if (!mealPlan) {
    return (
      <div className="meal-plan-error">
        <p>Unable to generate meal plan. Please complete setup first.</p>
      </div>
    );
  }

  const dayTotals = calculateSelectedDayTotals();
  const targets = mealPlan.targets;

  return (
    <div className="meal-plan">
      <header className="meal-plan-header">
        <div className="header-brand">
          <img src="/logo-cropped.png" alt="Bento" className="header-logo-sm" />
          <p className="date">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        {(() => {
          const today = localDateStr();
          const yesterday = localDateStr(new Date(Date.now() - 86400000));
          const active = streak.lastConfirmedDate === today || streak.lastConfirmedDate === yesterday;
          const effectiveStreak = active ? streak.currentStreak : 0;
          return effectiveStreak > 0 ? (
            <StreakBadge streak={effectiveStreak} onClick={() => setShowBadgesPanel(true)} />
          ) : null;
        })()}
      </header>

      {usingCachedData === 'cache' && (
        <div className="cache-warning">
          Showing saved menu · <button onClick={() => loadMenuAndOptimize(true)}>Refresh</button>
        </div>
      )}
      {usingCachedData === 'offline' && (
        <div className="cache-warning cache-warning-error">
          Couldn't reach dining servers · <button onClick={() => loadMenuAndOptimize(true)}>Retry</button>
        </div>
      )}

      <div className="meals-timeline">
        {['breakfast', 'lunch', 'dinner'].map((meal) => (
          <MealCard
            key={meal}
            meal={meal}
            mealTime={MEAL_TIMES[meal]}
            isPast={hasMealPassed(meal)}
            shermanPlan={mealPlan.sherman[meal]}
            usdanPlan={mealPlan.usdan[meal]}
            kosherPlan={mealPlan.kosher?.[meal]}
            shermanOpen={menu?.locations?.sherman?.isOpen ?? true}
            usdanOpen={menu?.locations?.usdan?.isOpen ?? true}
            kosherOpen={menu?.locations?.kosher?.isOpen ?? true}
            shermanRawCount={menu?.locations?.sherman?.meals[meal]?.length ?? 0}
            usdanRawCount={menu?.locations?.usdan?.meals[meal]?.length ?? 0}
            kosherRawCount={menu?.locations?.kosher?.meals[meal]?.length ?? 0}
            shermanRawItems={menu?.locations?.sherman?.meals[meal] ?? []}
            usdanRawItems={menu?.locations?.usdan?.meals[meal] ?? []}
            kosherRawItems={menu?.locations?.kosher?.meals[meal] ?? []}
            customPlan={customMeals[meal]}
            onBrowserDone={(items) => handleBrowserDone(meal, items)}
            isKosherUser={restrictions?.kosher ?? false}
            selectedLocation={selectedLocation[meal]}
            onLocationChange={(loc) => handleLocationChange(meal, loc)}
            itemAlternatives={itemAlternatives}
            onLoadAlternatives={handleLoadAlternatives}
            onSwapToItem={(index, newItem) => handleSwapToItem(meal, index, newItem)}
            recommendations={recommendations[meal]}
            onLoadRecommendations={() => handleLoadRecommendations(meal)}
            onAddItem={(item) => handleAddItem(meal, item)}
            onRemoveItem={(itemId) => handleRemoveItem(meal, itemId)}
            isConfirmed={confirmedMeals[meal]}
            isConfirming={confirmingMeals[meal]}
            onConfirm={() => handleConfirmMeal(meal)}
            onUndo={() => handleUndo(meal)}
          />
        ))}
      </div>

      <DailySummary totals={dayTotals} targets={targets} />

      {showStreakCelebration && (
        <StreakCelebration
          streak={streak.currentStreak}
          onDismiss={handleStreakCelebrationDismiss}
        />
      )}

      {newBadge && (
        <BadgeCelebration
          badge={newBadge}
          onDismiss={() => setNewBadge(null)}
        />
      )}

      {showBadgesPanel && (
        <BadgesPanel
          longestStreak={streak.longestStreak}
          onClose={() => setShowBadgesPanel(false)}
        />
      )}
    </div>
  );
}
