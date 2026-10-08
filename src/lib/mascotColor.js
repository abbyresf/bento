import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { cleanColor } from '../data/mascotColors';
import { syncWidgetMascot } from './widget';

/* The color scheme Bento wears, shared by every screen that draws the mascot.
 *
 * The same shape as mascotOutfit.js: a small store, a fast local copy so Bento never
 * flashes classic while the database answers, and profiles.mascot_color as the real
 * one so the choice follows the student to a new phone. If the column is missing
 * (migration 045 not run) or a call fails, the local copy still works.
 *
 * The local key starts with bento_ so signing out clears it. A color worn by one
 * account must never appear on the next. Classic is stored as no value. */
const KEY = 'bento_mascot_color';
const OUTFIT_KEY = 'bento_mascot_outfit';   // read directly, to keep the two stores independent
const listeners = new Set();

function read() {
  try { return cleanColor(localStorage.getItem(KEY)); } catch { return null; }
}
function readOutfit() {
  try { return localStorage.getItem(OUTFIT_KEY) || null; } catch { return null; }
}
let current = read();

function emit(next) {
  current = next;
  listeners.forEach((l) => l());
}

export function getMascotColor() { return current; }

export async function setMascotColor(id) {
  const next = cleanColor(id);
  try {
    if (next) localStorage.setItem(KEY, next); else localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
  emit(next);
  syncWidgetMascot(readOutfit(), next);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('profiles').update({ mascot_color: next }).eq('id', user.id);
  } catch { /* the local copy still holds */ }
}

/* Pull the saved choice from the database. Call once when a student is signed in. */
export async function loadMascotColor() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from('profiles').select('mascot_color').eq('id', user.id).maybeSingle();
    if (error || !data) return;
    const saved = cleanColor(data.mascot_color);
    try {
      if (saved) localStorage.setItem(KEY, saved); else localStorage.removeItem(KEY);
    } catch { /* ignore */ }
    if (saved !== current) emit(saved);
    syncWidgetMascot(readOutfit(), saved);
  } catch { /* keep the local copy */ }
}

/* Called on sign out, after local storage has been cleared. */
export function resetMascotColor() { emit(null); }

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useMascotColor() {
  return useSyncExternalStore(subscribe, getMascotColor, () => null);
}
