/* What was eaten, put back into a day's plan.
 *
 * Today builds every meal from the menu each time it loads: on opening the app, on switching day, after Settings. A meal
 * that is already confirmed kept only its Confirmed mark and showed whatever Bento would plan now, not what the student
 * ate, and the meals still to come were then planned around those made-up numbers. These helpers take the plates stored
 * with each confirmation and put them back, so the card shows the real plate and the rest of the day is planned around it.
 *
 * A plate goes in at every hall, so it shows whichever hall the card is set to. hallLocation says which hall it was eaten
 * at, for the card's hall picker. */
import { sumItems } from './servingSize.js';

export const MEALS = ['breakfast', 'lunch', 'dinner'];

/* The plates to put back for one date: { meal: { items, hall } }. `confirmed` is what the database returned
 * ({ meal: { items, hall } } or null per meal). `pending` is the offline queue (pendingConfirms.readQueue()), used for a
 * meal the database does not have yet. A meal with no stored items is left out, so it keeps its planned plate. */
export function confirmedPlates(date, confirmed, pending = []) {
  const out = {};
  for (const meal of MEALS) {
    const row = confirmed?.[meal];
    if (Array.isArray(row?.items) && row.items.length) { out[meal] = { items: row.items, hall: row.hall ?? null }; continue; }
    const queued = pending.find((e) => e.date === date && e.meal === meal);
    if (Array.isArray(queued?.items) && queued.items.length) out[meal] = { items: queued.items, hall: queued.hall ?? null };
  }
  return out;
}

const locationIds = (plan) => Object.keys(plan).filter((k) => !['dailyTotals', 'targets', 'warnings'].includes(k));

/* A copy of `plan` with each confirmed meal's plate in place of the planned one. The plate keeps the planned meal's
 * target, so the card still compares against it. It carries no warnings: "no vegetable at this location" or "add
 * protein" is advice for a plate still to be eaten. Returns the same object when there is nothing to change, so React
 * does not re-render or re-plan for nothing. */
export function applyConfirmedPlates(plan, plates) {
  if (!plan || !plates || !Object.keys(plates).length) return plan;
  let changed = false;
  const next = { ...plan };
  for (const loc of locationIds(plan)) {
    const day = { ...(plan[loc] ?? {}) };
    for (const [meal, plate] of Object.entries(plates)) {
      if (day[meal]?.confirmedItems === plate.items) continue;   // already in place
      const totals = sumItems(plate.items);
      const target = day[meal]?.target ?? null;
      day[meal] = { items: plate.items, totals, target, warnings: [], confirmedItems: plate.items };
      changed = true;
    }
    next[loc] = day;
  }
  return changed ? next : plan;
}

/* The hall a plate was eaten at, as a location id, or null. Confirmations store the hall's short name. */
export function hallLocation(locations, hall) {
  if (!hall) return null;
  const hit = Object.entries(locations ?? {}).find(([, l]) => l?.shortName === hall || l?.name === hall);
  return hit ? hit[0] : null;
}
