// Prints the plate planner's best plate for each meal from the saved real menus, for a person to look over.
//
//   node scripts/print-plates.mjs [out.md]
//
// Two students: a typical day (2,200 cal) and a 70 kg athlete on a heavy day, whose numbers come from the athlete presets
// (src/utils/athleteTargets.js on the athlete branch). Meals take 25%, 37.5% and 37.5% of the day, as the app does.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { planPlates } from '../src/utils/platePlanner.js';

const dir = new URL('../test/fixtures/menus/', import.meta.url).pathname;
const SHARE = { breakfast: 0.25, lunch: 0.375, dinner: 0.375 };
const STUDENTS = {
  'Typical day': { calories: 2200, protein: 130, carbs: 250, fat: 85, fuel: false },
  'Athlete, heavy day (70 kg)': { calories: 3708, protein: 112, carbs: 560, fat: 113, fuel: true },
};
const R = { allergies: [], avoidIngredients: [] };
const r = (n) => Math.round(n);
const lines = [];

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const { date, locations } = JSON.parse(readFileSync(dir + file, 'utf8'));
  for (const [hall, meals] of Object.entries(locations)) {
    // What a student ate earlier in the day counts against later meals, as in the app.
    const eaten = Object.fromEntries(Object.keys(STUDENTS).map((w) => [w, new Set()]));
    for (const meal of ['breakfast', 'lunch', 'dinner']) {
      const items = meals[meal] ?? [];
      if (!items.length) continue;
      for (const [who, d] of Object.entries(STUDENTS)) {
        const target = Object.fromEntries(['calories', 'protein', 'carbs', 'fat'].map((f) => [f, d[f] * SHARE[meal]]));
        const [best] = planPlates(items, target, { restrictions: R, fuel: d.fuel, recentIds: eaten[who] });
        best?.items.forEach(({ item }) => eaten[who].add(item.id));
        lines.push(`### ${date} ${hall} ${meal}: ${who}`);
        if (!best) { lines.push('No plate.', ''); continue; }
        lines.push(`${best.format} at ${best.station}`);
        for (const { item, servings } of best.items) lines.push(`- ${servings > 1 ? `${servings}x ` : ''}${item.name}`);
        const t = best.totals;
        lines.push(`Plate ${r(t.calories)} cal, ${r(t.protein)}P ${r(t.carbs)}C ${r(t.fat)}F. Target ${r(target.calories)} cal, ${r(target.protein)}P ${r(target.carbs)}C ${r(target.fat)}F.`, '');
      }
    }
  }
}
const out = lines.join('\n');
if (process.argv[2]) writeFileSync(process.argv[2], out); else console.log(out);
