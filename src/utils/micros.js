/* Calcium, iron and potassium from the meals a student confirmed, for Insights in Athlete mode.
 *
 * The reference is the Daily Value printed on every US food label (FDA, 21 CFR 101.9, adults and children 4 and over):
 * calcium 1,300 mg, iron 18 mg, potassium 4,700 mg. It is one number for everyone, not a personal target, and the copy says
 * so. Bento shows what the confirmed meals carried, never a claim about what someone ate.
 *
 * Brandeis lists these on most dishes but not all. A dish with no value is left out rather than counted as zero, and the
 * share of dishes that had one is returned, so the card can say when a figure is likely to read low. Meals confirmed before
 * the menu reader kept micros have none, and count as unlisted. */
import { servingsOf } from './servingSize.js';

export const MICROS = [
  { key: 'calcium', label: 'Calcium', dv: 1300 },
  { key: 'iron', label: 'Iron', dv: 18 },
  { key: 'potassium', label: 'Potassium', dv: 4700 },
];

/* rows: [{ meal_date, items }] from meal_history. Returns, per micro, the daily average over the days with a confirmed meal,
 * its share of the Daily Value, and how many of the dishes listed it. */
export function microSummary(rows = []) {
  const days = new Set();
  const total = {};
  const listed = {};
  let dishes = 0;
  for (const r of rows) {
    if (!r?.meal_date || !Array.isArray(r.items) || !r.items.length) continue;
    days.add(r.meal_date);
    for (const it of r.items) {
      dishes++;
      for (const { key } of MICROS) {
        const v = it?.nutrition?.[key];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        total[key] = (total[key] ?? 0) + v * servingsOf(it);
        listed[key] = (listed[key] ?? 0) + 1;
      }
    }
  }
  const n = days.size;
  return {
    days: n,
    micros: MICROS.map(({ key, label, dv }) => {
      const perDay = n && listed[key] ? (total[key] ?? 0) / n : null;
      return {
        key, label, dv,
        perDay: perDay == null ? null : Math.round(perDay * 10) / 10,
        percentDv: perDay == null ? null : Math.round((perDay / dv) * 100),
        coverage: dishes ? (listed[key] ?? 0) / dishes : 0,
      };
    }),
  };
}
