import { useState, useEffect, useCallback, useRef } from 'react';

// Local date (YYYY-MM-DD) — avoids UTC date rollover after 8pm Eastern
const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Per-date meal plan cache: { [YYYY-MM-DD]: { breakfast, lunch, dinner } }
// Stores user's planned items per meal per day so navigation doesn't wipe selections.
const PLAN_CACHE_KEY = 'bento_meal_plans_v2';
function readPlanCache() {
  try { return JSON.parse(localStorage.getItem(PLAN_CACHE_KEY) || '{}'); } catch { return {}; }
}
function writePlanCache(date, meals) {
  try {
    const cache = readPlanCache();
    const updated = { ...cache, [date]: meals };
    // Trim entries older than 30 days
    const cutoff = localDateStr(new Date(Date.now() - 30 * 86400000));
    Object.keys(updated).forEach(k => { if (k < cutoff) delete updated[k]; });
    localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify(updated));
  } catch {}
}

import { hasMealPassed, MEAL_TIMES } from '../../data/mockMenu';
import { fetchDiningMenu, getUniversityConfig } from '../../services/menuFetcher';
import { getUserProfile, getNutritionTargets, getDietaryRestrictions, getRecentItemIds, addMealToHistory, removeMealFromHistory, setCachedMenu, getCachedMenu, getCachedMenuAge, incrementStreak, incrementStreakForDate, getStreak, getConfirmedMealsForDate, recordDiningAvailability } from '../../lib/db';
import { useRatings } from '../../context/RatingsContext';
import { getNewBadge } from '../../data/badges';
import { optimizeDay, findAlternatives, findRecommendedAdditions } from '../../utils/mealOptimizer';
import MealCard from './MealCard';
import DailySummary from './DailySummary';
import StreakBadge from '../Streak/StreakBadge';
import StreakCelebration from '../Streak/StreakCelebration';
import BadgeCelebration from '../Badges/BadgeCelebration';
import BadgesPanel from '../Badges/BadgesPanel';
import RatingSheet from './RatingSheet';
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
    const today = localDateStr();
    // New per-date cache takes priority
    const cache = readPlanCache();
    if (cache[today]) return cache[today];
    // Fall back to old single-date key for today
    try {
      const stored = JSON.parse(localStorage.getItem('bento_custom_meals_v1') || '{}');
      if (stored.date === today) return stored.meals || { breakfast: null, lunch: null, dinner: null };
    } catch {}
    return { breakfast: null, lunch: null, dinner: null };
  });
  const [confirmedMealIds, setConfirmedMealIds] = useState({ breakfast: null, lunch: null, dinner: null });
  const [university, setUniversity] = useState('brandeis');
  const universityRef = useRef('brandeis');
  const [viewDate, setViewDate] = useState(() => localDateStr());
  const [dateLoading, setDateLoading] = useState(false);
  const [, setTick] = useState(0);
  const initialMountRef = useRef(true);

  // High-rated items from context — ref keeps loadMenuAndOptimize stable (no dep on highRatedIds)
  const { highRatedIds: contextHighRatedIds } = useRatings();
  const highRatedIdsRef = useRef(contextHighRatedIds);
  useEffect(() => { highRatedIdsRef.current = contextHighRatedIds; }, [contextHighRatedIds]);

  // Post-confirmation rating sheet
  const [pendingRating, setPendingRating] = useState(null); // { meal, items }
  const pendingStreakRef = useRef(null); // { isViewingToday, updatedConfirmed } — deferred until sheet closes

  const loadMenuAndOptimize = useCallback(async (forceRefresh = false) => {
    setLoading(true);

    // Fetch profile first to get university routing (fast Supabase read)
    const profileData = await getUserProfile();
    const uni = profileData?.university ?? 'brandeis';
    if (uni !== universityRef.current) {
      // University changed — reset location selection and any in-progress manual plate
      locationDefaultApplied.current = false;
      const firstLoc = Object.keys(getUniversityConfig(uni).locations)[0];
      setSelectedLocation({ breakfast: firstLoc, lunch: firstLoc, dinner: firstLoc });
      setCustomMeals({ breakfast: null, lunch: null, dinner: null });
    }
    universityRef.current = uni;
    setUniversity(uni);
    const uniConfig = getUniversityConfig(uni);

    // Check menu cache
    let cachedMenuData = null;
    let cacheState = null;
    if (!forceRefresh) {
      cachedMenuData = getCachedMenu(uni);
      if (cachedMenuData) {
        const age = getCachedMenuAge(uni);
        cacheState = (age !== null && age > 60 * 60 * 1000) ? 'cache' : null;
      }
    }

    const offlineFallback = {
      date: localDateStr(),
      locations: Object.fromEntries(
        Object.entries(uniConfig.locations).map(([id, loc]) => [
          id, { id, name: loc.name, shortName: loc.shortName, meals: { breakfast: [], lunch: [], dinner: [] }, isOpen: false },
        ])
      ),
    };

    // Build the menu promise — resolves to { data, offline }
    const menuPromise = cachedMenuData
      ? Promise.resolve({ data: cachedMenuData, offline: false })
      : fetchDiningMenu(uniConfig)
          .then(data => { setCachedMenu(data, uni); return { data, offline: false }; })
          .catch(() => ({ data: offlineFallback, offline: true }));

    try {
      // Menu fetch and all user-data queries run simultaneously
      const [{ data: menuData, offline }, targets, fetchedRestrictions, recentItems] = await Promise.all([
        menuPromise,
        getNutritionTargets(),
        getDietaryRestrictions(),
        getRecentItemIds(),
      ]);

      if (!offline) {
        const anyOpen = Object.values(menuData.locations ?? {}).some(loc => loc.isOpen);
        recordDiningAvailability(anyOpen, uni).catch(() => {});
      }

      setMenu(menuData);
      setUsingCachedData(offline ? 'offline' : cacheState);
      setItemAlternatives({});
      setRecommendations({ breakfast: null, lunch: null, dinner: null });
      setRestrictions(fetchedRestrictions);

      if (targets) {
        const optimized = optimizeDay(menuData, targets, fetchedRestrictions, recentItems, undefined, highRatedIdsRef.current);
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

  // Date navigation: when viewDate changes (not on initial mount — that's handled above).
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    const today    = localDateStr();
    const tomorrow = localDateStr(new Date(Date.now() + 86400000));

    const savedPlan = readPlanCache()[viewDate] || { breakfast: null, lunch: null, dinner: null };

    setMealPlan(null);
    setConfirmedMeals({ breakfast: false, lunch: false, dinner: false });
    setConfirmedMealIds({ breakfast: null, lunch: null, dinner: null });
    setCustomMeals(savedPlan);
    setItemAlternatives({});
    setRecommendations({ breakfast: null, lunch: null, dinner: null });
    locationDefaultApplied.current = false;

    if (viewDate === today) {
      loadMenuAndOptimize();
      return;
    }

    // Past or future date — debounce so rapid ← → clicks don't each fire a fetch
    setDateLoading(true);
    const capturedDate = viewDate;
    const timer = setTimeout(async () => {
      try {
        const [menuData, confirmedForDate, targets, fetchedRestrictions, recentItems] = await Promise.all([
          fetchDiningMenu(getUniversityConfig(universityRef.current), capturedDate),
          getConfirmedMealsForDate(capturedDate),
          getNutritionTargets(),
          getDietaryRestrictions(),
          getRecentItemIds(),
        ]);
        setMenu(menuData);

        const confirmedBool = { breakfast: false, lunch: false, dinner: false };
        const confirmedIds  = { breakfast: null,  lunch: null,  dinner: null  };
        for (const meal of ['breakfast', 'lunch', 'dinner']) {
          const record = confirmedForDate[meal];
          if (record) { confirmedBool[meal] = true; confirmedIds[meal] = record.rowId; }
        }
        setConfirmedMeals(confirmedBool);
        setConfirmedMealIds(confirmedIds);
        setRestrictions(fetchedRestrictions);

        if (targets) {
          const optimized = optimizeDay(menuData, targets, fetchedRestrictions, recentItems, undefined, highRatedIdsRef.current);
          setMealPlan(optimized);
        }
      } catch {
        // Date fetch failed — mealPlan stays null
      } finally {
        setDateLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); setDateLoading(false); };
  }, [viewDate, loadMenuAndOptimize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retroactive streak check: if today's menu loads and all meals are already confirmed
  // (e.g. confirmed before deploy or in a prior session), fire the streak now.
  // Only runs for today — past-date streak is handled in handleConfirmMeal.
  useEffect(() => {
    if (!menu || viewDate !== localDateStr()) return;
    const availableMeals = ['breakfast', 'lunch', 'dinner'].filter(m =>
      Object.values(menu?.locations ?? {}).some(loc => (loc.meals?.[m]?.length ?? 0) > 0)
    );
    if (availableMeals.length > 0 && !availableMeals.every(m => confirmedMeals[m])) return;
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

    const locationIds = Object.keys(getUniversityConfig(universityRef.current).locations);
    const kosherLoc = locationIds.find(id => id === 'kosher');
    if (restrictions.kosher && kosherLoc) {
      setSelectedLocation({ breakfast: 'kosher', lunch: 'kosher', dinner: 'kosher' });
      return;
    }

    setSelectedLocation(prev => {
      const next = { ...prev };
      for (const meal of ['breakfast', 'lunch', 'dinner']) {
        const currentItems = mealPlan[prev[meal]]?.[meal]?.items ?? [];
        if (currentItems.length === 0) {
          const bestLoc = Object.keys(mealPlan ?? {}).find(
            loc => (mealPlan[loc]?.[meal]?.items ?? []).length > 0
          );
          if (bestLoc) next[meal] = bestLoc;
        }
      }
      return next;
    });
  }, [mealPlan, restrictions]);

  // Re-optimize or reload when settings change
  useEffect(() => {
    if (settingsVersion === 0) return;
    let cancelled = false;
    async function handleSettingsChange() {
      const profileData = await getUserProfile();
      if (cancelled) return;
      const newUni = profileData?.university ?? 'brandeis';
      if (newUni !== universityRef.current) {
        // University changed — full menu reload for the new school
        loadMenuAndOptimize(true);
        return;
      }
      // Same university — re-optimize with updated preferences (no refetch needed)
      if (!menu) return;
      const [targets, fetchedRestrictions, recentItems] = await Promise.all([
        getNutritionTargets(),
        getDietaryRestrictions(),
        getRecentItemIds(),
      ]);
      if (cancelled) return;
      setRestrictions(fetchedRestrictions);
      const locIds = Object.keys(getUniversityConfig(universityRef.current).locations);
      const hasKosherLoc = locIds.includes('kosher');
      if (fetchedRestrictions.kosher && hasKosherLoc) {
        setSelectedLocation({ breakfast: 'kosher', lunch: 'kosher', dinner: 'kosher' });
      } else {
        setSelectedLocation(prev => {
          const defaultLoc = locIds.find(k => k !== 'kosher') ?? locIds[0];
          const allKosher = Object.values(prev).every(l => l === 'kosher');
          return allKosher ? { breakfast: defaultLoc, lunch: defaultLoc, dinner: defaultLoc } : prev;
        });
      }
      if (targets) {
        if (cancelled) return;
        const optimized = optimizeDay(menu, targets, fetchedRestrictions, recentItems, undefined, highRatedIdsRef.current);
        setMealPlan(optimized);
        setItemAlternatives({});
        setRecommendations({ breakfast: null, lunch: null, dinner: null });
      }
    }
    handleSettingsChange();
    return () => { cancelled = true; };
  }, [settingsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateDate = (delta) => {
    setViewDate(prev => {
      const tomorrow = localDateStr(new Date(Date.now() + 86400000));
      const d = new Date(prev + 'T12:00:00');
      d.setDate(d.getDate() + delta);
      const next = localDateStr(d);
      return next > tomorrow ? prev : next;
    });
  };

  const handleLocationChange = (meal, location) => {
    setSelectedLocation((prev) => ({ ...prev, [meal]: location }));
    setRecommendations((prev) => ({ ...prev, [meal]: null }));
  };

  const handleLoadRecommendations = async (meal) => {
    if (recommendations[meal] !== null) return;
    const location = selectedLocation[meal];
    const currentMealPlan = mealPlan[location][meal];
    const [restrictions, recentItems] = await Promise.all([
      getDietaryRestrictions(),
      getRecentItemIds(),
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
      highRatedIdsRef.current
    );
    setRecommendations((prev) => ({ ...prev, [meal]: recs }));
  };

  const handleAddItem = (meal, item) => {
    const location = selectedLocation[meal];
    const currentItems = mealPlan?.[location]?.[meal]?.items ?? [];
    if (currentItems.some((i) => i.id === item.id)) return;
    const newItems = [...currentItems, { ...item, userAdded: true }];
    const newTotals = newItems.reduce(
      (acc, i) => ({
        calories: acc.calories + (i.nutrition?.calories ?? 0),
        protein:  acc.protein  + (i.nutrition?.protein  ?? 0),
        carbs:    acc.carbs    + (i.nutrition?.carbs    ?? 0),
        fat:      acc.fat      + (i.nutrition?.fat      ?? 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    setMealPlan((prev) => {
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
          dailyTotals.protein  += newPlan[loc][m].totals.protein;
          dailyTotals.carbs    += newPlan[loc][m].totals.carbs;
          dailyTotals.fat      += newPlan[loc][m].totals.fat;
        }
      });
      newPlan.dailyTotals = { ...prev.dailyTotals, [location]: dailyTotals };
      return newPlan;
    });
    setCustomMeals(prev => {
      const next = { ...prev, [meal]: { items: newItems, totals: newTotals } };
      writePlanCache(viewDate, next);
      return next;
    });
    setRecommendations((prev) => ({ ...prev, [meal]: null }));
  };

  const handleRemoveItem = (meal, itemId) => {
    const location = selectedLocation[meal];
    const currentItems = mealPlan?.[location]?.[meal]?.items ?? [];
    if (!currentItems.some((i) => i.id === itemId)) return;
    const newItems = currentItems.filter((i) => i.id !== itemId);
    const newTotals = newItems.reduce(
      (acc, i) => ({
        calories: acc.calories + (i.nutrition?.calories ?? 0),
        protein:  acc.protein  + (i.nutrition?.protein  ?? 0),
        carbs:    acc.carbs    + (i.nutrition?.carbs    ?? 0),
        fat:      acc.fat      + (i.nutrition?.fat      ?? 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    setMealPlan((prev) => {
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
          dailyTotals.protein  += newPlan[loc][m].totals.protein;
          dailyTotals.carbs    += newPlan[loc][m].totals.carbs;
          dailyTotals.fat      += newPlan[loc][m].totals.fat;
        }
      });
      newPlan.dailyTotals = { ...prev.dailyTotals, [location]: dailyTotals };
      return newPlan;
    });
    setCustomMeals(prev => {
      const next = { ...prev, [meal]: { items: newItems, totals: newTotals } };
      writePlanCache(viewDate, next);
      return next;
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
    const newItems = [...(mealPlan[location][meal].items)];
    newItems[itemIndex] = newItem;
    const newTotals = newItems.reduce(
      (acc, item) => ({
        calories: acc.calories + item.nutrition.calories,
        protein:  acc.protein  + item.nutrition.protein,
        carbs:    acc.carbs    + item.nutrition.carbs,
        fat:      acc.fat      + item.nutrition.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    setMealPlan((prev) => {
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
          dailyTotals.protein  += newPlan[loc][m].totals.protein;
          dailyTotals.carbs    += newPlan[loc][m].totals.carbs;
          dailyTotals.fat      += newPlan[loc][m].totals.fat;
        }
      });
      newPlan.dailyTotals = { ...prev.dailyTotals, [location]: dailyTotals };
      return newPlan;
    });

    setCustomMeals(prev => {
      const next = { ...prev, [meal]: { items: newItems, totals: newTotals } };
      writePlanCache(viewDate, next);
      return next;
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
    if (viewDate === localDateStr()) {
      try {
        localStorage.setItem('bento_confirmed_meals_v2', JSON.stringify({ date: localDateStr(), meals: updatedConfirmed }));
      } catch { /* localStorage unavailable */ }
    }
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
      writePlanCache(viewDate, next);
      return next;
    });
  };

  const runStreakCheck = async (isViewingToday, updatedConfirmed) => {
    const availableMeals = ['breakfast', 'lunch', 'dinner'].filter(m =>
      Object.values(menu?.locations ?? {}).some(loc => (loc.meals?.[m]?.length ?? 0) > 0)
    );
    const allConfirmed = availableMeals.length === 0 || availableMeals.every(m => updatedConfirmed[m]);
    if (allConfirmed) {
      const streakFn = isViewingToday ? incrementStreak : () => incrementStreakForDate(viewDate);
      const result = await streakFn();
      if (result) {
        setStreak({ currentStreak: result.currentStreak, longestStreak: result.longestStreak, lastConfirmedDate: viewDate });
        const badge = getNewBadge(result.prevLongest, result.longestStreak);
        setPendingBadge(badge);
        setShowStreakCelebration(true);
      }
    }
  };

  const handleConfirmMeal = async (meal) => {
    if (confirmingMeals[meal] || confirmedMeals[meal]) return;
    setConfirmingMeals(prev => ({ ...prev, [meal]: true }));
    const location = selectedLocation[meal];
    const mealItems = customMeals[meal]?.items ?? mealPlan[location][meal].items;
    const today = localDateStr();
    const isViewingToday = viewDate === today;
    const rowId = await addMealToHistory(mealItems, meal, isViewingToday ? null : viewDate);
    setConfirmingMeals(prev => ({ ...prev, [meal]: false }));
    const updatedConfirmed = { ...confirmedMeals, [meal]: true };
    setConfirmedMeals(updatedConfirmed);
    setConfirmedMealIds(prev => ({ ...prev, [meal]: rowId }));
    if (isViewingToday) {
      try {
        localStorage.setItem('bento_confirmed_meals_v2', JSON.stringify({ date: today, meals: updatedConfirmed }));
      } catch { /* localStorage unavailable */ }
    }
    // Show rating sheet; defer streak check until it closes
    pendingStreakRef.current = { isViewingToday, updatedConfirmed };
    setPendingRating({ meal, items: mealItems, locationId: location });
  };

  const handleRatingClose = () => {
    const info = pendingStreakRef.current;
    pendingStreakRef.current = null;
    setPendingRating(null);
    if (info) runStreakCheck(info.isViewingToday, info.updatedConfirmed);
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

  const todayStr    = localDateStr();
  const tomorrowStr = localDateStr(new Date(Date.now() + 86400000));
  const isViewingToday     = viewDate === todayStr;
  const isViewingTomorrow  = viewDate === tomorrowStr;
  const isViewingPast      = viewDate < todayStr;

  if (!mealPlan && !dateLoading && isViewingToday) {
    return (
      <div className="meal-plan-error">
        <p>Unable to generate meal plan. Please complete setup first.</p>
      </div>
    );
  }

  const dayTotals = mealPlan ? calculateSelectedDayTotals() : { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const targets   = mealPlan?.targets;

  const viewDateFormatted = new Date(viewDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const getMealPast = (meal) => {
    if (isViewingPast)    return true;
    if (isViewingTomorrow) return false;
    return hasMealPassed(meal);
  };

  return (
    <div className="meal-plan">
      <header className="meal-plan-header">
        <div className="header-top">
          <img src="/logo-cropped.png" alt="Bento" className="header-logo-sm" />
          {(() => {
            const yesterday = localDateStr(new Date(Date.now() - 86400000));
            const active = streak.lastConfirmedDate === todayStr || streak.lastConfirmedDate === yesterday;
            const effectiveStreak = active ? streak.currentStreak : 0;
            return effectiveStreak > 0 ? (
              <StreakBadge streak={effectiveStreak} onClick={() => setShowBadgesPanel(true)} />
            ) : null;
          })()}
        </div>
        <div className="date-nav">
          <button className="date-nav-btn" onClick={() => navigateDate(-1)} aria-label="Previous day">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <p className="date">{viewDateFormatted}</p>
          <button className="date-nav-btn" onClick={() => navigateDate(1)} disabled={isViewingTomorrow} aria-label="Next day">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </header>

      {isViewingToday && usingCachedData === 'cache' && (
        <div className="cache-warning">
          Showing saved menu · <button onClick={() => loadMenuAndOptimize(true)}>Refresh</button>
        </div>
      )}
      {isViewingToday && usingCachedData === 'offline' && (
        <div className="cache-warning cache-warning-error">
          Couldn't reach dining servers · <button onClick={() => loadMenuAndOptimize(true)}>Retry</button>
        </div>
      )}

      {dateLoading && (
        <div className="date-loading">
          <div className="spinner spinner-sm"></div>
        </div>
      )}

      {!dateLoading && mealPlan && targets && (
        <DailySummary totals={dayTotals} targets={targets} />
      )}

      {!dateLoading && mealPlan && (
      <div className="meals-timeline">
        {['breakfast', 'lunch', 'dinner'].map((meal) => (
          <MealCard
            key={meal}
            meal={meal}
            mealTime={MEAL_TIMES[meal]}
            isPast={getMealPast(meal)}
            locationOptions={Object.values(getUniversityConfig(university).locations).map(loc => ({
              id: loc.id,
              label: loc.shortName,
              allItemsKosher: loc.allItemsKosher ?? false,
            }))}
            locationData={Object.fromEntries(
              Object.keys(getUniversityConfig(university).locations).map(locId => [
                locId,
                {
                  plan: mealPlan[locId]?.[meal],
                  isOpen: menu?.locations?.[locId]?.isOpen ?? true,
                  rawCount: menu?.locations?.[locId]?.meals?.[meal]?.length ?? 0,
                  rawItems: menu?.locations?.[locId]?.meals?.[meal] ?? [],
                },
              ])
            )}
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
      )}

      {pendingRating && (
        <RatingSheet
          meal={pendingRating.meal}
          items={pendingRating.items}
          diningHall={menu?.locations?.[pendingRating.locationId]?.shortName ?? null}
          onClose={handleRatingClose}
        />
      )}

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
