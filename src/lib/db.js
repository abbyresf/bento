import { supabase } from './supabase';

// ── Auth helpers ───────────────────────────────────────────────────────────

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/app` },
  });
  if (error) throw error;
}

export async function resetPasswordForEmail(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/app`,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

function uid() {
  return supabase.auth.getUser().then(({ data }) => data.user?.id);
}

// ── User Profile ───────────────────────────────────────────────────────────

export async function getUserProfile() {
  const id = await uid();
  if (!id) return null;
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();
  if (!data) return null;
  return {
    weight:        data.weight,
    weightUnit:    data.weight_unit,
    heightFeet:    data.height_feet,
    heightInches:  data.height_inches,
    age:           data.age,
    sex:           data.sex,
    activityLevel: data.activity_level,
    goal:          data.goal,
    university:    data.university,
    // Which nutrition numbers this person wants to see. Defaults to visible so
    // a missing row never silently hides information someone relies on.
    nutritionDisplay: {
      calories: data.show_calories ?? true,
      protein:  data.show_protein  ?? true,
      carbs:    data.show_carbs    ?? true,
      fat:      data.show_fat      ?? true,
    },
  };
}

// Stored on the profile, but updated on its own so toggling a switch in
// Settings never has to round-trip the rest of the profile.
export async function setNutritionDisplay(prefs) {
  const id = await uid();
  if (!id) return;
  await supabase.from('profiles').update({
    show_calories: prefs.calories ?? true,
    show_protein:  prefs.protein  ?? true,
    show_carbs:    prefs.carbs    ?? true,
    show_fat:      prefs.fat      ?? true,
    updated_at:    new Date().toISOString(),
  }).eq('id', id);
}

export async function setUserProfile(profile) {
  const id = await uid();
  if (!id) return;
  await supabase.from('profiles').upsert({
    id,
    weight:         profile.weight,
    weight_unit:    profile.weightUnit,
    height_feet:    profile.heightFeet,
    height_inches:  profile.heightInches,
    age:            profile.age,
    sex:            profile.sex,
    activity_level: profile.activityLevel,
    goal:           profile.goal,
    university:     profile.university,
    ...(profile.nutritionDisplay ? {
      show_calories: profile.nutritionDisplay.calories ?? true,
      show_protein:  profile.nutritionDisplay.protein  ?? true,
      show_carbs:    profile.nutritionDisplay.carbs    ?? true,
      show_fat:      profile.nutritionDisplay.fat      ?? true,
    } : {}),
    updated_at:     new Date().toISOString(),
  });
}

// ── Install tracking ───────────────────────────────────────────────────────

// Records whether the app is running as an installed PWA. This gates the
// notification work: iOS delivers web push only to a home-screen install, so
// without this number "should we build push" is unanswerable.
//
// Writes are skipped when nothing changed. This runs on every load, and a
// per-load write for a value that changes maybe once per user would be pure
// noise. installed_at is set once and never cleared, so someone who installs
// and later removes the app stays distinguishable from someone who never did.
const INSTALL_CACHE_KEY = 'bento_install_state_v1';

export async function recordInstallState({ installed, platform }) {
  const id = await uid();
  if (!id) return;

  const signature = `${installed}|${platform}`;
  try {
    if (localStorage.getItem(INSTALL_CACHE_KEY) === signature) return;
  } catch { /* localStorage unavailable — fall through and write */ }

  const patch = {
    is_installed:       installed,
    install_platform:   platform,
    last_install_check: new Date().toISOString(),
  };

  // Only stamp the first install, never overwrite it on later visits.
  if (installed) {
    const { data } = await supabase
      .from('profiles')
      .select('installed_at')
      .eq('id', id)
      .maybeSingle();
    if (!data?.installed_at) patch.installed_at = new Date().toISOString();
  }

  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) return; // leave the cache unset so the next load retries

  try { localStorage.setItem(INSTALL_CACHE_KEY, signature); } catch { /* ignore */ }
}

// ── Nutrition Targets ──────────────────────────────────────────────────────

export async function getNutritionTargets() {
  const id = await uid();
  if (!id) return null;
  const { data } = await supabase
    .from('nutrition_targets')
    .select('calories, protein, carbs, fat')
    .eq('user_id', id)
    .single();
  if (!data) return null;
  // Reconstruct the nested shape the optimizer expects
  return {
    calories: data.calories,
    macros: { protein: data.protein, carbs: data.carbs, fat: data.fat },
  };
}

export async function setNutritionTargets(targets) {
  const id = await uid();
  if (!id) return;
  // targets may be nested { calories, macros: { protein, carbs, fat } } or flat
  const protein = targets.macros?.protein ?? targets.protein;
  const carbs   = targets.macros?.carbs   ?? targets.carbs;
  const fat     = targets.macros?.fat     ?? targets.fat;
  await supabase.from('nutrition_targets').upsert({
    user_id:    id,
    calories:   targets.calories,
    protein,
    carbs,
    fat,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

// ── Dietary Restrictions ───────────────────────────────────────────────────

// Structured allergen keys stored as "__allergen:X" entries in the allergies JSONB array.
// This avoids a schema migration while keeping allergen prefs alongside the existing data.
const ALLERGEN_KEYS = ['milk', 'eggs', 'wheat', 'soy', 'fish', 'shellfish', 'treeNuts', 'peanuts', 'sesame'];
const ALLERGEN_PREFIX = '__allergen:';

function encodeAllergens(restrictions, freeTextAllergies) {
  const encoded = ALLERGEN_KEYS
    .filter(k => restrictions[k])
    .map(k => `${ALLERGEN_PREFIX}${k}`);
  return [...(freeTextAllergies ?? []), ...encoded];
}

function decodeAllergens(rawAllergies) {
  const freeText = [];
  const flags = {};
  for (const a of rawAllergies ?? []) {
    if (typeof a === 'string' && a.startsWith(ALLERGEN_PREFIX)) {
      const key = a.slice(ALLERGEN_PREFIX.length);
      flags[key] = true;
    } else {
      freeText.push(a);
    }
  }
  return { freeText, flags };
}

const RESTRICTIONS_DEFAULT = {
  vegetarian: false, vegan: false, glutenFree: false, halal: false, kosher: false,
  milk: false, eggs: false, wheat: false, soy: false, fish: false,
  shellfish: false, treeNuts: false, peanuts: false, sesame: false,
  allergies: [], avoidIngredients: [],
};

export async function getDietaryRestrictions() {
  const id = await uid();
  if (!id) return RESTRICTIONS_DEFAULT;
  const { data } = await supabase
    .from('dietary_restrictions')
    .select('*')
    .eq('user_id', id)
    .single();
  if (!data) return RESTRICTIONS_DEFAULT;
  const { freeText, flags } = decodeAllergens(data.allergies);
  return {
    vegetarian:        data.vegetarian    ?? false,
    vegan:             data.vegan         ?? false,
    glutenFree:        data.gluten_free   ?? false,
    halal:             data.halal         ?? false,
    kosher:            data.kosher        ?? false,
    // Structured allergens decoded from the allergies JSONB column
    milk:              flags.milk         ?? false,
    eggs:              flags.eggs         ?? false,
    wheat:             flags.wheat        ?? false,
    soy:               flags.soy          ?? false,
    fish:              flags.fish         ?? false,
    shellfish:         flags.shellfish    ?? false,
    treeNuts:          flags.treeNuts     ?? false,
    peanuts:           flags.peanuts      ?? false,
    sesame:            flags.sesame       ?? false,
    allergies:         freeText,
    avoidIngredients:  data.avoid_ingredients ?? [],
  };
}

export async function setDietaryRestrictions(restrictions) {
  const id = await uid();
  if (!id) return;
  await supabase.from('dietary_restrictions').upsert({
    user_id:           id,
    vegetarian:        restrictions.vegetarian  ?? false,
    vegan:             restrictions.vegan       ?? false,
    gluten_free:       restrictions.glutenFree  ?? false,
    dairy_free:        false, // replaced by milk allergen
    nut_free:          false, // replaced by treeNuts + peanuts allergens
    halal:             restrictions.halal       ?? false,
    kosher:            restrictions.kosher      ?? false,
    allergies:         encodeAllergens(restrictions, restrictions.allergies),
    avoid_ingredients: restrictions.avoidIngredients ?? [],
    updated_at:        new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

// ── Meal History ───────────────────────────────────────────────────────────

export async function getMealHistory() {
  const id = await uid();
  if (!id) return [];
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('meal_history')
    .select('items, confirmed_at')
    .eq('user_id', id)
    .gte('confirmed_at', twoWeeksAgo);
  return data ?? [];
}

export async function addMealToHistory(mealItems, mealType, date = null) {
  const id = await uid();
  if (!id) return null;
  const { data } = await supabase.from('meal_history').upsert({
    user_id:      id,
    items:        mealItems,
    confirmed_at: new Date().toISOString(),
    meal_type:    mealType ?? null,
    meal_date:    date ?? localDateStr(),
  }, {
    onConflict: 'user_id,meal_date,meal_type',
  }).select('id').single();
  return data?.id ?? null;
}

export async function getConfirmedMealsForDate(date) {
  const id = await uid();
  if (!id) return { breakfast: null, lunch: null, dinner: null };
  const { data } = await supabase
    .from('meal_history')
    .select('id, meal_type, items')
    .eq('user_id', id)
    .eq('meal_date', date);
  const result = { breakfast: null, lunch: null, dinner: null };
  for (const row of (data ?? [])) {
    if (row.meal_type in result) result[row.meal_type] = { rowId: row.id, items: row.items };
  }
  return result;
}

export async function removeMealFromHistory(rowId) {
  const id = await uid();
  if (!id || !rowId) return;
  await supabase.from('meal_history').delete().eq('id', rowId).eq('user_id', id);
}

export async function getRecentItemIds() {
  const id = await uid();
  if (!id) return new Set();
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('meal_history')
    .select('items')
    .eq('user_id', id)
    .gte('confirmed_at', twoWeeksAgo);
  const ids = new Set();
  for (const row of (data ?? [])) {
    for (const item of (row.items ?? [])) {
      if (item.id) ids.add(item.id);
    }
  }
  return ids;
}

// ── Ratings ────────────────────────────────────────────────────────────────

// Returns a plain object { [item_id]: rating } for all items this user has rated.
export async function getMyRatings() {
  const id = await uid();
  if (!id) return {};
  const { data } = await supabase
    .from('item_ratings')
    .select('item_id, item_name, rating, updated_at')
    .eq('user_id', id);
  return Object.fromEntries((data ?? []).map(r => [r.item_id, { rating: r.rating, name: r.item_name, updatedAt: r.updated_at }]));
}

// Upserts a rating. Passing null removes it.
export async function rateItem(item, rating, diningHall = null) {
  const id = await uid();
  if (!id) return;
  if (rating === null) {
    await supabase.from('item_ratings').delete().eq('user_id', id).eq('item_id', item.id);
    return;
  }
  const university = item.id?.startsWith('tu_') ? 'tufts' : 'brandeis';
  await supabase.from('item_ratings').upsert({
    user_id:     id,
    item_id:     item.id,
    item_name:   item.name,
    rating,
    university,
    dining_hall: diningHall ?? null,
    updated_at:  new Date().toISOString(),
  }, { onConflict: 'user_id,item_id' });
}

// Returns aggregate ratings for all items — used for the leaderboard and badge.
export async function getRatingAggregates(university) {
  let query = supabase
    .from('item_rating_aggregates')
    .select('item_id, item_name, avg_rating, rating_count, dining_hall');
  if (university) query = query.eq('university', university);
  const { data } = await query;
  return Object.fromEntries(
    (data ?? []).map(r => [r.item_id, { name: r.item_name, avg: parseFloat(r.avg_rating), count: r.rating_count, diningHall: r.dining_hall ?? null }])
  );
}

// ── Suggestions ────────────────────────────────────────────────────────────

export async function getSuggestions({ orderBy = 'emphasize_count', university } = {}) {
  const col = orderBy === 'emphasize_count' ? 'emphasize_count' : 'created_at';
  let query = supabase
    .from('suggestions')
    .select('id, content, emphasize_count, created_at')
    .eq('is_hidden', false);
  if (university) query = query.eq('university', university);
  const { data } = await query.order(col, { ascending: false }).limit(100);
  return data ?? [];
}

export async function getMyEmphasizes() {
  const id = await uid();
  if (!id) return new Set();
  const { data } = await supabase
    .from('suggestion_emphasizes')
    .select('suggestion_id')
    .eq('user_id', id);
  return new Set((data ?? []).map(r => r.suggestion_id));
}

export async function submitSuggestion(content) {
  const { data, error } = await supabase.rpc('submit_suggestion', { p_content: content });
  if (error) throw error;
  return data;
}

export async function toggleEmphasize(suggestionId) {
  const { data, error } = await supabase.rpc('toggle_emphasize', { p_suggestion_id: suggestionId });
  if (error) throw error;
  return data?.[0] ?? null;
}

// Which suggestions this user has already flagged. Without this the flag icon
// resets on every reload, since a flag left no per-user record.
export async function getMyFlags() {
  const id = await uid();
  if (!id) return new Set();
  const { data } = await supabase
    .from('suggestion_flags')
    .select('suggestion_id')
    .eq('user_id', id);
  return new Set((data ?? []).map(r => r.suggestion_id));
}

export async function flagSuggestion(suggestionId) {
  const { error } = await supabase.rpc('flag_suggestion', { p_suggestion_id: suggestionId });
  if (error) throw error;
}

// ── Weekly summaries ───────────────────────────────────────────────────────

export async function getWeeklyHistoryFromMealHistory(weeks = 8) {
  const id = await uid();
  if (!id) return [];
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: history } = await supabase
    .from('meal_history')
    .select('confirmed_at, meal_type')
    .eq('user_id', id)
    .gte('confirmed_at', since);
  if (!history?.length) return [];

  const weekMap = {};
  for (const entry of history) {
    if (!entry.meal_type) continue; // skip legacy rows without meal_type
    const date = new Date(entry.confirmed_at);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(date);
    monday.setDate(date.getDate() + diff);
    const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    const dateStr = localDateStr(new Date(entry.confirmed_at));
    if (!weekMap[weekStart]) weekMap[weekStart] = new Set();
    weekMap[weekStart].add(dateStr);
  }

  return Object.entries(weekMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([week_start, days]) => ({ week_start, streak_at_end: days.size }));
}

export async function getWeeklySummaries(limit = 8) {
  const id = await uid();
  if (!id) return [];
  const { data } = await supabase
    .from('weekly_summaries')
    .select('week_start, avg_calories, avg_protein, avg_carbs, avg_fat, top_foods, best_day, streak_at_end')
    .eq('user_id', id)
    .order('week_start', { ascending: false })
    .limit(limit);
  return data ?? [];
}

// For rows with meal_type: keep only the latest per (date, meal_type).
// Rows without meal_type are legacy test data — skip them to avoid double-counting.
function deduplicateMealHistory(history) {
  const seen = new Map();
  for (const entry of history ?? []) {
    if (!entry.meal_type) continue;
    const date = entry.meal_date ?? localDateStr(new Date(entry.confirmed_at));
    const key = `${date}:${entry.meal_type}`;
    const existing = seen.get(key);
    if (!existing || entry.confirmed_at > existing.confirmed_at) {
      seen.set(key, { ...entry, _date: date });
    }
  }
  return Array.from(seen.values());
}

// Count how many days in the past 7 days each macro goal was hit (≥80% of target).
export async function getDailyGoalHits() {
  const id = await uid();
  if (!id) return null;

  const today = new Date();
  const sevenDaysStart = new Date(today);
  sevenDaysStart.setDate(today.getDate() - 6);
  sevenDaysStart.setHours(0, 0, 0, 0);

  const [{ data: history }, { data: targetsRaw }] = await Promise.all([
    supabase.from('meal_history').select('items, confirmed_at, meal_type, meal_date').eq('user_id', id).gte('confirmed_at', sevenDaysStart.toISOString()),
    supabase.from('nutrition_targets').select('calories, protein, carbs, fat').eq('user_id', id).maybeSingle(),
  ]);

  if (!targetsRaw) return null;

  const deduped = deduplicateMealHistory(history);
  if (!deduped.length) return null;

  const byDay = {};
  for (const entry of deduped) {
    const date = entry._date;
    if (!byDay[date]) byDay[date] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    for (const item of entry.items ?? []) {
      const n = item.nutrition ?? {};
      byDay[date].calories += n.calories ?? 0;
      byDay[date].protein  += n.protein  ?? 0;
      byDay[date].carbs    += n.carbs    ?? 0;
      byDay[date].fat      += n.fat      ?? 0;
    }
  }

  const days = Object.values(byDay);
  if (!days.length) return null;

  const n = days.length;
  return {
    numDays:      7,
    calories:     days.filter(d => d.calories >= targetsRaw.calories * 0.8).length,
    protein:      days.filter(d => d.protein  >= targetsRaw.protein  * 0.8).length,
    carbs:        days.filter(d => d.carbs    >= targetsRaw.carbs    * 0.8).length,
    fat:          days.filter(d => d.fat      >= targetsRaw.fat      * 0.8).length,
    avgCalories:  Math.round(days.reduce((s, d) => s + d.calories, 0) / n),
    avgProtein:   Math.round(days.reduce((s, d) => s + d.protein,  0) / n),
    avgCarbs:     Math.round(days.reduce((s, d) => s + d.carbs,    0) / n),
    avgFat:       Math.round(days.reduce((s, d) => s + d.fat,      0) / n),
    targets:      targetsRaw,
  };
}

// Per-day breakdown for the past 7 days, using local dates (no UTC rollover bug).
export async function getDailyBreakdown() {
  const id = await uid();
  if (!id) return [];

  const today = new Date();
  const sevenDaysStart = new Date(today);
  sevenDaysStart.setDate(today.getDate() - 6);
  sevenDaysStart.setHours(0, 0, 0, 0);

  const { data: history } = await supabase
    .from('meal_history')
    .select('items, confirmed_at, meal_type, meal_date')
    .eq('user_id', id)
    .gte('confirmed_at', sevenDaysStart.toISOString());

  const deduped = deduplicateMealHistory(history);

  const dayMap = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = localDateStr(d);
    dayMap[key] = {
      date: key,
      dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
      calories: 0, protein: 0, carbs: 0, fat: 0,
      hasData: false,
    };
  }

  for (const entry of deduped) {
    const localDate = entry._date;
    if (!dayMap[localDate]) continue;
    dayMap[localDate].hasData = true;
    for (const item of entry.items ?? []) {
      const n = item.nutrition ?? {};
      dayMap[localDate].calories += n.calories ?? 0;
      dayMap[localDate].protein  += n.protein  ?? 0;
      dayMap[localDate].carbs    += n.carbs    ?? 0;
      dayMap[localDate].fat      += n.fat      ?? 0;
    }
  }

  return Object.values(dayMap);
}

// ── Streaks ────────────────────────────────────────────────────────────────

export async function getStreak() {
  const id = await uid();
  if (!id) return { currentStreak: 0, longestStreak: 0 };
  const { data } = await supabase
    .from('streaks')
    .select('current_streak, longest_streak, last_confirmed_date')
    .eq('user_id', id)
    .maybeSingle();
  if (!data) return { currentStreak: 0, longestStreak: 0 };
  return {
    currentStreak:     data.current_streak,
    longestStreak:     data.longest_streak,
    lastConfirmedDate: data.last_confirmed_date,
  };
}

// Local date string (YYYY-MM-DD) — avoids UTC rollover issues for late-night confirmations
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Called when a fresh menu loads — records whether any dining location was open today.
// Non-critical: errors are intentionally swallowed by the caller.
export async function recordDiningAvailability(anyOpen, university = 'brandeis') {
  const today = localDateStr();
  await supabase
    .from('dining_availability')
    .upsert({ date: today, university, any_open: anyOpen }, { onConflict: 'date,university' });
}

export async function incrementStreak() {
  const id = await uid();
  if (!id) return null;
  const { data, error } = await supabase.rpc('increment_streak', {
    p_user_id: id,
    p_date: localDateStr(),
  });
  if (error || !data?.length) return null;
  const { current_streak, longest_streak, prev_longest } = data[0];
  return { currentStreak: current_streak, longestStreak: longest_streak, prevLongest: prev_longest };
}

// Retroactive streak update for a past date (e.g. the user went back and confirmed yesterday).
// The RPC handles the no-op cases: already confirmed, or date before last confirmed.
export async function incrementStreakForDate(date) {
  const id = await uid();
  if (!id) return null;
  if (date > localDateStr()) return null;
  const { data, error } = await supabase.rpc('increment_streak', {
    p_user_id: id,
    p_date: date,
  });
  if (error || !data?.length) return null;
  const { current_streak, longest_streak, prev_longest } = data[0];
  return { currentStreak: current_streak, longestStreak: longest_streak, prevLongest: prev_longest };
}

// ── Onboarding / Terms ─────────────────────────────────────────────────────

export async function isOnboardingComplete() {
  const profile = await getUserProfile();
  return !!(profile?.weight && profile?.age);
}

export async function isTermsAccepted() {
  const id = await uid();
  if (!id) return false;
  const { data } = await supabase
    .from('profiles')
    .select('terms_accepted')
    .eq('id', id)
    .single();
  return data?.terms_accepted === true;
}

export async function setTermsAccepted() {
  const id = await uid();
  if (!id) return;
  await supabase.from('profiles').update({ terms_accepted: true }).eq('id', id);
}

// ── Data management ───────────────────────────────────────────────────────

export async function clearMealHistory() {
  const id = await uid();
  if (!id) return;
  await supabase.from('meal_history').delete().eq('user_id', id);
}

export async function deleteAccount() {
  await supabase.rpc('delete_user');
}

export async function submitWaitlistEntry(email, universityName) {
  const { error } = await supabase
    .from('waitlist_submissions')
    .insert({ email: email.trim(), university_name: universityName.trim() });
  if (error) throw error;
}

export async function submitUniversityRequest({ university, email, name, referral, notify }) {
  const id = await uid().catch(() => null);
  const { error } = await supabase
    .from('university_requests')
    .insert({ user_id: id ?? null, university, email, name: name || null, referral: referral || null, notify: !!notify });
  if (error) throw error;
}

export async function clearAllData() {
  const id = await uid();
  if (!id) return;
  await Promise.all([
    supabase.from('meal_history').delete().eq('user_id', id),
    supabase.from('item_ratings').delete().eq('user_id', id),
    supabase.from('nutrition_targets').delete().eq('user_id', id),
    supabase.from('dietary_restrictions').delete().eq('user_id', id),
    supabase.from('streaks').delete().eq('user_id', id),
    supabase.from('weekly_summaries').delete().eq('user_id', id),
    supabase.from('profiles').update({ weight: null, age: null, terms_accepted: false }).eq('id', id),
  ]);
  // Clear all local state so swipe onboarding, confirmed meals, and menu cache reset
  ['bento_swipe_done', 'bento_confirmed_meals_v2',
   'bento_cached_menu_v2_brandeis', 'bento_cached_menu_v2_tufts',
   'bento_cached_menu_brandeis', 'bento_cached_menu_tufts', // pre-v2 keys
   'bento_cached_menu', // legacy key
  ].forEach(k => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  });
  await signOut();
}

// ── Menu cache (stays local — ephemeral per device) ────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — matches server-side cache TTL

// Bump this whenever the cached menu's shape changes. v2 drops entries written
// while the kosher location was being deleted after the Sherman merge — those
// have no kosher location at all, so it would render as "Closed" until expiry.
const CACHE_VERSION = 'v2';

export function getCachedMenu(university = 'brandeis') {
  try {
    const key = `bento_cached_menu_${CACHE_VERSION}_${university}`;
    const cached = JSON.parse(localStorage.getItem(key));
    if (!cached) return null;
    if (cached.date !== localDateStr()) return null;
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
    return cached.menu;
  } catch { return null; }
}

// Age of the cached menu in ms, or null if there is no usable entry.
// Callers use this to decide whether to flag the menu as stale in the UI.
export function getCachedMenuAge(university = 'brandeis') {
  try {
    const key = `bento_cached_menu_${CACHE_VERSION}_${university}`;
    const cached = JSON.parse(localStorage.getItem(key));
    if (!cached?.fetchedAt) return null;
    return Date.now() - cached.fetchedAt;
  } catch { return null; }
}

export function setCachedMenu(menu, university = 'brandeis') {
  try {
    const key = `bento_cached_menu_${CACHE_VERSION}_${university}`;
    localStorage.setItem(key, JSON.stringify({ date: localDateStr(), fetchedAt: Date.now(), menu }));
  } catch { /* localStorage unavailable */ }
}
