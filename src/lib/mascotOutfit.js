import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { OUTFIT_IDS } from '../data/mascotOutfits';
import { syncWidgetMascot } from './widget';
import { cleanColor } from '../data/mascotColors';

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
// The student's color, read directly so the two stores do not import each other.
function readColor() {
  try { return cleanColor(localStorage.getItem('bento_mascot_color')); } catch { return null; }
}
let current = read();

/* A costume is an outfit worn for one day because of a Twin day or Outfit swap with a buddy. It changes how Bento is drawn
 * on Today and in Insights, and nothing else: the closet, the saved choice and the widget keep the student's own piece. It
 * is stored with the day it is for, so it is gone the next morning without anyone taking it off. */
const COSTUME_KEY = 'bento_duo_costume';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function readCostume() {
  try {
    const v = JSON.parse(localStorage.getItem(COSTUME_KEY) || 'null');
    return v && v.date === today() && OUTFIT_IDS.includes(v.outfit) ? v.outfit : null;
  } catch { return null; }
}
let costume = readCostume();

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
  // The widget wears the same piece, whichever tab it was chosen from.
  syncWidgetMascot(next, readColor());
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
    syncWidgetMascot(saved, readColor());
  } catch { /* keep the local copy */ }
}

/* Asks the database whether a Twin day or Outfit swap is on for today. Call when signed in, and after agreeing to one. */
export async function loadCostume() {
  try {
    const { data, error } = await supabase.rpc('duo_costumes');
    if (error || !Array.isArray(data)) return;
    const row = data.find((r) => OUTFIT_IDS.includes(r.outfit));
    try {
      if (row) localStorage.setItem(COSTUME_KEY, JSON.stringify({ date: today(), outfit: row.outfit }));
      else localStorage.removeItem(COSTUME_KEY);
    } catch { /* ignore */ }
    const next = row?.outfit ?? null;
    if (next !== costume) { costume = next; listeners.forEach((l) => l()); }
  } catch { /* keep what is showing */ }
}

/* Called on sign out, after local storage has been cleared. */
export function resetOutfit() { costume = null; emit(null); }

export function useOutfit() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getOutfit,
    () => null,
  );
}

/* What to draw on Today and in Insights: today's costume if there is one, otherwise the student's own piece. */
export function useDisplayOutfit() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => costume ?? current,
    () => null,
  );
}
