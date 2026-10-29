/* Whole-plate planning: every plate is one meal format from one station, plus add-ons that go with anything.
 *
 * The slot planner in mealOptimizer.js picks the best item for each slot from anywhere in the hall, so a plate could be a
 * Mediterranean bowl, a pesto tortellini salad, a scoop of salad-bar tuna, a bare ciabatta roll and a brownie. A dining hall
 * serves food in groups that go together, and this builds plates from those groups instead:
 *
 *   line      one hot line's main and that line's own sides: jerk chicken with rice and beans, plantains and collards.
 *   salad     a greens base, a protein, vegetable toppings, maybe cheese or a grain, and one dressing, all from the salad bar.
 *   sandwich  bread, a protein, maybe cheese, vegetables and one spread, all from the deli.
 *   yogurt    a yogurt with fruit and granola, from the yogurt bar.
 *
 * Add-ons are fruit and soup, which go with any plate. Sauces, dressings, spreads and toppings only appear inside a format,
 * never alone. Servings of the main and the starch move to fit the targets, so a heavy training day gets a second scoop of the
 * line's own rice, not a loose roll.
 *
 * Stations come from item.stations (the hall's own names, kept by the menu parser). A menu without them, from a cache written
 * before they existed, gives no plates, and the caller falls back to the slot planner.
 *
 * planMeal is what the app calls for each meal. scripts/print-plates.mjs prints plates from real menus for review. */
import { getRole, ROLE } from './foodRoles.js';
import { passesHardRestrictions, getSoftPenalty, optimizeMeal, mealWarnings } from './mealOptimizer.js';

const has = (name, words) => words.some((w) => name.includes(w));
const GREENS = ['lettuce', 'romaine', 'field greens', 'mixed greens', 'arugula', 'spinach', 'kale', 'mesclun'];
const BREAD = ['bread', 'roll', 'bun', 'tortilla', 'wrap', 'bagel', 'pita', 'ciabatta', 'baguette', 'rye', 'sourdough', 'english muffin'];
const DESSERT = ['cookie', 'brownie', 'cake', 'cupcake', 'pie', 'pudding', 'donut', 'doughnut', 'blondie', 'bar ', 'cheesecake'];
const CHEESE = ['cheese', 'feta', 'parmesan', 'mozzarella', 'cheddar', 'provolone', 'swiss'];
const COMPOSED = ['sandwich', 'rachel', 'reuben', 'pizza', 'bowl', 'primavera', 'lasagna', 'burrito', 'quesadilla', 'calzone'];
const MEAT = ['turkey', 'chicken', 'beef', 'pork', 'ham', 'salmon', 'fish', 'shrimp', 'sausage'];
// What dresses a salad, and what goes on a sandwich. A balsamic glaze is neither.
const DRESSING = ['vinaigrette', 'dressing', 'ranch', 'caesar', 'balsamic vinegar', 'olive oil'];
const SPREAD = ['mustard', 'mayo', 'aioli', 'hummus', 'pesto', 'ketchup', 'bbq', 'chipotle', 'tzatziki', 'sriracha'];

/* The part an item plays on a plate. Built on getRole, with the corrections whole plates need: a cookie is not a grain, a
 * Reuben is a whole meal, lettuce is a salad base and bread is for a sandwich. */
export function plateRole(item) {
  const n = item.name.toLowerCase();
  const base = getRole(item);
  if (has(n, DESSERT)) return 'dessert';
  if (n.includes('yogurt')) return 'yogurt';
  if (n.includes('slaw')) return 'vegetable';
  if (base === ROLE.FRUIT && has(n, MEAT)) return 'protein';      // "apple maple glazed turkey"

  if (has(n, COMPOSED) && item.nutrition.calories >= 250) return 'main';
  if (has(n, GREENS) && item.nutrition.calories <= 40) return 'greens';
  if (has(n, BREAD) && base === ROLE.GRAIN) return 'bread';
  if (n.includes('granola')) return 'granola';
  switch (base) {
    case ROLE.PROTEIN: return 'protein';
    case ROLE.COMPOSED: return 'main';
    case ROLE.GRAIN: return 'starch';
    case ROLE.GARNISH: return has(n, CHEESE) ? 'cheese' : 'topping';
    case ROLE.CONDIMENT: return 'sauce';
    case ROLE.VEGETABLE: return 'vegetable';
    case ROLE.FRUIT: return 'fruit';
    case ROLE.SOUP: return 'soup';
    case ROLE.DESSERT: return 'dessert';
    default: return 'other';
  }
}

// Zero calories is how a missing label shows up, except for things that really are close to nothing.
const usable = (item, role) => item.nutrition && (item.nutrition.calories > 0 || role === 'greens' || role === 'topping');

/* The stations of one meal at one hall: { name: [{ item, role }] } in menu order. Allowed items only. */
function stationsOf(items, { restrictions, ratingsById }) {
  const out = {};
  for (const item of items) {
    const role = plateRole(item);
    if (!usable(item, role)) continue;
    if (restrictions && !passesHardRestrictions(item, restrictions)) continue;
    if ((ratingsById?.get?.(item.id) ?? 5) <= 2) continue;               // disliked
    for (const st of item.stations ?? []) (out[st] ??= []).push({ item, role });
  }
  return out;
}

const pick = (list, role) => list.filter((x) => x.role === role).map((x) => x.item);
const firstN = (arr, n) => arr.slice(0, n);
// Every subset of `arr` with at most `k` members.
function subsets(arr, k) {
  const out = [[]];
  for (const x of arr) for (const s of [...out]) if (s.length < k) out.push([...s, x]);
  return out;
}
const lowestCal = (arr, n) => [...arr].sort((a, b) => a.nutrition.calories - b.nutrition.calories).slice(0, n);

/* Candidate plates for one station, as lists of items. Servings are chosen later. */
function stationPlates(name, list, sidesFrom) {
  const greens = pick(list, 'greens');
  const bread = pick(list, 'bread');
  const proteins = pick(list, 'protein');
  const mains = pick(list, 'main');
  const starches = pick(list, 'starch');
  const veg = pick(list, 'vegetable');
  const toppings = pick(list, 'topping');
  const cheese = pick(list, 'cheese');
  const sauces = pick(list, 'sauce');
  const yogurts = pick(list, 'yogurt');
  const plates = [];

  const dressings = sauces.filter((x) => has(x.name.toLowerCase(), DRESSING));
  const spreads = sauces.filter((x) => has(x.name.toLowerCase(), SPREAD));

  // Salad bar: a greens base with toppings and a dressing. Lettuce at a grill is a burger topping, not a salad bar, so a
  // station needs a dressing to count.
  const isSalad = greens.length && toppings.length >= 2 && dressings.length;
  if (isSalad) {
    const tops = firstN(toppings, 3);
    const prots = firstN([...proteins], 4);
    const extras = [null, ...firstN([...starches, ...pick(list, 'vegetable')].filter((x) => x.nutrition.calories <= 200), 2)];
    for (const g of firstN(greens, 2)) for (const p of prots) for (const e of extras)
      for (const d of [null, ...lowestCal(dressings, 3)]) for (const c of [null, ...firstN(cheese, 1)]) {
        plates.push({ format: 'salad', station: name, items: [g, p, ...tops, e, c, d].filter(Boolean), main: p });
      }
  }

  // Deli: bread, a protein, cheese, vegetables and a spread.
  if (bread.length >= 1 && proteins.length) {
    const tops = firstN([...greens, ...toppings], 3);
    for (const b of firstN(bread, 3)) for (const p of firstN(proteins, 4))
      for (const c of [null, ...firstN(cheese, 1)]) for (const s of [null, ...lowestCal(spreads, 2)]) {
        // A sandwich grows by making two, not by stacking bread.
        plates.push({ format: 'sandwich', station: name, items: [b, p, c, ...tops, s].filter(Boolean), scaleAll: true });
      }
  }

  // Yogurt bar.
  if (yogurts.length) {
    const fruit = firstN(pick(list, 'fruit'), 2);
    const granola = firstN(pick(list, 'granola'), 1);
    for (const y of firstN(yogurts, 3)) for (const f of [null, ...fruit]) for (const gr of [null, ...granola]) {
      plates.push({ format: 'yogurt', station: name, items: [y, f, gr].filter(Boolean), main: y, starch: gr });
    }
  }

  // A hot line: one main and the line's own sides. A line with no protein or composed dish (a plant-based line) uses its
  // vegetable dishes as the main. A line with no starch may take one from a station that serves only starches.
  // A composed dish (pizza, lasagna, a bowl) already carries its starch, so it takes no other.
  if (!isSalad && !bread.length && !yogurts.length) {
    const lineMains = [...mains, ...proteins];
    const heads = lineMains.length ? lineMains : veg;
    for (const m of firstN(heads, 4)) {
      const composed = mains.includes(m);
      const lineStarch = composed ? [] : starches.length ? starches : sidesFrom;
      const sides = veg.filter((v) => v !== m);
      for (const st of [null, ...firstN(lineStarch, 3)]) for (const vs of subsets(firstN(sides, 4), 2))
        for (const s of [null, ...lowestCal(sauces, 2)]) {
          plates.push({ format: 'line', station: name, items: [m, st, ...vs, ...firstN(toppings, 2), s].filter(Boolean), main: m, starch: st });
        }
    }
  }
  return plates;
}

const FORMAT_COST = { line: 0, yogurt: 0, salad: 0.015, sandwich: 0.03 };
const FIELDS = ['calories', 'protein', 'carbs', 'fat'];
const WEIGHTS = { calories: 1, protein: 0.8, carbs: 0.6, fat: 0.4 };
const totalsOf = (entries) => {
  const t = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const { item, servings } of entries) for (const f of FIELDS) t[f] += (item.nutrition[f] ?? 0) * servings;
  return t;
};

/* How far a plate's totals are from the target. Lower is better. Going well over on calories costs extra, because an
 * oversized plate is worse than a slightly small one. */
function fitScore(t, target) {
  let s = 0;
  for (const f of FIELDS) {
    if (!(target[f] > 0)) continue;
    const r = (t[f] - target[f]) / target[f];
    s += WEIGHTS[f] * r * r;
  }
  const over = t.calories / (target.calories || 1) - 1.1;
  if (over > 0) s += 4 * over * over;
  return s;
}

/* Picks servings that fit the target best: of the main (1 or 2, or 3 in Athlete mode for a dish with no separate starch)
 * and of the starch (1 to 2, or 3 in Athlete mode). A sandwich is made once or twice, whole. */
function bestServings(plate, target, fuel) {
  let best = null;
  const mainMax = plate.scaleAll ? 2 : fuel && !plate.starch ? 3 : 2;
  const starchMax = plate.starch && !plate.scaleAll ? (fuel ? 3 : 2) : 1;
  for (let ms = 1; ms <= mainMax; ms++) for (let ss = 1; ss <= starchMax; ss++) {
    const entries = plate.items.map((item) => ({
      item, servings: plate.scaleAll ? ms : item === plate.main ? ms : item === plate.starch ? ss : 1,
    }));
    const totals = totalsOf(entries);
    const score = fitScore(totals, target);
    if (!best || score < best.score) best = { entries, totals, score };
  }
  return best;
}

/* Fruit or soup on the side, when it brings the plate closer to the target. At most one of each. */
function withAddOns(plan, addOns, target) {
  let cur = plan;
  for (const role of ['fruit', 'soup']) {
    let best = cur;
    for (const item of addOns.filter((x) => x.role === role).map((x) => x.item)) {
      if (cur.entries.some((e) => e.item.id === item.id)) continue;
      const entries = [...cur.entries, { item, servings: 1 }];
      const totals = totalsOf(entries);
      const score = fitScore(totals, target);
      if (score < best.score) best = { ...cur, entries, totals, score };
    }
    cur = best;
  }
  return cur;
}

/* All plates for a meal, best first. `items` is one meal at one hall, with `stations` on each item.
 * options: { restrictions, ratingsById, recentIds, fuel }. */
export function planPlates(items, target, options = {}) {
  const { recentIds = new Set(), fuel = false } = options;
  const stations = stationsOf(items, options);
  // A station that serves only starches (a grain bar) lends a side to a line that has none.
  const sidesFrom = Object.values(stations)
    .filter((l) => l.length && l.every((x) => x.role === 'starch'))
    .flatMap((l) => l.map((x) => x.item));
  const addOns = Object.values(stations).flat().filter((x) => x.role === 'fruit' || x.role === 'soup');

  const seen = new Set();
  const out = [];
  for (const [name, list] of Object.entries(stations)) {
    for (const plate of stationPlates(name, list, sidesFrom)) {
      const key = plate.items.map((i) => i.id).sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      let plan = withAddOns(bestServings(plate, target, fuel), addOns, target);
      // Something eaten in the last few days counts against the plate a little, for variety. The hall's cooked meal of the
      // day comes first when it fits about as well, because the deli and the salad bar are there every day.
      // A "prefer to avoid" ingredient is a preference, not a block, so it costs the plate rather than removing the item.
      const repeats = plan.entries.filter((e) => recentIds.has(e.item.id)).length;
      const avoided = options.restrictions ? plan.entries.filter((e) => getSoftPenalty(e.item, options.restrictions) > 0).length : 0;
      const score = plan.score + 0.03 * repeats + 0.05 * avoided + (FORMAT_COST[plate.format] ?? 0);
      out.push({ format: plate.format, station: name, items: plan.entries, totals: plan.totals, score });
    }
  }
  return out.sort((a, b) => a.score - b.score);
}

/* The best plate, or null when the menu has no station data. */
export const planPlate = (items, target, options) => planPlates(items, target, options)[0] ?? null;

const FORMAT_NAMES = { line: '', salad: 'Salad bar', sandwich: 'Deli', yogurt: 'Yogurt bar' };
const stationLabel = (name) => name.charAt(0).toUpperCase() + name.slice(1);

/* One meal, in the shape the app's cards use: { items, totals, target, warnings }. Each item carries its servings and a short
 * reason saying where it is served. Falls back to the slot planner when the menu has no station names, so a cached menu
 * from before this still gets a plate. */
export function planMeal(items, mealTarget, restrictions, recentIds, mealType = null, ratingsById = new Map(), options = {}) {
  const plate = planPlate(items, mealTarget, { restrictions, ratingsById, recentIds, fuel: options.fuel === true });
  if (!plate) return optimizeMeal(items, mealTarget, restrictions, recentIds, mealType, ratingsById);
  const where = FORMAT_NAMES[plate.format] || stationLabel(plate.station);
  const selected = plate.items.map(({ item, servings }) => {
    const side = !item.stations?.includes(plate.station);
    return { ...item, servings, reason: side ? 'On the side' : `Served together at ${where}` };
  });
  return {
    items: selected,
    totals: plate.totals,
    target: mealTarget,
    format: plate.format,
    station: plate.station,
    warnings: mealWarnings(selected, plate.totals, mealTarget, restrictions),
  };
}
