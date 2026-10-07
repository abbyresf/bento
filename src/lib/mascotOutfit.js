import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { OUTFIT_IDS } from '../data/mascotOutfits';

/* What Bento is wearing, shared by every screen that shows the mascot.
 *
 * A tiny store, not React state, so equipping a piece in the closet changes the
 * mascot on Today and in Insights at once without passing anything down.
 *
 * It lives in two places. Local storage is the fast copy, so the mascot never
 * flashes bare while the database answers. profiles.mascot_outfit is the real
 * one, so the choice follows the student to a new phone. If the database column
 * is missing (migration 041 not run yet) or the call fails, the local copy
 * still works, and nothing breaks or shows an error: this is a cosmetic.
 *
 * The local key starts with bento_ so signing out and "Reset all data" clear
 * it. A piece worn by one account must never appear on the next. */
const KEY = 'bento_mascot_outfit';
const listeners = new Set();

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return OUTFIT_IDS.includes(v) ? v : null;
  } catch { return null; }
}
let current = read();

function emit(next) {
  current = next;
  listeners.forEach((l) => l());
}

export function getOutfit() { return current; }

export async function setOutfit(id) {
  const next = OUTFIT_IDS.includes(id) ? id : null;
  try {
    if (next) localStorage.setItem(KEY, next); else localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
  emit(next);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('profiles').update({ mascot_outfit: next }).eq('id', user.id);
  } catch { /* the local copy still holds */ }
}

/* Pull the saved choice from the database. Call once when a student is signed
 * in. A failed or empty read leaves what is already showing alone. */
export async function loadOutfit() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from('profiles').select('mascot_outfit').eq('id', user.id).maybeSingle();
    if (error || !data) return;
    const saved = OUTFIT_IDS.includes(data.mascot_outfit) ? data.mascot_outfit : null;
    try {
      if (saved) localStorage.setItem(KEY, saved); else localStorage.removeItem(KEY);
    } catch { /* ignore */ }
    if (saved !== current) emit(saved);
  } catch { /* keep the local copy */ }
}

/* Called on sign out, after local storage has been cleared. */
export function resetOutfit() { emit(null); }

export function useOutfit() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getOutfit,
    () => null,
  );
}
