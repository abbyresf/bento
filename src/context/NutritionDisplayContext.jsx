import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getUserProfile, setNutritionDisplay } from '../lib/db';

// Controls which nutrition numbers are rendered anywhere in the app.
//
// Some students should not be shown calorie counts — a history of disordered
// eating, or simply no wish to count anything. Hiding is per metric, because
// hiding calories while still tracking protein is a common combination.
//
// Everything defaults to visible, including while the preference is still
// loading, so a slow network never hides numbers someone is relying on. The
// inverse failure (briefly showing a number someone asked to hide) is the one
// that matters here, so `loaded` lets callers hold off rendering until known.

const DEFAULT = { calories: true, protein: true, carbs: true, fat: true };

const NutritionDisplayContext = createContext({
  ...DEFAULT,
  loaded: false,
  anyVisible: true,
  updateDisplay: async () => {},
});

export function NutritionDisplayProvider({ children }) {
  const [prefs, setPrefs] = useState(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getUserProfile()
      .then(profile => {
        if (cancelled) return;
        if (profile?.nutritionDisplay) setPrefs(profile.nutritionDisplay);
      })
      .catch(() => { /* keep defaults — numbers stay visible */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  // Applied locally first so the switch responds immediately; the write is
  // what persists it.
  const updateDisplay = useCallback(async (next) => {
    setPrefs(next);
    try {
      await setNutritionDisplay(next);
    } catch {
      /* the local state still reflects the choice for this session */
    }
  }, []);

  const value = useMemo(() => ({
    ...prefs,
    loaded,
    anyVisible: prefs.calories || prefs.protein || prefs.carbs || prefs.fat,
    updateDisplay,
  }), [prefs, loaded, updateDisplay]);

  return (
    <NutritionDisplayContext.Provider value={value}>
      {children}
    </NutritionDisplayContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNutritionDisplay() {
  return useContext(NutritionDisplayContext);
}
