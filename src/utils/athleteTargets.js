/* Daily targets in Athlete mode.
 *
 * The numbers come from published sports nutrition guidance, not from Bento's own formulas: the 2016 joint position
 * statement of the Academy of Nutrition and Dietetics, Dietitians of Canada and the American College of Sports Medicine
 * ("Nutrition and Athletic Performance"). It gives each nutrient per kilogram of body weight, by how hard the day is:
 *
 *   carbohydrate  light 3-5, moderate (about an hour a day) 5-7, high 6-10, very high 8-12 g/kg/day
 *   protein       1.2-2.0 g/kg/day, every day
 *   fat           20-35% of energy
 *
 * Bento's four day loads map onto the four carbohydrate bands in order: rest, light, heavy, two-a-day. Rest sitting in the
 * lightest band is Bento's placement, approved by the owner on 29 Oct 2026. Calories are the sum of the three, so there is no
 * separate calorie multiplier. Each default is the middle of its range, and the athlete can move any of them within the range.
 *
 * A sport changes a number only where a published statement for that sport says something different (SPORT_GUIDANCE). For
 * every other sport the 2016 ranges apply. Bento does not make up a split.
 *
 * The floor: no day's calories go below the athlete's resting needs (the BMR the profile already calculates). A preset that
 * would fall under it has its carbohydrate raised until it does not. A setting the athlete chooses that would fall under it is
 * refused (see wouldBreakFloor). */

export const LOADS = ['rest', 'light', 'heavy', 'double'];
export const DEFAULT_LOAD = 'light';

export const LOAD_LABELS = { rest: 'Rest', light: 'Light', heavy: 'Heavy', double: 'Two-a-day' };

// g per kg per day, and a share of the day's energy for fat.
export const RANGES = {
  carbs: { rest: [3, 5], light: [5, 7], heavy: [6, 10], double: [8, 12] },
  protein: [1.2, 2.0],
  fatShare: [0.2, 0.35],
};

const GENERAL = 'ACSM, Academy of Nutrition and Dietetics and Dietitians of Canada, 2016';

/* Where a sport's published statement differs from the 2016 ranges. Only figures read in the statement itself go here.
 *   athletics  IAAF Consensus Statement 2019: Nutrition for Athletics (Burke et al., IJSNEM 29(2)). Protein 1.3 to 1.7 g/kg
 *              a day for athletes keeping or gaining weight. It covers track and field and cross country. */
const ATHLETICS = { protein: [1.3, 1.7], source: 'World Athletics (IAAF) consensus statement, 2019' };
export const SPORT_GUIDANCE = { track: ATHLETICS, 'cross-country': ATHLETICS };

/* The ranges for a sport, and the source to name. */
export function rangesFor(sport) {
  const g = SPORT_GUIDANCE[sport] ?? {};
  return { ...RANGES, protein: g.protein ?? RANGES.protein, source: g.source ?? GENERAL };
}

const mid = ([lo, hi]) => (lo + hi) / 2;
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/* The settings in force: the athlete's own choice where they made one and it is a number, the middle of the range otherwise.
 * Anything outside the range is brought back into it. */
export function athleteSettings(custom = {}, sport = null) {
  const r = rangesFor(sport);
  const carbs = {};
  for (const l of LOADS) carbs[l] = clamp(num(custom.carbs?.[l]) ?? mid(r.carbs[l]), r.carbs[l]);
  return {
    carbs,
    protein: clamp(num(custom.protein) ?? mid(r.protein), r.protein),
    fatShare: clamp(num(custom.fatShare) ?? mid(r.fatShare), r.fatShare),
  };
}

// Calories from grams of protein and carbohydrate, when fat is a share of the total.
const caloriesFor = (proteinG, carbsG, fatShare) => (4 * proteinG + 4 * carbsG) / (1 - fatShare);

/* The day's targets, in the shape the planner uses: { calories, macros: { protein, carbs, fat } }. Returns null when there is
 * no usable body weight, so the caller keeps the student's normal targets. */
export function athleteDailyTargets({ weightKg, bmr = 0, load = DEFAULT_LOAD, custom = {}, sport = null }) {
  if (!(weightKg > 0)) return null;
  const s = athleteSettings(custom, sport);
  const l = LOADS.includes(load) ? load : DEFAULT_LOAD;
  const protein = s.protein * weightKg;
  let carbs = s.carbs[l] * weightKg;
  let calories = caloriesFor(protein, carbs, s.fatShare);
  const floor = num(bmr) ?? 0;
  if (calories < floor) {
    // Raise carbohydrate, the part that moves with the day, until the day reaches the floor.
    carbs = floor * (1 - s.fatShare) / 4 - protein;
    calories = floor;
  }
  return {
    calories: Math.round(calories),
    macros: {
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round((calories * s.fatShare) / 9),
    },
  };
}

/* True when these settings would put any day under the floor. Settings uses it to refuse a change and keep the previous
 * value. */
export function wouldBreakFloor({ weightKg, bmr, custom, sport = null }) {
  if (!(weightKg > 0) || !(bmr > 0)) return false;
  const s = athleteSettings(custom, sport);
  return LOADS.some((l) => caloriesFor(s.protein * weightKg, s.carbs[l] * weightKg, s.fatShare) < bmr);
}
