// Saves real Brandeis menus as test fixtures for the plate planner, parsed exactly as the app parses them.
//
//   node scripts/save-menu-fixture.mjs 2026-10-29 [2026-10-30 ...]
//
// Writes test/fixtures/menus/brandeis-<date>.json with { date, locations: { usdan, sherman } }, each holding
// { breakfast, lunch, dinner } item lists. Fetches one page at a time, the same pages the hourly cache warmer reads.
import { parse } from 'node-html-parser';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseBrandeisDoc } from '../src/services/brandeisParse.js';
import { dedupeMeals } from '../src/services/menuFetcher.js';

const HALLS = { usdan: 'lower-usdan', sherman: 'the-farm-table-at-sherman-2' };
const dates = process.argv.slice(2);
if (!dates.length || dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
  console.error('usage: node scripts/save-menu-fixture.mjs YYYY-MM-DD [...]');
  process.exit(1);
}

const dir = new URL('../test/fixtures/menus/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });

// Only what the planner reads, so a fixture stays small.
const slim = (i) => ({
  id: i.id, name: i.name, station: i.station, stationName: i.stationName, stations: i.stations, position: i.position,
  nutrition: { calories: i.nutrition.calories, protein: i.nutrition.protein, carbs: i.nutrition.carbs, fat: i.nutrition.fat, fiber: i.nutrition.fiber },
  serving: i.serving, tags: i.tags, allergens: i.allergens, ingredients: i.ingredients,
});

for (const date of dates) {
  const locations = {};
  for (const [id, slug] of Object.entries(HALLS)) {
    const res = await fetch(`https://www.brandeishospitality.com/locations/${slug}/?date=${date}`, { headers: { 'User-Agent': 'Bento menu fixture' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${slug} ${date}`);
    const { meals } = parseBrandeisDoc(parse(await res.text()));
    dedupeMeals(meals);
    locations[id] = Object.fromEntries(Object.entries(meals).map(([m, items]) => [m, items.map(slim)]));
    console.log(date, id, Object.entries(locations[id]).map(([m, l]) => `${m} ${l.length}`).join(', '));
  }
  writeFileSync(`${dir}brandeis-${date}.json`, JSON.stringify({ date, locations }));
}
