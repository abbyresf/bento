import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

/* The quest lines Bento says at the top of Today: the mystery dish a buddy picked for you and the Rainbow plate color you have
 * not tapped yet (duo_today_hints, migration 053). Kept in memory only, so a closed app asks again and signing out leaves
 * nothing behind. A failed or missing call leaves the last answer alone, and nothing breaks: this is only a line of text. */
let hints = [];
const listeners = new Set();

export async function loadHints() {
  try {
    const { data, error } = await supabase.rpc('duo_today_hints');
    if (error || !Array.isArray(data)) return;
    hints = data;
    listeners.forEach((l) => l());
  } catch { /* keep what is showing */ }
}

export function resetHints() { hints = []; listeners.forEach((l) => l()); }

export function useQuestHints() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => hints,
    () => [],
  );
}
