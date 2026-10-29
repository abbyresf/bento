import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { athleteDailyTargets, DEFAULT_LOAD, LOADS } from '../utils/athleteTargets';
import { calculateBMR, lbsToKg, feetInchesToCm } from '../utils/tdeeCalculator';
import { teamById } from '../data/athleteTeams';

/* Athlete mode on the phone (ATHLETE_SPEC.md, phase 1).
 *
 *   settings   on or off, the athlete's team, and any target they moved. athlete_profiles (migrations 064 and 065). The
 *              sport_group and season_phase columns from 064 are no longer used: the team sets the sport, and its
 *              schedule sets the season.
 *   load       one per date: rest, light, heavy or double. athlete_load_days. A date with none is a light day.
 *   snacks     one per gap in the day (morning, afternoon, evening), each with its items and totals. snacks.
 *
 * Each is kept on the phone for speed and written to the database so it follows the athlete to a new phone. A failed call
 * leaves the phone's copy working. If migration 064 has not been run, `available` is false and the app hides Athlete mode.
 *
 * Every key starts with bento_ and is listed in db.js (ACCOUNT_LOCAL_KEYS), so signing out clears them. */
const SETTINGS_KEY = 'bento_athlete_v1';
const LOADS_KEY = 'bento_athlete_loads_v1';
const SNACKS_KEY = 'bento_snacks_v1';
const KEEP_DAYS = 14;
export const SNACK_SLOTS = ['morning', 'afternoon', 'evening'];

const EMPTY_SETTINGS = { athleteMode: false, team: null, custom: {}, body: null, university: null, sex: null };
const NONE = {};
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } };
const missing = (error) => ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code);

let available = true;
let settings = { ...EMPTY_SETTINGS, ...read(SETTINGS_KEY, {}) };
let loads = read(LOADS_KEY, {});     // { date: load }
let snacks = read(SNACKS_KEY, {});   // { date: { slot: { items, totals, hall } } }

// Only the last two weeks and the days ahead are kept.
const recent = (obj) => {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  return Object.fromEntries(Object.entries(obj).filter(([d]) => d >= cutoff));
};

const userId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
};

/* The body numbers the targets need, from the profile. Null when any is missing. */
function bodyFrom(p) {
  if (!p || !(p.weight > 0)) return null;
  const weightKg = p.weight_unit === 'lbs' ? lbsToKg(p.weight) : p.weight;
  const heightCm = feetInchesToCm(p.height_feet ?? 0, p.height_inches ?? 0);
  const bmr = heightCm > 0 && p.age > 0 && p.sex ? Math.round(calculateBMR(weightKg, heightCm, p.age, p.sex)) : 0;
  return { weightKg, bmr };
}

function setSettings(next) {
  settings = next;
  write(SETTINGS_KEY, settings);
  emit();
}

/* Reads everything for the signed-in student. Call once when they sign in, and again after their profile changes. A failed
 * read leaves what is showing alone. */
export async function loadAthlete() {
  try {
    const id = await userId();
    if (!id) return;
    const since = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
    const [prof, body, days, snackRows] = await Promise.all([
      supabase.from('athlete_profiles').select('athlete_mode, team, carbs_g_per_kg, protein_g_per_kg, fat_share').eq('user_id', id).maybeSingle(),
      supabase.from('profiles').select('weight, weight_unit, height_feet, height_inches, age, sex, university').eq('id', id).maybeSingle(),
      supabase.from('athlete_load_days').select('load_date, load').eq('user_id', id).gte('load_date', since),
      supabase.from('snacks').select('snack_date, slot, dining_hall, items, calories, protein, carbs, fat').eq('user_id', id).gte('snack_date', since),
    ]);
    if (missing(prof.error)) { available = false; emit(); return; }
    available = true;
    const next = { ...settings };
    if (!body.error) {
      next.body = bodyFrom(body.data);
      next.university = body.data?.university ?? null;
      next.sex = body.data?.sex ?? null;
    }
    if (!prof.error) {
      const r = prof.data;
      next.athleteMode = r?.athlete_mode ?? false;
      next.team = r?.team ?? null;
      next.custom = {
        carbs: r?.carbs_g_per_kg ?? {},
        protein: r?.protein_g_per_kg == null ? null : Number(r.protein_g_per_kg),
        fatShare: r?.fat_share == null ? null : Number(r.fat_share),
      };
    }
    if (!days.error) {
      loads = Object.fromEntries((days.data ?? []).map((d) => [d.load_date, d.load]));
      write(LOADS_KEY, loads);
    }
    if (!snackRows.error) {
      const byDate = {};
      for (const s of snackRows.data ?? []) {
        (byDate[s.snack_date] ??= {})[s.slot] = {
          items: s.items ?? [], hall: s.dining_hall,
          totals: { calories: Number(s.calories), protein: Number(s.protein), carbs: Number(s.carbs), fat: Number(s.fat) },
        };
      }
      snacks = byDate;
      write(SNACKS_KEY, snacks);
    }
    setSettings(next);
  } catch { /* keep the phone's copy */ }
}

/* Changes any of: athleteMode, team, custom. Turning the mode off deletes nothing. The phone's copy changes at
 * once and the database a moment later, so dragging a slider sends one write, not one per step. */
let saveTimer = null;
export function updateAthlete(patch) {
  setSettings({ ...settings, ...patch });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveAthlete, 400);
}

async function saveAthlete() {
  try {
    const id = await userId();
    if (!id) return;
    const c = settings.custom ?? {};
    await supabase.from('athlete_profiles').upsert({
      user_id: id,
      athlete_mode: settings.athleteMode,
      team: settings.team,
      carbs_g_per_kg: c.carbs ?? {},
      protein_g_per_kg: c.protein ?? null,
      fat_share: c.fatShare ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch { /* the phone's copy still holds */ }
}

export const getLoad = (date) => loads[date] ?? DEFAULT_LOAD;

export async function setLoad(date, load) {
  if (!LOADS.includes(load)) return;
  loads = recent({ ...loads, [date]: load });
  write(LOADS_KEY, loads);
  emit();
  try {
    const id = await userId();
    if (id) await supabase.from('athlete_load_days').upsert({ user_id: id, load_date: date, load, updated_at: new Date().toISOString() }, { onConflict: 'user_id,load_date' });
  } catch { /* the phone's copy still holds */ }
}

export const getSnacks = (date) => snacks[date] ?? NONE;

/* Saves the snack for one gap in the day, or removes it when `snack` is null. `snack` is { items, totals, hall }. */
export async function setSnack(date, slot, snack) {
  if (!SNACK_SLOTS.includes(slot)) return;
  const day = { ...(snacks[date] ?? {}) };
  if (snack && snack.items?.length) day[slot] = snack; else delete day[slot];
  snacks = recent({ ...snacks, [date]: day });
  write(SNACKS_KEY, snacks);
  emit();
  try {
    const id = await userId();
    if (!id) return;
    if (!day[slot]) {
      await supabase.from('snacks').delete().eq('user_id', id).eq('snack_date', date).eq('slot', slot);
      return;
    }
    const t = snack.totals ?? {};
    await supabase.from('snacks').upsert({
      user_id: id, snack_date: date, slot, dining_hall: snack.hall ?? null, items: snack.items,
      calories: Math.max(0, t.calories ?? 0), protein: Math.max(0, t.protein ?? 0),
      carbs: Math.max(0, t.carbs ?? 0), fat: Math.max(0, t.fat ?? 0),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,snack_date,slot' });
  } catch { /* the phone's copy still holds */ }
}

/* The day's targets for planning. In Athlete mode they come from the athlete presets for that date's load. Otherwise, or with
 * no body weight on the profile, they are the student's normal targets, unchanged. */
export function dailyTargetsFor(base, date) {
  if (!base || !available || !settings.athleteMode || !settings.body) return base;
  return athleteDailyTargets({ ...settings.body, load: getLoad(date), custom: settings.custom, sport: athleteSport() }) ?? base;
}

/* True when Athlete mode is on and its tables exist. The planner then fills plates for training (mealOptimizer options.fuel). */
export const isAthleteOn = () => available && settings.athleteMode;

/* The sport of the athlete's team, which picks the published guidance. Null with no team, or a team this school does not list. */
export function athleteSport(s = settings) {
  return teamById(s.university, s.team)?.sport ?? null;
}

/* Called on sign out, after local storage has been cleared. */
export function resetAthlete() { clearTimeout(saveTimer); settings = { ...EMPTY_SETTINGS }; loads = {}; snacks = {}; emit(); }

const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
export const useAthlete = () => useSyncExternalStore(subscribe, () => settings, () => EMPTY_SETTINGS);
export const useAthleteAvailable = () => useSyncExternalStore(subscribe, () => available, () => false);
export const useLoad = (date) => useSyncExternalStore(subscribe, () => getLoad(date), () => DEFAULT_LOAD);
export const useSnacks = (date) => useSyncExternalStore(subscribe, () => getSnacks(date), () => NONE);
