import { supabase } from './supabase';

// A dish needs this many ratings before Pulse will rank it. Without a floor the
// "highest rated" list is whatever one student gave five stars to once, which
// is worse than showing nothing: it invites a menu decision based on a sample
// of one. Five is low enough that a real beta still fills both lists.
export const MIN_RATINGS = 5;

// ── Mock data ────────────────────────────────────────────────────────────────

// Ground truth per period. active must be <= meals (active = confirmed at least 1 meal).
// meal split totals must equal meals. engagement daily ranges must average to meals/days.
//   7d:  52 active, 89 meals  (~12.7/day) | prevActive 44, prevMeals 76
//   30d: 156 active, 342 meals (~11.4/day) | prevActive 139, prevMeals 298
//   90d: 201 active, 1240 meals (~13.8/day) | prevActive 187, prevMeals 1078
function generateMockOverview(days) {
  const scenarios = {
    7:  { active: 52,  meals: 89,   prevActive: 44,  prevMeals: 76   },
    30: { active: 156, meals: 342,  prevActive: 139, prevMeals: 298  },
    90: { active: 201, meals: 1240, prevActive: 187, prevMeals: 1078 },
  };
  const s = scenarios[days] ?? scenarios[30];
  return {
    totalStudents:      287,
    installedStudents:  181,
    installRate:        63,
    activeThisPeriod:   s.active,
    mealsThisPeriod:    s.meals,
    prevActiveStudents: s.prevActive,
    prevMeals:          s.prevMeals,
    changeActive: Math.round(((s.active - s.prevActive) / s.prevActive) * 100),
    changeMeals:  Math.round(((s.meals  - s.prevMeals)  / s.prevMeals)  * 100),
  };
}

function generateMockEngagement(days) {
  // Daily ranges tuned so sum approximates mealsThisPeriod for each window
  const ranges = {
    7:  { wdMeals: [10, 18], weMeals: [4, 10], wdUsers: [7, 14],  weUsers: [3, 7]  },
    30: { wdMeals: [8,  16], weMeals: [4,  8],  wdUsers: [8, 14],  weUsers: [3, 7]  },
    90: { wdMeals: [10, 20], weMeals: [5, 10], wdUsers: [8, 16],  weUsers: [4, 8]  },
  };
  const r = ranges[days] ?? ranges[30];
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const data = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000);
    const dateStr = date.toISOString().split('T')[0];
    const isWeekend = [0, 6].includes(date.getDay());
    data.push({
      date: dateStr,
      meals: isWeekend ? rand(...r.weMeals) : rand(...r.wdMeals),
      users: isWeekend ? rand(...r.weUsers) : rand(...r.wdUsers),
    });
  }
  return data;
}

function generateMockMealSplit(days) {
  // Must sum to mealsThisPeriod: 7d=89, 30d=342, 90d=1240
  if (days === 7)  return [{ name: 'Breakfast', value: 22 }, { name: 'Lunch', value: 45 }, { name: 'Dinner', value: 22 }];
  if (days === 90) return [{ name: 'Breakfast', value: 320 }, { name: 'Lunch', value: 600 }, { name: 'Dinner', value: 320 }];
  return [{ name: 'Breakfast', value: 92 }, { name: 'Lunch', value: 158 }, { name: 'Dinner', value: 92 }];
}

function generateMockTopItems(days) {
  // Counts scale with the window; rankings shift slightly week-to-week
  if (days === 7) {
    return [
      { name: 'Grilled Chicken Breast', count: 14 },
      { name: 'Caesar Salad', count: 12 },
      { name: 'Greek Yogurt Parfait', count: 11 },
      { name: 'Roasted Vegetables', count: 10 },
      { name: 'Pasta Primavera', count: 9 },
      { name: 'Quinoa Bowl', count: 8 },
      { name: 'Salmon Fillet', count: 7 },
      { name: 'Brown Rice', count: 6 },
      { name: 'Sweet Potato', count: 5 },
      { name: 'Garden Greens Mix', count: 4 },
    ];
  }
  if (days === 90) {
    return [
      { name: 'Pasta Primavera', count: 148 },
      { name: 'Grilled Chicken Breast', count: 141 },
      { name: 'Greek Yogurt Parfait', count: 138 },
      { name: 'Roasted Vegetables', count: 127 },
      { name: 'Caesar Salad', count: 112 },
      { name: 'Quinoa Bowl', count: 94 },
      { name: 'Brown Rice', count: 88 },
      { name: 'Sweet Potato', count: 81 },
      { name: 'Salmon Fillet', count: 74 },
      { name: 'Garden Greens Mix', count: 61 },
    ];
  }
  return [
    { name: 'Grilled Chicken Breast', count: 54 },
    { name: 'Greek Yogurt Parfait', count: 51 },
    { name: 'Pasta Primavera', count: 49 },
    { name: 'Roasted Vegetables', count: 47 },
    { name: 'Caesar Salad', count: 38 },
    { name: 'Quinoa Bowl', count: 31 },
    { name: 'Sweet Potato', count: 29 },
    { name: 'Salmon Fillet', count: 24 },
    { name: 'Garden Greens Mix', count: 22 },
    { name: 'Brown Rice', count: 19 },
  ];
}

function generateMockDietary() {
  return [
    { name: 'Vegetarian', count: 51, pct: 33 },
    { name: 'Kosher', count: 28, pct: 18 },
    { name: 'Gluten-Free', count: 22, pct: 14 },
    { name: 'Vegan', count: 19, pct: 12 },
    { name: 'Dairy-Free', count: 11, pct: 7 },
    { name: 'Halal', count: 8, pct: 5 },
  ];
}

// Waste. The scale factor keeps every window internally consistent with the
// meal counts above, so a demo viewer who divides one number by another gets an
// answer that makes sense.
function generateMockWaste(days) {
  const scale = { 7: 0.26, 30: 1, 90: 3.6 }[days] ?? 1;
  const rows = [
    // name,                      takes, servings, avgEaten, kcal per serving
    ['Roasted Brussels Sprouts',    64,   68, 0.41, 120],
    ['Steamed White Rice',          98,  121, 0.58, 205],
    ['Vegetable Medley',            57,   59, 0.47, 90 ],
    ['Baked Cod',                   38,   39, 0.55, 190],
    ['Quinoa Pilaf',                44,   47, 0.62, 175],
    ['Caesar Salad',                72,   74, 0.79, 190],
    ['Pasta Primavera',             83,   97, 0.84, 310],
    ['Grilled Chicken Breast',      91,  108, 0.93, 165],
    ['Greek Yogurt Parfait',        76,   88, 0.95, 210],
    ['Fresh Fruit Cup',             61,   63, 0.97, 70 ],
  ];

  const items = rows.map(([name, takes, servings, avgEaten, kcal]) => {
    const t = Math.round(takes * scale);
    const s = Math.round(servings * scale);
    const wastedServings = s * (1 - avgEaten);
    return {
      name,
      takes: t,
      servings: s,
      avgEaten,
      wastedServings: Math.round(wastedServings * 10) / 10,
      wastedCalories: Math.round(wastedServings * kcal),
    };
  }).sort((a, b) => b.wastedServings - a.wastedServings);

  const servings = items.reduce((s, i) => s + i.servings, 0);
  const wasted   = items.reduce((s, i) => s + i.wastedServings, 0);
  const platesTotal = { 7: 89, 30: 342, 90: 1240 }[days] ?? 342;

  return {
    platesMeasured: Math.round(platesTotal * 0.62),
    platesTotal,
    responseRate: 62,
    eatenPct: Math.round((1 - wasted / servings) * 100),
    servingsTaken: Math.round(servings),
    wastedServings: Math.round(wasted),
    wastedCalories: items.reduce((s, i) => s + i.wastedCalories, 0),
    items,
  };
}

function generateMockDayOfWeek(days) {
  // Weekday dining is busy and steady; Friday drops off and the weekend is
  // half of a weekday. That shape is the point of the chart, so the mock has it.
  const shape = [
    ['Sun', 0.48], ['Mon', 1.18], ['Tue', 1.14], ['Wed', 1.20],
    ['Thu', 1.05], ['Fri', 0.79], ['Sat', 0.44],
  ];
  const perDay = ({ 7: 89, 30: 342, 90: 1240 }[days] ?? 342) / days;
  return shape.map(([day, factor]) => ({
    day,
    avgMeals: Math.round(perDay * factor * 10) / 10,
    meals: Math.round(perDay * factor * (days / 7)),
  }));
}

function generateMockHalls(days) {
  const total = { 7: 89, 30: 342, 90: 1240 }[days] ?? 342;
  const rows = [['Usdan', 0.44, 71, 0.72], ['Sherman', 0.39, 63, 0.81], ['Kosher', 0.17, 29, 0.85]];
  return rows.map(([hall, share, students, eaten]) => ({
    hall,
    meals: Math.round(total * share),
    students: Math.round(students * (days === 7 ? 0.55 : days === 90 ? 1.25 : 1)),
    eatenPct: Math.round(eaten * 100),
  }));
}

function generateMockRatings() {
  const top = [
    { name: 'Grilled Chicken Breast', avg: 4.6, count: 41 },
    { name: 'Greek Yogurt Parfait',   avg: 4.5, count: 33 },
    { name: 'Pasta Primavera',        avg: 4.3, count: 38 },
    { name: 'Fresh Fruit Cup',        avg: 4.2, count: 22 },
    { name: 'Caesar Salad',           avg: 4.0, count: 29 },
  ];
  const bottom = [
    { name: 'Roasted Brussels Sprouts', avg: 2.1, count: 27 },
    { name: 'Vegetable Medley',         avg: 2.4, count: 19 },
    { name: 'Baked Cod',                avg: 2.6, count: 14 },
    { name: 'Steamed White Rice',       avg: 2.9, count: 46 },
    { name: 'Quinoa Pilaf',             avg: 3.1, count: 17 },
  ];
  return { top, bottom, minCount: MIN_RATINGS };
}

function generateMockSuggestions() {
  const ago = d => new Date(Date.now() - d * 86400000).toISOString();
  return [
    { id: 'm1', content: 'Please keep the grill open past 8pm on weeknights. Anyone with a late lab gets there and it is already closed.', emphasize_count: 34, flag_count: 0, created_at: ago(2) },
    { id: 'm2', content: 'The Brussels sprouts are always soggy by dinner. Could they be roasted in smaller batches?', emphasize_count: 27, flag_count: 0, created_at: ago(4) },
    { id: 'm3', content: 'More vegetarian protein that is not tofu. Lentils, chickpeas, beans, anything.', emphasize_count: 22, flag_count: 0, created_at: ago(6) },
    { id: 'm4', content: 'Label the allergens on the salad bar dressings.', emphasize_count: 18, flag_count: 0, created_at: ago(9) },
    { id: 'm5', content: 'Rice portions are way bigger than anyone finishes. Smaller default scoop would waste less.', emphasize_count: 15, flag_count: 0, created_at: ago(12) },
  ];
}

function isMockMode() {
  return new URLSearchParams(window.location.search).get('mock') === 'true';
}

// ── Admin auth ────────────────────────────────────────────────────────────────

export async function getAdminRecord() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('admin_users')
    .select('university, is_active, is_super_admin')
    .eq('user_id', user.id)
    .single();
  return data ?? null;
}

/**
 * Create and send an invite, or resend an existing one.
 *
 * All the work happens in the send-invite Edge Function: it mints the token,
 * stores only its hash, and sends the single email. The browser used to send a
 * second copy through EmailJS after this call, so invitees got two emails and
 * the UI reported success from the wrong one. That path is gone.
 */
export async function sendInvite({ email, university, inviteId } = {}) {
  const { data, error } = await supabase.functions.invoke('send-invite', {
    body: inviteId ? { inviteId } : { email, university },
  });
  if (error) {
    let msg = 'Could not send the invite.';
    try {
      const body = await error.context?.json?.();
      if (body?.error) msg = body.error;
    } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data; // { id, emailSent, emailError, link }
}

/** Cancel a pending invite. The emailed link stops working immediately. */
export async function revokeInvite(inviteId) {
  const { error } = await supabase
    .from('pulse_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
    .is('used_at', null)
    .is('revoked_at', null);
  if (error) throw new Error('Could not revoke that invite.');
}

/** pending | accepted | revoked | expired */
export function inviteStatus(inv) {
  if (inv.used_at) return 'accepted';
  if (inv.revoked_at) return 'revoked';
  if (new Date(inv.expires_at) <= new Date()) return 'expired';
  return 'pending';
}

/** Admins at this university, so access can be removed when someone leaves. */
export async function getAdmins(university) {
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, user_id, university, is_active, is_super_admin, created_at')
    .eq('university', university)
    .order('created_at', { ascending: true });
  if (error) return [];
  return data ?? [];
}

/**
 * Turn an admin's access on or off. Guarded in the database too: migration 035
 * forbids a super admin changing their own row, so the last administrator
 * cannot lock everyone out.
 */
export async function setAdminActive(adminRowId, isActive) {
  const { error } = await supabase
    .from('admin_users')
    .update({ is_active: isActive })
    .eq('id', adminRowId);
  if (error) throw new Error('Could not update that admin.');
}

async function getUserIdsForUniversity(university) {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('university', university);
  return (data ?? []).map(p => p.id);
}

export async function getInvites() {
  const { data, error } = await supabase
    .from('pulse_invites')
    .select('id, email, university, used_at, revoked_at, expires_at, created_at, last_sent_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

// ── Password reset ─────────────────────────────────────────────────────────
//
// Pulse had no reset at all: an admin who forgot their password had no way
// back in, and the only thing that ever changed a password was redeeming an
// invite, which is exactly the behaviour that has now been removed.
//
// Separate from the student helper in lib/db.js because the recovery link has
// to return to /admin. Sending an admin to /app would drop them into the
// student experience holding a recovery session.

export async function sendPulsePasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/admin`,
  });
  // Deliberately not surfaced to the caller as a failure for an unknown
  // address: "no such account" tells an attacker which emails are admins.
  if (error && !/user not found/i.test(error.message ?? '')) {
    throw new Error('Could not send the reset email. Try again shortly.');
  }
}

export async function updatePulsePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message ?? 'Could not update your password.');
}

// ── Data queries ──────────────────────────────────────────────────────────────

export async function getPulseOverview(university, days = 30) {
  if (isMockMode()) return generateMockOverview(days);

  const now = Date.now();
  const periodStart   = new Date(now - days * 86400000).toISOString();
  const prevPeriodStart = new Date(now - days * 2 * 86400000).toISOString();

  const userIds = await getUserIdsForUniversity(university);

  const [totalRes, installedRes, currActiveRes, currMealsRes, prevActiveRes, prevMealsRes] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('university', university),
    // Home-screen installs. iOS delivers web push only to an installed app, so
    // this is the ceiling on how many students a notification can ever reach.
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('university', university).eq('is_installed', true),
    supabase.from('meal_history').select('user_id').gte('confirmed_at', periodStart).in('user_id', userIds),
    supabase.from('meal_history').select('id', { count: 'exact', head: true }).gte('confirmed_at', periodStart).in('user_id', userIds),
    supabase.from('meal_history').select('user_id').gte('confirmed_at', prevPeriodStart).lt('confirmed_at', periodStart).in('user_id', userIds),
    supabase.from('meal_history').select('id', { count: 'exact', head: true }).gte('confirmed_at', prevPeriodStart).lt('confirmed_at', periodStart).in('user_id', userIds),
  ]);

  const active     = new Set((currActiveRes.data ?? []).map(r => r.user_id)).size;
  const prevActive = new Set((prevActiveRes.data ?? []).map(r => r.user_id)).size;
  const meals      = currMealsRes.count ?? 0;
  const prevMeals  = prevMealsRes.count ?? 0;

  const total     = totalRes.count ?? 0;
  const installed = installedRes.count ?? 0;

  return {
    totalStudents:      total,
    installedStudents:  installed,
    installRate:        total > 0 ? Math.round((installed / total) * 100) : null,
    activeThisPeriod:   active,
    mealsThisPeriod:    meals,
    prevActiveStudents: prevActive,
    prevMeals,
    changeActive: prevActive > 0 ? Math.round(((active - prevActive) / prevActive) * 100) : null,
    changeMeals:  prevMeals  > 0 ? Math.round(((meals  - prevMeals)  / prevMeals)  * 100) : null,
  };
}

/**
 * Everything derived from confirmed plates, from a single read.
 *
 * This used to be four exported functions -- engagement, meal split, top items,
 * nutrition -- and each one fetched the same meal_history rows again. Adding
 * waste, day-of-week and per-hall views would have made it seven round trips
 * over identical data. One fetch, then pure functions over the result.
 *
 * Returns { engagement, mealSplit, topItems, waste, dayOfWeek, halls }.
 */
export async function getMealAnalytics(university, days = 30) {
  if (isMockMode()) {
    return {
      engagement: generateMockEngagement(days),
      mealSplit:  generateMockMealSplit(days),
      topItems:   generateMockTopItems(days),
      waste:      generateMockWaste(days),
      dayOfWeek:  generateMockDayOfWeek(days),
      halls:      generateMockHalls(days),
    };
  }

  const periodStart = new Date(Date.now() - days * 86400000).toISOString();
  const userIds = await getUserIdsForUniversity(university);
  const { data } = await supabase
    .from('meal_history')
    .select('confirmed_at, user_id, meal_type, dining_hall, items')
    .gte('confirmed_at', periodStart)
    .in('user_id', userIds);

  const rows = data ?? [];
  return {
    engagement: buildEngagement(rows),
    mealSplit:  buildMealSplit(rows),
    topItems:   buildTopItems(rows),
    waste:      buildWaste(rows),
    dayOfWeek:  buildDayOfWeek(rows, days),
    halls:      buildHalls(rows),
  };
}

// A student who takes two scoops has taken two servings. Everything below
// counts servings rather than rows, because a half-eaten double portion is
// twice the waste of a half-eaten single.
const servingsOf = item => {
  const n = Number(item?.servings);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
};

function buildEngagement(rows) {
  const byDate = {};
  for (const row of rows) {
    const date = row.confirmed_at.slice(0, 10);
    if (!byDate[date]) byDate[date] = { date, meals: 0, users: new Set() };
    byDate[date].meals += 1;
    byDate[date].users.add(row.user_id);
  }
  return Object.values(byDate)
    .map(d => ({ date: d.date, meals: d.meals, users: d.users.size }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildMealSplit(rows) {
  const counts = { breakfast: 0, lunch: 0, dinner: 0 };
  for (const row of rows) {
    const type = row.meal_type ?? row.items?.[0]?.meal;
    if (type && counts[type] !== undefined) counts[type]++;
  }
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
}

function buildTopItems(rows) {
  const counts = {};
  for (const row of rows) {
    for (const item of row.items ?? []) {
      if (!item?.name) continue;
      counts[item.name] = (counts[item.name] ?? 0) + servingsOf(item);
    }
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * Plate waste, per dish.
 *
 * `consumed` is a fraction of what the student took, written by the rating
 * sheet after a meal. Only items a student actually answered for carry it, so
 * an item with no `consumed` is not waste of zero -- it is unmeasured, and is
 * excluded from every number here. Mixing the two would make the halls look
 * better the less anyone reported.
 *
 * The ranking is by servings left, not by percentage. A dish 40% wasted across
 * 200 servings is a kitchen problem; the same 40% across four servings is
 * noise, and a percentage ranking would put them side by side.
 */
function buildWaste(rows) {
  const byName = {};
  let servingsTaken = 0, servingsWasted = 0, caloriesWasted = 0, platesMeasured = 0;

  for (const row of rows) {
    let measuredOnThisPlate = false;
    for (const item of row.items ?? []) {
      if (typeof item?.consumed !== 'number' || !item.name) continue;
      measuredOnThisPlate = true;

      const s = servingsOf(item);
      const eaten = Math.min(Math.max(item.consumed, 0), 1);
      const wasted = s * (1 - eaten);
      const kcal = item.nutrition?.calories ?? 0;

      const e = byName[item.name] ??= {
        name: item.name, takes: 0, servings: 0, eatenServings: 0,
        wastedServings: 0, wastedCalories: 0,
      };
      e.takes += 1;
      e.servings += s;
      e.eatenServings += s * eaten;
      e.wastedServings += wasted;
      e.wastedCalories += wasted * kcal;

      servingsTaken  += s;
      servingsWasted += wasted;
      caloriesWasted += wasted * kcal;
    }
    if (measuredOnThisPlate) platesMeasured += 1;
  }

  const items = Object.values(byName)
    .map(e => ({
      name: e.name,
      takes: e.takes,
      servings: e.servings,
      avgEaten: e.servings > 0 ? e.eatenServings / e.servings : 0,
      wastedServings: Math.round(e.wastedServings * 10) / 10,
      wastedCalories: Math.round(e.wastedCalories),
    }))
    .sort((a, b) => b.wastedServings - a.wastedServings)
    .slice(0, 12);

  return {
    platesMeasured,
    platesTotal: rows.length,
    responseRate: rows.length > 0 ? Math.round((platesMeasured / rows.length) * 100) : 0,
    eatenPct: servingsTaken > 0 ? Math.round((1 - servingsWasted / servingsTaken) * 100) : null,
    servingsTaken: Math.round(servingsTaken),
    wastedServings: Math.round(servingsWasted),
    wastedCalories: Math.round(caloriesWasted),
    items,
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Meals by day of week. Staffing and production are planned per weekday, so a
 * 30-day total answers the wrong question -- "how many Tuesdays' worth of food
 * do we cook" is the one a dining director actually has to answer.
 *
 * Averaged over how many of each weekday fall inside the window, because a
 * 30-day window contains four or five of each and an unaveraged bar chart
 * would show a spike on whichever day happened to land five times.
 */
function buildDayOfWeek(rows, days) {
  const totals = WEEKDAYS.map(day => ({ day, meals: 0 }));
  for (const row of rows) {
    const d = new Date(row.confirmed_at);
    totals[d.getDay()].meals += 1;
  }

  // How many of each weekday the window actually covers.
  const occurrences = new Array(7).fill(0);
  const start = new Date(Date.now() - (days - 1) * 86400000);
  for (let i = 0; i < days; i++) {
    occurrences[new Date(start.getTime() + i * 86400000).getDay()] += 1;
  }

  return totals.map((t, i) => ({
    ...t,
    avgMeals: occurrences[i] > 0 ? Math.round((t.meals / occurrences[i]) * 10) / 10 : 0,
  }));
}

/**
 * Per-hall attribution. Rows confirmed before migration 033 carry no hall and
 * are reported as "Unattributed" rather than folded into a hall that might not
 * have served them.
 */
function buildHalls(rows) {
  const byHall = {};
  for (const row of rows) {
    const hall = row.dining_hall ?? 'Unattributed';
    const e = byHall[hall] ??= { hall, meals: 0, students: new Set(), taken: 0, eaten: 0 };
    e.meals += 1;
    e.students.add(row.user_id);
    for (const item of row.items ?? []) {
      if (typeof item?.consumed !== 'number') continue;
      const s = servingsOf(item);
      e.taken += s;
      e.eaten += s * Math.min(Math.max(item.consumed, 0), 1);
    }
  }
  return Object.values(byHall)
    .map(e => ({
      hall: e.hall,
      meals: e.meals,
      students: e.students.size,
      eatenPct: e.taken > 0 ? Math.round((e.eaten / e.taken) * 100) : null,
    }))
    .sort((a, b) => b.meals - a.meals);
}

/**
 * Highest and lowest rated dishes, gated on MIN_RATINGS.
 *
 * Previously this read every aggregate with count >= 1, so a bagel someone
 * rated once appeared above dishes with forty ratings. Anything under the floor
 * is withheld and counted, so the card can say how much it is not showing
 * rather than silently dropping it.
 */
export async function getPulseRatings(university) {
  if (isMockMode()) return generateMockRatings();

  let query = supabase
    .from('item_rating_aggregates')
    .select('item_name, avg_rating, rating_count');
  if (university) query = query.eq('university', university);
  const { data } = await query;

  const all = (data ?? []).map(r => ({
    name: r.item_name,
    avg: parseFloat(r.avg_rating),
    count: r.rating_count,
  }));

  const ranked = all
    .filter(r => r.count >= MIN_RATINGS && Number.isFinite(r.avg))
    .sort((a, b) => b.avg - a.avg);

  // Five from each end only works when there are at least ten to draw from.
  // Brandeis currently has six dishes over the floor, and a naive slice(0,5)
  // plus slice(-5) would list four of them as both the highest and the lowest
  // rated on campus. Below ten, split down the middle instead.
  const mid = Math.ceil(ranked.length / 2);

  return {
    top: ranked.slice(0, Math.min(5, mid)),
    bottom: ranked.slice(Math.max(ranked.length - 5, mid)).reverse(),
    withheld: all.length - ranked.length,
    minCount: MIN_RATINGS,
  };
}


export async function getDietaryBreakdown(university) {
  if (isMockMode()) return generateMockDietary();

  const userIds = await getUserIdsForUniversity(university);
  const { data } = await supabase
    .from('dietary_restrictions')
    .select('vegan, vegetarian, gluten_free, dairy_free, nut_free, halal, kosher')
    .in('user_id', userIds);

  if (!data || data.length === 0) return [];

  const total = data.length;
  const fields = ['vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'nut_free', 'halal', 'kosher'];
  const labels = {
    vegan: 'Vegan', vegetarian: 'Vegetarian', gluten_free: 'Gluten-Free',
    dairy_free: 'Dairy-Free', nut_free: 'Nut-Free', halal: 'Halal', kosher: 'Kosher',
  };

  return fields
    .map(f => ({ name: labels[f], count: data.filter(r => r[f]).length, pct: Math.round(data.filter(r => r[f]).length / total * 100) }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

export async function getAdminSuggestions(university, days = null) {
  if (isMockMode()) return generateMockSuggestions();

  const { data } = await supabase.rpc('get_admin_suggestions', {
    p_university: university,
    p_days: days,
  });
  return data ?? [];
}

// ── Surveys ────────────────────────────────────────────────────────────────
//
// All three go through SECURITY DEFINER functions that check the caller is an
// active admin for the university being asked about. There is deliberately no
// direct table access: survey_responses holds the answering student's id to
// stop double answers, and get_survey_results is what guarantees that id never
// reaches a dashboard. See migration 034.

export const SURVEY_FORMATS = [
  { value: 'multiple_choice', label: 'Multiple choice', hint: 'Two to six options, one tap to answer.' },
  { value: 'rating',          label: 'Rating, 1 to 5',  hint: 'Good for satisfaction over time.' },
  { value: 'yes_no',          label: 'Yes or no',       hint: 'Highest response rate. Use for a single decision.' },
  { value: 'short_answer',    label: 'Short answer',    hint: 'Richest replies, lowest response rate.' },
];

// Mirrors the boolean columns on dietary_restrictions. A student matches when
// ANY selected restriction is set on their profile.
export const SURVEY_TARGETS = [
  { value: 'vegetarian',  label: 'Vegetarian'  },
  { value: 'vegan',       label: 'Vegan'       },
  { value: 'kosher',      label: 'Kosher'      },
  { value: 'halal',       label: 'Halal'       },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'dairy_free',  label: 'Dairy-free'  },
  { value: 'nut_free',    label: 'Nut-free'    },
];

function generateMockSurveys() {
  const ago = d => new Date(Date.now() - d * 86400000).toISOString();
  return [
    {
      id: 'ms1',
      question: 'How satisfied are you with dinner options this week?',
      format: 'rating', options: [], targets: [],
      published_at: ago(2), closes_at: new Date(Date.now() + 5 * 86400000).toISOString(),
      is_active: true, answered: 128, dismissed: 24,
      tally: [
        { choice: '4', count: 47 }, { choice: '3', count: 38 },
        { choice: '5', count: 21 }, { choice: '2', count: 14 }, { choice: '1', count: 8 },
      ],
      text_answers: [],
    },
    {
      id: 'ms2',
      question: 'Would more hot vegetarian entrees at dinner be useful?',
      format: 'yes_no', options: [], targets: ['vegetarian', 'vegan'],
      published_at: ago(9), closes_at: ago(2),
      is_active: false, answered: 54, dismissed: 6,
      tally: [{ choice: 'Yes', count: 49 }, { choice: 'No', count: 5 }],
      text_answers: [],
    },
  ];
}

export async function getSurveys(university) {
  if (isMockMode()) return generateMockSurveys();
  const { data, error } = await supabase.rpc('get_survey_results', { p_university: university });
  if (error) throw error;
  return data ?? [];
}

/**
 * Publish a survey. Throws with a readable message when the weekly cap blocks
 * it, because the raw error is a unique index name.
 */
export async function createSurvey(university, { question, format, options = [], targets = [], days = 7 }) {
  const { data, error } = await supabase.rpc('create_survey', {
    p_university: university,
    p_question: question,
    p_format: format,
    p_options: format === 'multiple_choice' ? options : [],
    p_targets: targets,
    p_days: days,
  });
  if (error) {
    if (/weekly limit reached/i.test(error.message)) {
      throw new Error('One survey per week. The next one can go out at the start of next week.');
    }
    throw new Error(error.message ?? 'Could not publish the survey.');
  }
  return data;
}

export async function closeSurvey(surveyId) {
  const { error } = await supabase.rpc('close_survey', { p_survey_id: surveyId });
  if (error) throw new Error(error.message ?? 'Could not close the survey.');
}
