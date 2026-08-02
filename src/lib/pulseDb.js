import { supabase } from './supabase';

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

function generateMockNutrition(days) {
  // Each range simulates a different snapshot: shorter windows show more volatility
  const scenarios = {
    7:  { curr: { calories: 438, protein: 31, carbs: 39, fat: 17 }, prev: { calories: 401, protein: 26, carbs: 44, fat: 13 } },
    30: { curr: { calories: 412, protein: 28, carbs: 42, fat: 14 }, prev: { calories: 398, protein: 25, carbs: 45, fat: 16 } },
    90: { curr: { calories: 405, protein: 27, carbs: 43, fat: 15 }, prev: { calories: 408, protein: 28, carbs: 42, fat: 14 } },
  };
  const { curr, prev } = scenarios[days] ?? scenarios[30];
  return {
    ...curr,
    changeCalories: Math.round(((curr.calories - prev.calories) / prev.calories) * 100),
    changeProtein:  Math.round(((curr.protein  - prev.protein)  / prev.protein)  * 100),
    changeCarbs:    Math.round(((curr.carbs    - prev.carbs)    / prev.carbs)    * 100),
    changeFat:      Math.round(((curr.fat      - prev.fat)      / prev.fat)      * 100),
  };
}

function useMockData() {
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

export async function sendInvite(email, university) {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke('send-invite', {
    body: { email, university },
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Failed to send invite.');
  return data; // { id, emailSent, link }
}

export async function getInvites() {
  const { data, error } = await supabase
    .from('pulse_invites')
    .select('id, email, university, used_at, expires_at, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ── Data queries ──────────────────────────────────────────────────────────────

export async function getPulseOverview(university, days = 30) {
  if (useMockData()) return generateMockOverview(days);

  const now = Date.now();
  const periodStart   = new Date(now - days * 86400000).toISOString();
  const prevPeriodStart = new Date(now - days * 2 * 86400000).toISOString();

  const [totalRes, currActiveRes, currMealsRes, prevActiveRes, prevMealsRes] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('university', university),
    supabase.from('meal_history').select('user_id').gte('confirmed_at', periodStart),
    supabase.from('meal_history').select('id', { count: 'exact', head: true }).gte('confirmed_at', periodStart),
    supabase.from('meal_history').select('user_id').gte('confirmed_at', prevPeriodStart).lt('confirmed_at', periodStart),
    supabase.from('meal_history').select('id', { count: 'exact', head: true }).gte('confirmed_at', prevPeriodStart).lt('confirmed_at', periodStart),
  ]);

  const active     = new Set((currActiveRes.data ?? []).map(r => r.user_id)).size;
  const prevActive = new Set((prevActiveRes.data ?? []).map(r => r.user_id)).size;
  const meals      = currMealsRes.count ?? 0;
  const prevMeals  = prevMealsRes.count ?? 0;

  return {
    totalStudents:      totalRes.count ?? 0,
    activeThisPeriod:   active,
    mealsThisPeriod:    meals,
    prevActiveStudents: prevActive,
    prevMeals,
    changeActive: prevActive > 0 ? Math.round(((active - prevActive) / prevActive) * 100) : null,
    changeMeals:  prevMeals  > 0 ? Math.round(((meals  - prevMeals)  / prevMeals)  * 100) : null,
  };
}

export async function getDailyEngagement(university, days = 30) {
  if (useMockData()) return generateMockEngagement(days);

  const periodStart = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase
    .from('meal_history')
    .select('confirmed_at, user_id')
    .gte('confirmed_at', periodStart);

  if (!data) return [];

  const byDate = {};
  for (const row of data) {
    const date = row.confirmed_at.slice(0, 10);
    if (!byDate[date]) byDate[date] = { date, meals: 0, users: new Set() };
    byDate[date].meals += 1;
    byDate[date].users.add(row.user_id);
  }

  return Object.values(byDate)
    .map(d => ({ date: d.date, meals: d.meals, users: d.users.size }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getMealTypeSplit(university, days = 30) {
  if (useMockData()) return generateMockMealSplit(days);

  const periodStart = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase
    .from('meal_history')
    .select('meal_type, items')
    .gte('confirmed_at', periodStart);

  if (!data) return [];

  const counts = { breakfast: 0, lunch: 0, dinner: 0 };
  for (const row of data) {
    const type = row.meal_type ?? row.items?.[0]?.meal;
    if (type && counts[type] !== undefined) counts[type]++;
  }

  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
}

export async function getTopItems(university, days = 30) {
  if (useMockData()) return generateMockTopItems(days);

  const periodStart = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase
    .from('meal_history')
    .select('items')
    .gte('confirmed_at', periodStart);

  if (!data) return [];

  const counts = {};
  for (const row of data) {
    for (const item of row.items ?? []) {
      const name = item.name;
      if (!name) continue;
      counts[name] = (counts[name] ?? 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export async function getDietaryBreakdown(university) {
  if (useMockData()) return generateMockDietary();

  const { data } = await supabase
    .from('dietary_restrictions')
    .select('vegan, vegetarian, gluten_free, dairy_free, nut_free, halal, kosher');

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

export async function getNutritionAverages(university, days = 30) {
  if (useMockData()) return generateMockNutrition(days);

  const now = Date.now();
  const periodStart     = new Date(now - days * 86400000).toISOString();
  const prevPeriodStart = new Date(now - days * 2 * 86400000).toISOString();

  const [currRes, prevRes] = await Promise.all([
    supabase.from('meal_history').select('items').gte('confirmed_at', periodStart),
    supabase.from('meal_history').select('items').gte('confirmed_at', prevPeriodStart).lt('confirmed_at', periodStart),
  ]);

  function aggregate(rows) {
    let calories = 0, protein = 0, carbs = 0, fat = 0, count = 0;
    for (const row of rows ?? []) {
      for (const item of row.items ?? []) {
        const n = item.nutrition ?? {};
        if (!n.calories) continue;
        calories += n.calories ?? 0;
        protein  += n.protein  ?? 0;
        carbs    += n.carbs    ?? 0;
        fat      += n.fat      ?? 0;
        count++;
      }
    }
    if (count === 0) return null;
    return {
      calories: Math.round(calories / count),
      protein:  Math.round(protein  / count),
      carbs:    Math.round(carbs    / count),
      fat:      Math.round(fat      / count),
    };
  }

  const curr = aggregate(currRes.data);
  if (!curr) return null;
  const prev = aggregate(prevRes.data);

  function pctChange(c, p) {
    return p && p > 0 ? Math.round(((c - p) / p) * 100) : null;
  }

  return {
    ...curr,
    changeCalories: prev ? pctChange(curr.calories, prev.calories) : null,
    changeProtein:  prev ? pctChange(curr.protein,  prev.protein)  : null,
    changeCarbs:    prev ? pctChange(curr.carbs,    prev.carbs)    : null,
    changeFat:      prev ? pctChange(curr.fat,      prev.fat)      : null,
  };
}

export async function getAdminSuggestions(university, days = null) {
  const { data } = await supabase.rpc('get_admin_suggestions', {
    p_university: university,
    p_days: days,
  });
  return data ?? [];
}
