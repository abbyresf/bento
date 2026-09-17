// Serving sizes, normalised across universities.
//
// Both sources publish one, in different shapes:
//   Brandeis  serving_size: "0.5 cup"          free text, needs parsing
//   Tufts     serving_size_info: { serving_size_amount: "4", serving_size_unit: "oz" }
//
// Everything downstream gets the same object:
//   { amount, unit, label }
//
// `label` is what a student reads and is always safe to render. `amount` and
// `unit` are for arithmetic and are null when the source did not give a usable
// number, which happens on roughly 6% of Brandeis dishes (Chef's Special,
// breads, rolls). Callers must handle that rather than printing "null cup".

// Units seen across a full day of real Brandeis and Tufts menus. Kept as a
// display map rather than a conversion table: nothing here needs to convert a
// cup to an ounce, only to multiply and pluralise correctly.
const PLURALISES = new Set(['cup', 'slice', 'piece', 'pack', 'serving', 'container', 'bowl']);

// Units a student would recognise on a tray. Anything outside this list is a
// back-of-house production unit and is dropped rather than shown.
//
// This is not hypothetical tidiness. Tufts publishes real values like
// "0.04 h sht" (a fraction of a hotel sheet pan), "0.05 loaf" and "0.125 pizza",
// which mean nothing to someone holding a plate. "ozl" appears too and is
// probably fluid ounces, but probably is not good enough when this number feeds
// a consumption measure, so it is excluded until the feed is confirmed.
const STUDENT_FACING_UNITS = new Set([
  'cup', 'oz', 'floz', 'fl oz', 'tbsp', 'tsp',
  'each', 'slice', 'piece', 'pack', 'serving', 'bowl', 'container',
]);

// Written the way a person writes it, not the way the feed stores it.
const DISPLAY_UNIT = {
  floz: 'fl oz',
  fl_oz: 'fl oz',
};

function normaliseUnit(raw) {
  const u = String(raw ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!u) return null;
  // "servings" and "slices" arrive already plural; store the singular so
  // pluralisation is decided at render time by the count.
  if (u.endsWith('s') && PLURALISES.has(u.slice(0, -1))) return u.slice(0, -1);
  return STUDENT_FACING_UNITS.has(u) ? u : null;
}

// Accepts "0.5", "1", "1/2" and "1 1/2". The live feeds use decimals, but
// fractions are the obvious thing for a dining system to start emitting one day
// and they cost three lines to support.
function parseAmount(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const [, whole, num, den] = mixed;
    return Number(den) ? Number(whole) + Number(num) / Number(den) : null;
  }

  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const [, num, den] = frac;
    return Number(den) ? Number(num) / Number(den) : null;
  }

  const dec = Number(s);
  return Number.isFinite(dec) && dec > 0 ? dec : null;
}

/**
 * Brandeis: one free-text string, e.g. "0.5 cup", "5 each", "4 oz".
 * Returns null when there is nothing usable, so `item.serving` is absent
 * rather than an object full of nulls.
 */
export function parseServingSize(raw) {
  const label = String(raw ?? '').trim();
  if (!label) return null;

  // Leading quantity, then whatever is left is the unit. Anything that does not
  // split cleanly still renders, it just cannot be multiplied.
  const m = label.match(/^([\d./\s]+?)\s*([a-zA-Z][a-zA-Z\s.]*)$/);
  if (!m) return { amount: null, unit: null, label };

  const amount = parseAmount(m[1]);
  const unit = normaliseUnit(m[2]);

  // A real quantity attached to a unit we reject is a production measure like
  // "0.04 h sht". Drop it outright rather than printing nonsense on a plate.
  if (amount !== null && !unit) return null;

  // No parseable quantity at all means free text such as "Chef choice". Keep it:
  // it is still true and still worth showing, it just cannot be multiplied.
  if (amount === null) return { amount: null, unit: null, label };

  return { amount, unit, label };
}

/**
 * Tufts: already split into amount and unit.
 */
export function servingSizeFromParts(amountRaw, unitRaw) {
  const amount = parseAmount(amountRaw);
  const unit = normaliseUnit(unitRaw);
  if (amount === null || !unit) return null;
  return { amount, unit, label: formatServing({ amount, unit }) };
}

/**
 * How a serving reads on screen, multiplied by however many the student took.
 * `formatServing(s)` is one serving; `formatServing(s, 2)` is two.
 * Falls back to the source label when the amount could not be parsed, so a
 * dish with an odd serving string still shows something true.
 */
export function formatServing(serving, count = 1) {
  if (!serving) return null;
  if (serving.amount === null || !serving.unit) return serving.label || null;

  const total = serving.amount * count;
  // 0.25 and 0.5 are common and read better as decimals than as long floats.
  const qty = Number.isInteger(total) ? String(total) : String(Number(total.toFixed(2)));
  const unit = DISPLAY_UNIT[serving.unit] ?? serving.unit;
  const plural = total > 1 && PLURALISES.has(serving.unit) ? `${unit}s` : unit;

  return `${qty} ${plural}`;
}

// ── Servings arithmetic ────────────────────────────────────────────────────
//
// A plate item carries an optional `servings` count. It is absent on anything
// the optimiser built (which always plans one serving) and set only when a
// student takes more, so `?? 1` is the correct reading everywhere.

export const MAX_SERVINGS = 6;

export function servingsOf(item) {
  const n = Number(item?.servings);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), MAX_SERVINGS) : 1;
}

/** One item's nutrition, multiplied by how many servings were taken. */
export function itemNutrition(item) {
  const n = item?.nutrition ?? {};
  const s = servingsOf(item);
  return {
    calories: (n.calories ?? 0) * s,
    protein:  (n.protein  ?? 0) * s,
    carbs:    (n.carbs    ?? 0) * s,
    fat:      (n.fat      ?? 0) * s,
  };
}

/**
 * Plate totals. Four separate reducers used to do this inline and none of them
 * knew about servings, so a student taking two of something saw the plate total
 * stay put. One function now, used everywhere, so they cannot drift again.
 */
export function sumItems(items) {
  return (items ?? []).reduce((acc, item) => {
    const n = itemNutrition(item);
    return {
      calories: acc.calories + n.calories,
      protein:  acc.protein  + n.protein,
      carbs:    acc.carbs    + n.carbs,
      fat:      acc.fat      + n.fat,
    };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
}
