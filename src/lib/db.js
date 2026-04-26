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
    options: { redirectTo: window.location.origin },
  });
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
  };
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
    updated_at:     new Date().toISOString(),
  });
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

const RESTRICTIONS_DEFAULT = {
  vegetarian: false, vegan: false, glutenFree: false, dairyFree: false,
  nutFree: false, halal: false, kosher: false, allergies: [], avoidIngredients: [],
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
  return {
    vegetarian:        data.vegetarian,
    vegan:             data.vegan,
    glutenFree:        data.gluten_free,
    dairyFree:         data.dairy_free,
    nutFree:           data.nut_free,
    halal:             data.halal,
    kosher:            data.kosher,
    allergies:         data.allergies ?? [],
    avoidIngredients:  data.avoid_ingredients ?? [],
  };
}

export async function setDietaryRestrictions(restrictions) {
  const id = await uid();
  if (!id) return;
  await supabase.from('dietary_restrictions').upsert({
    user_id:           id,
    vegetarian:        restrictions.vegetarian,
    vegan:             restrictions.vegan,
    gluten_free:       restrictions.glutenFree,
    dairy_free:        restrictions.dairyFree,
    nut_free:          restrictions.nutFree,
    halal:             restrictions.halal,
    kosher:            restrictions.kosher,
    allergies:         restrictions.allergies,
    avoid_ingredients: restrictions.avoidIngredients,
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

export async function addMealToHistory(mealItems) {
  const id = await uid();
  if (!id) return;
  await supabase.from('meal_history').insert({
    user_id:      id,
    items:        mealItems,
    confirmed_at: new Date().toISOString(),
  });
}

export async function getRecentItemIds() {
  const history = await getMealHistory();
  const ids = new Set();
  history.forEach((entry) => {
    (entry.items ?? []).forEach((item) => ids.add(item.id));
  });
  return ids;
}

// ── Favorites ──────────────────────────────────────────────────────────────

export async function getFavorites() {
  const id = await uid();
  if (!id) return [];
  const { data } = await supabase
    .from('favorites')
    .select('item_id, name, station, nutrition, tags')
    .eq('user_id', id);
  return (data ?? []).map((r) => ({
    id:        r.item_id,
    name:      r.name,
    station:   r.station,
    nutrition: r.nutrition,
    tags:      r.tags,
  }));
}

export async function getFavoriteIds() {
  const favs = await getFavorites();
  return new Set(favs.map((f) => f.id));
}

export async function isFavorite(itemId) {
  const id = await uid();
  if (!id) return false;
  const { data } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', id)
    .eq('item_id', itemId)
    .maybeSingle();
  return !!data;
}

export async function toggleFavorite(item) {
  const id = await uid();
  if (!id) return;
  const existing = await isFavorite(item.id);
  if (existing) {
    await supabase.from('favorites').delete().eq('user_id', id).eq('item_id', item.id);
  } else {
    await supabase.from('favorites').insert({
      user_id:   id,
      item_id:   item.id,
      name:      item.name,
      station:   item.station,
      nutrition: item.nutrition,
      tags:      item.tags,
    });
  }
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

export async function incrementStreak() {
  const id = await uid();
  if (!id) return;
  const today = new Date().toISOString().slice(0, 10);
  const streak = await getStreak();
  if (streak.lastConfirmedDate === today) return; // already confirmed today

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newCurrent = streak.lastConfirmedDate === yesterday ? streak.currentStreak + 1 : 1;
  const newLongest = Math.max(newCurrent, streak.longestStreak);

  await supabase.from('streaks').upsert({
    user_id:             id,
    current_streak:      newCurrent,
    longest_streak:      newLongest,
    last_confirmed_date: today,
  }, { onConflict: 'user_id' });
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

export async function clearAllData() {
  const id = await uid();
  if (!id) return;
  await Promise.all([
    supabase.from('meal_history').delete().eq('user_id', id),
    supabase.from('favorites').delete().eq('user_id', id),
    supabase.from('nutrition_targets').delete().eq('user_id', id),
    supabase.from('dietary_restrictions').delete().eq('user_id', id),
    supabase.from('streaks').delete().eq('user_id', id),
    supabase.from('profiles').update({ weight: null, age: null, terms_accepted: false }).eq('id', id),
  ]);
  await signOut();
}

// ── Menu cache (stays local — ephemeral per device) ────────────────────────

export function getCachedMenu() {
  try {
    const cached = JSON.parse(localStorage.getItem('bento_cached_menu'));
    if (!cached) return null;
    if (cached.date === new Date().toDateString()) return cached.menu;
    return null;
  } catch { return null; }
}

export function setCachedMenu(menu) {
  try {
    localStorage.setItem('bento_cached_menu', JSON.stringify({ date: new Date().toDateString(), menu }));
  } catch {}
}
