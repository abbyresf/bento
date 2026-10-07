import { Capacitor, registerPlugin } from '@capacitor/core';

/* Today's plate for the iOS home-screen widget.
 *
 * The widget is a separate process and cannot read this web view, so after the
 * plate changes the app writes a small JSON string to a shared container (see
 * ios/App/App/WidgetBridgePlugin.swift). Only what the widget draws goes across:
 * which meal, the dining hall, item names, whether it is confirmed, and the
 * streak count. No ids, no nutrition numbers, nothing about the account.
 *
 * Does nothing on the web, and never throws: a widget that fails to update must
 * not break the app. */
const WidgetBridge = registerPlugin('WidgetBridge');
const MEALS = ['breakfast', 'lunch', 'dinner'];

/* meals: { breakfast|lunch|dinner: { hall, items: [{ name }], confirmed } }
 * Meals with no items are left out, so the widget skips them. */
export function buildPlatePayload({ date, streak, meals }) {
  const out = {};
  for (const m of MEALS) {
    const line = meals?.[m];
    const names = (line?.items ?? []).map((i) => (i?.name ?? '').trim()).filter(Boolean);
    if (!names.length) continue;
    out[m] = { hall: line.hall ?? null, items: names, confirmed: !!line.confirmed };
  }
  return {
    v: 1,
    date,
    streak: Number.isInteger(streak) && streak > 0 ? streak : 0,
    meals: out,
  };
}

export async function syncWidget(payload) {
  if (!Capacitor.isNativePlatform()) return;
  try { await WidgetBridge.setPlate({ json: JSON.stringify(payload) }); } catch (e) { console.warn('widget sync failed:', e?.message ?? e); /* the widget keeps its last plate */ }
}

/* Called on sign out so the next student never sees this one's plate. */
export async function clearWidget() {
  if (!Capacitor.isNativePlatform()) return;
  try { await WidgetBridge.clear(); } catch (e) { console.warn('widget clear failed:', e?.message ?? e); }
}
