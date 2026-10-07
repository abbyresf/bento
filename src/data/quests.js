/* Weekly quests.
 *
 * Three small goals a week, worked out from rows the student already has:
 * confirmed meals and ratings. Nothing here counts calories, macros, portions
 * or how much anyone ate. A quest asks a student to show up and to say what
 * they thought, which is the only thing Bento can honestly measure.
 *
 * A rating only counts toward `rate3` if the dish is in a meal the student
 * confirmed this week, so it cannot be done by tapping stars on dishes never
 * eaten. (Pulse knows what students confirm, not what they eat.)
 *
 * Weeks run Monday to Sunday in the student's local time. Progress is derived
 * on read. The only stored thing is a claim: one row per quest per week. The
 * reward is a closet piece, unlocked by how many quests have been claimed in
 * total (see mascotOutfits.js, type 'quests'). */
export const QUESTS = [
  { id: 'days4',    title: 'Confirm meals on 4 days',      target: 4, unit: 'days' },
  { id: 'rate3',    title: 'Rate 3 dishes you confirmed',  target: 3, unit: 'dishes' },
  { id: 'twoMeals', title: 'Confirm two meals in one day', target: 1, unit: 'day' },
];

const pad = (n) => String(n).padStart(2, '0');
export const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* The Monday of the week containing `d`, as YYYY-MM-DD. */
export function weekStartOf(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const back = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - back);
  return dateStr(x);
}

/* [start, end) of a week as dates: end is the next Monday. */
export function weekRange(weekStart) {
  const [y, m, d] = weekStart.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 7);
  return { start, end, startDate: dateStr(start), endDate: dateStr(end) };
}

/* meals:   [{ meal_date, meal_type, items }] confirmed inside the week
 * ratings: [{ item_id, updated_at }] rated inside the week
 * Returns { [questId]: count }, never above the target. */
export function computeProgress({ meals = [], ratings = [] } = {}) {
  const days = new Set();
  const typesByDay = {};
  const confirmedItems = new Set();
  for (const m of meals) {
    if (!m?.meal_date) continue;
    days.add(m.meal_date);
    (typesByDay[m.meal_date] ??= new Set()).add(m.meal_type ?? `row:${days.size}`);
    for (const it of Array.isArray(m.items) ? m.items : []) {
      const id = it?.id ?? it?.item_id;
      if (id != null) confirmedItems.add(String(id));
    }
  }
  const rated = new Set(ratings.map((r) => String(r.item_id)).filter((id) => confirmedItems.has(id)));
  const twoMealDay = Object.values(typesByDay).some((s) => s.size >= 2);
  const raw = { days4: days.size, rate3: rated.size, twoMeals: twoMealDay ? 1 : 0 };
  return Object.fromEntries(QUESTS.map((q) => [q.id, Math.min(raw[q.id], q.target)]));
}

/* 'locked' while under target, 'ready' once met, 'claimed' after the tap. */
export function questState(quest, progress, claimedIds = []) {
  if (claimedIds.includes(quest.id)) return 'claimed';
  return (progress?.[quest.id] ?? 0) >= quest.target ? 'ready' : 'open';
}
