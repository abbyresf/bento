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

/* Bento on the widget, wearing what the student has on in the app.
 *
 * The widget cannot run the web mascot, and redrawing eleven accessories in a
 * second language would drift the moment one changed. So the app draws the real
 * Mascot component, turns it into a picture, and gives the widget the picture.
 * One drawing, so the widget is always in step with the app and every piece
 * works without extra code.
 *
 * Three moods are sent, because the widget picks one from the plate: happy is
 * the default, cheer when the next meal is confirmed, sleepy once the day is
 * done. They are only redrawn when the outfit changes. */
const MOODS = ['happy', 'cheer', 'sleepy'];
const SIG_KEY = 'bento_widget_mascot_sig';
// The Mascot's own viewBox is "-8 -4 136 124", and the app lets pieces overflow
// it. A picture cannot overflow, and the party hat's pom-pom and the chef hat's
// puffs reach above it, so the picture gets 12 units more headroom, and 10 more below for the scarf's tail.
const VIEWBOX = '-8 -16 136 146';
const W = 136, H = 146, SCALE = 3;   // drawn at 3x

export async function drawMascotPng(mood, outfit) {
  const [{ renderToStaticMarkup }, { default: Mascot }, { createElement }] = await Promise.all([
    import('react-dom/server'),
    import('../components/Mascot/Mascot'),
    import('react'),
  ]);
  let svg = renderToStaticMarkup(createElement(Mascot, { mood, size: 124, hop: false, outfit }));
  // A standalone image needs its own namespace and size, and has no page CSS.
  svg = svg
    .replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    .replace(/viewBox="[^"]*"/, `viewBox="${VIEWBOX}"`)
    .replace(/ style="[^"]*"/, ` width="${W * SCALE}" height="${H * SCALE}"`);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('mascot svg failed to load'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png').split(',')[1];
}

export async function syncWidgetMascot(outfit) {
  if (!Capacitor.isNativePlatform()) return;
  // v2: the picture gained headroom, so pictures stored before it are redrawn.
  const sig = 'v2:' + String(outfit ?? 'none');
  try { if (localStorage.getItem(SIG_KEY) === sig) return; } catch { /* storage unavailable */ }
  try {
    for (const mood of MOODS) {
      await WidgetBridge.setMascot({ mood, base64: await drawMascotPng(mood, outfit ?? null) });
    }
    try { localStorage.setItem(SIG_KEY, sig); } catch { /* redrawn next time */ }
  } catch (e) { console.warn('widget mascot failed:', e?.message ?? e); }
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
