import { Capacitor } from '@capacitor/core';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { signInWithGoogleNative, signInWithAppleNative } from './nativeAuth';
import { WEB_ORIGIN } from './apiBase';
import { weekRange } from '../data/quests';
import { clearWidget } from './widget';
import { readQueue, removeEntry, updateEntry, bumpAttempts, isOfflineError } from './pendingConfirms';

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
  if (Capacitor.isNativePlatform()) return signInWithGoogleNative();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/app` },
  });
  if (error) throw error;
}

// Native only. The button that calls this is not rendered on the web.
export async function signInWithApple() {
  return signInWithAppleNative();
}

export async function resetPasswordForEmail(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${WEB_ORIGIN}/app`,
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

/* The signed-in user's id, checked with the server (getUser, never getSession:
 * getSession can return null mid-refresh and silently break writes).
 *
 * One exception. With no network, getUser fails with a retryable fetch error
 * and used to return undefined, so every read behaved as if nobody was signed
 * in, which sent a returning student with no signal to onboarding. A network
 * failure says nothing about who is signed in, so only then is the id taken
 * from the stored session. Any other failure still returns undefined. */
async function uid() {
  const { data, error } = await supabase.auth.getUser();
  if (data?.user?.id) return data.user.id;
  if (error && isAuthRetryableFetchError(error)) {
    const { data: s } = await supabase.auth.getSession();
    return s?.session?.user?.id;
  }
  return undefined;
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

// ── Consumption ────────────────────────────────────────────────────────────

// How much of each item a student actually ate, as a fraction of what they
// took. Written onto the meal_history row that addMealToHistory already
// created, so this needs no table of its own and stays attached to the exact
// plate, servings and serving sizes recorded at confirmation time.
//
// A fraction, not a quantity, on purpose. The denominator is already in the
// row: servings multiplied by the serving size the dining hall published that
// day. Storing 0.5 against "2 x 0.5 cup" is recoverable as half a cup; storing
// "half" alone would not be.
export async function setMealConsumption(rowId, consumedById) {
  const id = await uid();
  // Nothing to write is a success. Returns false only when a write was wanted
  // and did not happen, so a queued answer can be tried again.
  if (!consumedById || Object.keys(consumedById).length === 0) return true;
  if (!id || !rowId) return false;

  const { data, error: readError } = await supabase
    .from('meal_history')
    .select('items')
    .eq('id', rowId)
    .eq('user_id', id)
    .maybeSingle();
  if (readError || !data?.items) return false;

  // Only items the student actually answered for are touched. An untouched
  // item keeps whatever it had, which is nothing, rather than being recorded
  // as a zero the student never chose.
  const items = data.items.map(item =>
    Object.prototype.hasOwnProperty.call(consumedById, item.id)
      ? { ...item, consumed: consumedById[item.id] }
      : item
  );

  const { error } = await supabase
    .from('meal_history')
    .update({ items })
    .eq('id', rowId)
    .eq('user_id', id);
  return !error;
}

// ── Feedback ───────────────────────────────────────────────────────────────

// Stored rather than emailed. See migration 030 for why.
// Returns { ok } / { ok: false, reason } so the sheet can say what happened
// instead of showing a generic failure.
export async function sendFeedback({ topic, message, replyEmail }) {
  const id = await uid();
  if (!id) return { ok: false, reason: 'signed-out' };

  const profile = await getUserProfile().catch(() => null);

  const { error } = await supabase.from('feedback').insert({
    user_id:     id,
    topic,
    message:     message.trim(),
    reply_email: replyEmail?.trim() || null,
    university:  profile?.university ?? null,
    // A surprising share of reports turn out to be a stale cached bundle, so
    // record enough to tell that apart from a real bug without asking.
    app_context: {
      installed: window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true,
      ua: navigator.userAgent.slice(0, 300),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      at: new Date().toISOString(),
    },
  });

  if (error) return { ok: false, reason: error.code === '42P01' ? 'not-migrated' : 'failed' };
  return { ok: true };
}

// Theme preference. localStorage is the source of truth on load — reading this
// before first paint would flash the wrong theme — so this write exists only so
// the choice follows someone to a second device. Failures are swallowed: until
// migration 028 is run the column does not exist, and the app is fully usable
// either way.
export async function setThemePref(theme) {
  try {
    const id = await uid();
    if (!id) return;
    await supabase.from('profiles').update({
      theme,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
  } catch { /* offline, signed out, or column not migrated */ }
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
    // Nutrition-display columns are deliberately NOT written here. Settings
    // loads the profile once at mount, so saving it would push a stale copy of
    // the preference over whatever the toggles had since written — which is
    // exactly how turning a metric back on failed to stick. setNutritionDisplay
    // is the only writer for those columns.
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

/* The targets and dietary restrictions this account last read or saved on this
 * device. Used only when a read fails (no signal), so a student who opens the
 * app offline still gets the plate built against THEIR restrictions. Without
 * it a failed restrictions read fell through to "no restrictions", which would
 * build a plate that ignores a saved allergen. Stored under a bento_ key so sign
 * out clears it, and keyed by user so one account never reads another's. */
const PROFILE_CACHE_KEY = 'bento_profile_cache_v1';
function readProfileCache(id) {
  try {
    const c = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || 'null');
    return c && c.userId === id ? c : {};
  } catch { return {}; }
}
function writeProfileCache(id, patch) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ ...readProfileCache(id), ...patch, userId: id }));
  } catch { /* storage unavailable */ }
}

export async function getNutritionTargets() {
  const id = await uid();
  if (!id) return null;
  const { data, error } = await supabase
    .from('nutrition_targets')
    .select('calories, protein, carbs, fat')
    .eq('user_id', id)
    .maybeSingle();
  if (error) return readProfileCache(id).targets ?? null;
  if (!data) return null;
  // Reconstruct the nested shape the optimizer expects
  const targets = {
    calories: data.calories,
    macros: { protein: data.protein, carbs: data.carbs, fat: data.fat },
  };
  writeProfileCache(id, { targets });
  return targets;
}

export async function setNutritionTargets(targets) {
  const id = await uid();
  if (!id) return;
  // targets may be nested { calories, macros: { protein, carbs, fat } } or flat
  const protein = targets.macros?.protein ?? targets.protein;
  const carbs   = targets.macros?.carbs   ?? targets.carbs;
  const fat     = targets.macros?.fat     ?? targets.fat;
  writeProfileCache(id, { targets: { calories: targets.calories, macros: { protein, carbs, fat } } });
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

/* Returns the saved restrictions. When the read FAILS and nothing is cached it
 * returns the empty defaults marked `__unknown`, so a caller can refuse to build
 * a plate against restrictions it never saw. A student with no saved row is not
 * a failure: that is the real defaults, unmarked. */
export async function getDietaryRestrictions() {
  const id = await uid();
  if (!id) return { ...RESTRICTIONS_DEFAULT, __unknown: true };
  const { data, error } = await supabase
    .from('dietary_restrictions')
    .select('*')
    .eq('user_id', id)
    .maybeSingle();
  if (error) return readProfileCache(id).restrictions ?? { ...RESTRICTIONS_DEFAULT, __unknown: true };
  if (!data) return RESTRICTIONS_DEFAULT;
  const { freeText, flags } = decodeAllergens(data.allergies);
  const restrictions = {
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
  writeProfileCache(id, { restrictions });
  return restrictions;
}

export async function setDietaryRestrictions(restrictions) {
  const id = await uid();
  if (!id) return;
  // A read that failed hands back defaults marked __unknown. Saving those would
  // overwrite the student's real restrictions with an empty set.
  if (restrictions?.__unknown) return;
  // Cached before the write on purpose: if the write fails, the next offline
  // plate should still honour what the student just asked to avoid.
  writeProfileCache(id, { restrictions: { ...restrictions } });
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

/* Saves a confirmed meal and returns the row id.
 *
 * THROWS if it did not save. It used to swallow the database's error and return
 * null, and the screen marked the meal confirmed anyway, so a confirmation that
 * never reached the database looked saved. Pulse counts what is in the database,
 * so that made its numbers quietly lower than what students saw on their phones.
 * The thrown error carries the database's code and message so the app can show
 * them. */
export async function addMealToHistory(mealItems, mealType, date = null, diningHall = null, confirmedAt = null) {
  const id = await uid();
  if (!id) {
    const e = new Error('Not signed in'); e.code = 'signed-out'; throw e;
  }
  const { data, error } = await supabase.from('meal_history').upsert({
    user_id:      id,
    items:        mealItems,
    // A meal confirmed with no signal is sent later, but keeps the moment the
    // student tapped Confirm, so Pulse files it under the day it was eaten.
    confirmed_at: confirmedAt ?? new Date().toISOString(),
    meal_type:    mealType ?? null,
    meal_date:    date ?? localDateStr(),
    // Short name, matching item_rating_aggregates.dining_hall so Pulse can put
    // waste and ratings for the same hall side by side. See migration 033.
    dining_hall:  diningHall ?? null,
  }, {
    onConflict: 'user_id,meal_date,meal_type',
  }).select('id').single();
  if (error) {
    const e = new Error(error.message || 'Save failed'); e.code = error.code || 'save-failed';
    // No database code means the request never got an answer, which is how a
    // missing connection looks. See isOfflineError.
    if (!error.code && isOfflineError(e)) e.offline = true;
    throw e;
  }
  if (!data?.id) {
    const e = new Error('The database did not return the saved row'); e.code = 'no-row'; throw e;
  }
  return data.id;
}

/* Sends the meals that were confirmed with no signal (see pendingConfirms.js).
 *
 * Returns { synced, remaining }. synced lists what was saved this time, with the
 * new row ids, so the screen can update and run the streak for each one.
 *
 * Stops at the first connection failure and leaves the rest queued. A refusal
 * from the database is retried a few times and then the entry is given up on, so
 * one bad entry cannot hold up the meals behind it. Only one flush runs at a
 * time, because the screen asks on start, on return to the app, when the
 * connection comes back and on a timer. */
let flushing = null;
export function flushPendingConfirms() {
  if (flushing) return flushing;
  flushing = (async () => {
    const synced = [];
    const id = await uid();
    if (!id) return { synced, remaining: readQueue().length };
    const entries = readQueue()
      .filter((e) => !e.userId || e.userId === id)
      .sort((a, b) => String(a.confirmedAt ?? '').localeCompare(String(b.confirmedAt ?? '')));

    for (const e of entries) {
      let rowId = e.rowId ?? null;
      if (!rowId) {
        try {
          rowId = await addMealToHistory(e.items, e.meal, e.date, e.hall ?? null, e.confirmedAt ?? null);
        } catch (err) {
          if (isOfflineError(err)) break;
          // Refused by the database. Try a few more times, then stop trying.
          if (bumpAttempts(e.date, e.meal) >= 5) removeEntry(e.date, e.meal);
          continue;
        }
        // Remember the saved row, so a later retry of the extras below does not
        // save the meal again.
        updateEntry(e.date, e.meal, { rowId });
        synced.push({ date: e.date, meal: e.meal, rowId });
      }

      // The ratings and the plate-waste answers. They must not undo a saved meal
      // if they fail, so the meal is already recorded above.
      let extrasOk = true;
      for (const r of e.ratings ?? []) {
        if (!(await rateItem(r.item, r.rating, e.hall ?? null))) extrasOk = false;
      }
      if (e.consumed && Object.keys(e.consumed).length > 0) {
        if (!(await setMealConsumption(rowId, e.consumed))) extrasOk = false;
      }
      if (extrasOk || bumpAttempts(e.date, e.meal) >= 5) removeEntry(e.date, e.meal);
    }
    return { synced, remaining: readQueue().length };
  })().finally(() => { flushing = null; });
  return flushing;
}

/* Which meals are confirmed on a date, straight from the database.
 * Returns null, not an empty result, when it could not find out, so a failed
 * read is never mistaken for "nothing confirmed". */
export async function fetchConfirmedMeals(date) {
  const id = await uid();
  if (!id) return null;
  const { data, error } = await supabase
    .from('meal_history')
    .select('id, meal_type, items')
    .eq('user_id', id)
    .eq('meal_date', date);
  if (error) return null;
  const result = { breakfast: null, lunch: null, dinner: null };
  for (const row of (data ?? [])) {
    if (row.meal_type in result) result[row.meal_type] = { rowId: row.id, items: row.items };
  }
  return result;
}

export async function getConfirmedMealsForDate(date) {
  return (await fetchConfirmedMeals(date)) ?? { breakfast: null, lunch: null, dinner: null };
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
  if (!id) return false;
  if (rating === null) {
    const { error } = await supabase.from('item_ratings').delete().eq('user_id', id).eq('item_id', item.id);
    return !error;
  }
  const university = item.id?.startsWith('tu_') ? 'tufts' : 'brandeis';
  const { error } = await supabase.from('item_ratings').upsert({
    user_id:     id,
    item_id:     item.id,
    item_name:   item.name,
    rating,
    university,
    dining_hall: diningHall ?? null,
    updated_at:  new Date().toISOString(),
  }, { onConflict: 'user_id,item_id' });
  return !error;
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

// Both of these gate the whole app, so they return THREE states, not two:
// true, false, or null meaning "could not find out". They used to collapse a
// failed read into false, which is how a momentary database hiccup sent a
// signed-up student back through onboarding, or made them accept the terms
// again. A read failing is not the same as a student not having agreed, and
// the caller must be able to tell the difference.

export async function isOnboardingComplete() {
  const id = await uid();
  if (!id) return null;                 // unknown, not "incomplete"
  const { data, error } = await supabase
    .from('profiles')
    .select('weight, age')
    .eq('id', id)
    .maybeSingle();
  if (error) return null;               // unknown, not "incomplete"
  return !!(data?.weight && data?.age);
}

export async function isTermsAccepted() {
  const id = await uid();
  if (!id) return null;                 // unknown, not "declined"
  const { data, error } = await supabase
    .from('profiles')
    .select('terms_accepted')
    .eq('id', id)
    .maybeSingle();
  if (error) return null;               // unknown, not "declined"
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
  // Clear every local key rather than a hand-maintained list. That list had
  // drifted: it named the v2 menu cache and two older generations but not v3,
  // and it never mentioned the meal-plan cache at all, so a reset quietly left
  // a 30-day plan cache and a stale menu behind. Enumerating by prefix cannot
  // fall out of date the next time a key is versioned.
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('bento_'))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* localStorage unavailable */ }
  await signOut();
}

/* Clears what this device has stored about the signed-in account, and nothing
 * about the device itself.
 *
 * Today's confirmed meals, the built plans and custom meals are kept in
 * localStorage under the day, not under an account. After signing out and
 * signing in as someone else, the new account showed the previous account's
 * confirmed meals, while ratings and Insights, which come from the server,
 * were correctly empty. Found on a phone on 6 Oct 2026.
 *
 * Device settings stay: theme, tour and prompt flags. They belong to the phone,
 * not to who is signed in. clearAllData() below is the full wipe. */
const ACCOUNT_LOCAL_KEYS = [
  'bento_confirmed_meals_v2',
  'bento_meal_plans_v3',
  'bento_custom_meals_v1',
  'bento_mascot_outfit',
  'bento_gates_v1',
  'bento_profile_cache_v1',
  'bento_widget_mascot_sig',
  'bento_pending_confirms_v1',
  'bento_duo_friends_v1',
  'bento_duo_join_code',
  'bento_duo_here',
];

export function clearAccountLocalData() {
  // The widget shows the last plate it was given, so it must be emptied too.
  clearWidget();
  try {
    ACCOUNT_LOCAL_KEYS.forEach(k => localStorage.removeItem(k));
    // Cached menus are public data, but a plan is built from them per student.
    Object.keys(localStorage)
      .filter(k => k.startsWith('bento_menu') || k.startsWith('bento_cached_menu'))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
}

// ── Menu cache (stays local — ephemeral per device) ────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — matches server-side cache TTL

// Bump this whenever the cached menu's shape changes. v2 drops entries written
// while the kosher location was being deleted after the Sherman merge — those
// have no kosher location at all, so it would render as "Closed" until expiry.
// Bump this whenever the cached menu's item shape changes, not just when the
// cache format does. Adding `serving` to items changed that shape, and every
// client holding a v2 entry kept serving up items without it. The version key
// exists precisely so a shape change cannot be served from an old cache.
const CACHE_VERSION = 'v3';

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

// ── Surveys ────────────────────────────────────────────────────────────────
//
// Both calls are RPCs rather than table reads. Deciding which survey a student
// should see means checking their university, their dietary profile against the
// survey's targeting, and whether they have already responded, which is not
// something to express as an RLS policy. See migration 034.

/** The one survey this student should be shown, or null. */
export async function getActiveSurvey() {
  const { data, error } = await supabase.rpc('get_active_survey');
  if (error) return null;
  return data?.[0] ?? null;
}

/**
 * Record an answer, or a dismissal.
 *
 * Returns true when the response is stored. A student who dismisses is not
 * asked again, so a silent failure here would mean the popup returns on every
 * app open, which is worse than the survey never being seen.
 */
export async function submitSurveyResponse(surveyId, { status = 'answered', choice = null, text = null } = {}) {
  const { error } = await supabase.rpc('submit_survey_response', {
    p_survey_id: surveyId,
    p_status: status,
    p_choice: choice,
    p_text: text,
  });
  return !error;
}


/* The numbers on the "Your voice" card: meals this student confirmed this
 * month, and dishes they have rated. Counts only, read from the student's own
 * rows. Returns null if either read failed, so the card hides rather than
 * showing a zero that is not true. */
export async function getVoiceStats() {
  const id = await uid();
  if (!id) return null;
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const [meals, rated] = await Promise.all([
    supabase.from('meal_history').select('id', { count: 'exact', head: true })
      .eq('user_id', id).gte('meal_date', monthStart),
    supabase.from('item_ratings').select('item_id', { count: 'exact', head: true })
      .eq('user_id', id),
  ]);
  if (meals.error || rated.error) return null;
  return { mealsThisMonth: meals.count ?? 0, dishesRated: rated.count ?? 0 };
}

// ── Weekly quests ──────────────────────────────────────────────────────────
// Progress is derived from meal_history and item_ratings (src/data/quests.js).
// Only claims are stored. See migration 042.

/* Everything the quests card needs for one week. Returns null if any read
 * failed, so the card hides rather than showing progress that is not true. */
export async function getQuestWeek(weekStart) {
  const id = await uid();
  if (!id) return null;
  const { start, startDate, endDate } = weekRange(weekStart);
  const [meals, ratings, claims, total] = await Promise.all([
    supabase.from('meal_history').select('meal_date, meal_type, items')
      .eq('user_id', id).gte('meal_date', startDate).lt('meal_date', endDate),
    supabase.from('item_ratings').select('item_id, updated_at')
      .eq('user_id', id).gte('updated_at', start.toISOString()),
    supabase.from('quest_claims').select('quest_id').eq('user_id', id).eq('week_start', weekStart),
    supabase.from('quest_claims').select('quest_id', { count: 'exact', head: true }).eq('user_id', id),
  ]);
  if (meals.error || ratings.error) return null;
  // A missing quest_claims table (migration 042 not run) reads as no claims.
  return {
    meals: meals.data ?? [],
    ratings: ratings.data ?? [],
    claimedIds: claims.error ? [] : (claims.data ?? []).map((r) => r.quest_id),
    totalClaimed: total.error ? 0 : (total.count ?? 0),
    claimsAvailable: !claims.error,
  };
}

/* Records a claim. Throws if it did not save. Claiming twice is harmless. */
export async function claimQuest(questId, weekStart) {
  const id = await uid();
  if (!id) { const e = new Error('Not signed in'); e.code = 'signed-out'; throw e; }
  const { error } = await supabase.from('quest_claims')
    .upsert({ user_id: id, quest_id: questId, week_start: weekStart },
      { onConflict: 'user_id,quest_id,week_start', ignoreDuplicates: true });
  if (error) { const e = new Error(error.message || 'Claim failed'); e.code = error.code || 'claim-failed'; throw e; }
}

/* How many quests this student has claimed in total, or 0 if unknown. */
export async function getQuestsClaimed() {
  const id = await uid();
  if (!id) return 0;
  const { count, error } = await supabase.from('quest_claims')
    .select('quest_id', { count: 'exact', head: true }).eq('user_id', id);
  return error ? 0 : (count ?? 0);
}
