import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

/* Two switches about which meals Bento plans.
 *
 *   skip breakfast  a standing choice: this student does not eat breakfast at the dining hall. Bento then plans two larger
 *                   meals. Kept on the phone for speed and in profiles.skip_breakfast (migration 053) so it follows the
 *                   student to a new phone. A missing column or a failed call leaves the phone's copy working.
 *   dinner out      one day at a time: dinner is eaten somewhere else today, or was. Kept on the phone only, for the last
 *                   two weeks, because it is about one evening and nothing else needs it.
 *
 * Both keys start with bento_ and are listed in db.js (ACCOUNT_LOCAL_KEYS), so signing out clears them. A choice made by one
 * account must never carry over to the next. */
const SKIP_KEY = 'bento_skip_breakfast';
const OUT_KEY = 'bento_dinner_out_v1';
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

const readSkip = () => { try { return localStorage.getItem(SKIP_KEY) === '1'; } catch { return false; } };
const readOut = () => {
  try {
    const v = JSON.parse(localStorage.getItem(OUT_KEY) || 'null');
    return new Set(Array.isArray(v?.dates) ? v.dates.filter((d) => typeof d === 'string') : []);
  } catch { return new Set(); }
};
let skipBreakfast = readSkip();
let outDates = readOut();

export const getSkipBreakfast = () => skipBreakfast;
export const isDinnerOut = (date) => outDates.has(date);

export async function setSkipBreakfast(on) {
  skipBreakfast = Boolean(on);
  try { if (skipBreakfast) localStorage.setItem(SKIP_KEY, '1'); else localStorage.removeItem(SKIP_KEY); } catch { /* storage unavailable */ }
  emit();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('profiles').update({ skip_breakfast: skipBreakfast }).eq('id', user.id);
  } catch { /* the phone's copy still holds */ }
}

/* Reads the saved choice. Call once when a student is signed in. A failed or empty read leaves what is showing alone. */
export async function loadMealPrefs() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from('profiles').select('skip_breakfast').eq('id', user.id).maybeSingle();
    if (error || !data || typeof data.skip_breakfast !== 'boolean') return;
    if (data.skip_breakfast !== skipBreakfast) {
      skipBreakfast = data.skip_breakfast;
      try { if (skipBreakfast) localStorage.setItem(SKIP_KEY, '1'); else localStorage.removeItem(SKIP_KEY); } catch { /* ignore */ }
      emit();
    }
  } catch { /* keep the phone's copy */ }
}

export function setDinnerOut(date, on) {
  const next = new Set(outDates);
  if (on) next.add(date); else next.delete(date);
  // Only the last two weeks are kept.
  const cutoff = new Date(Date.now() - 14 * 86400000);
  const keep = [...next].filter((d) => Date.parse(`${d}T12:00:00`) >= cutoff.getTime()).sort();
  outDates = new Set(keep);
  try { localStorage.setItem(OUT_KEY, JSON.stringify({ dates: keep })); } catch { /* storage unavailable */ }
  emit();
}

/* Called on sign out, after local storage has been cleared. */
export function resetMealPrefs() { skipBreakfast = false; outDates = new Set(); emit(); }

const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
export const useSkipBreakfast = () => useSyncExternalStore(subscribe, () => skipBreakfast, () => false);
// A boolean for one date, so the page only re-renders when this date's answer changes.
export const useDinnerOut = (date) => useSyncExternalStore(subscribe, () => outDates.has(date), () => false);
