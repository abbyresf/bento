/**
 * Creates a demo user account pre-populated with 2 weeks of meal history,
 * weekly summaries, and streak data so the Insights panel has real data to show.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/seed-demo-user.mjs
 *
 * Demo credentials:
 *   Email:    demo@bento.app
 *   Password: BentoDemo123!
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jeexzjphglnpugsuznad.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY before running.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Reference date: today = 2026-05-04 (Monday) ───────────────────────────
function daysAgo(n) {
  const d = new Date('2026-05-04T12:00:00Z');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Realistic meal items ───────────────────────────────────────────────────
const MEALS = {
  breakfast: [
    { id: 'b1', name: 'Scrambled Eggs', station: 'Grill', nutrition: { calories: 210, protein: 18, carbs: 2, fat: 14 }, tags: [] },
    { id: 'b2', name: 'Oatmeal with Berries', station: 'Cereal', nutrition: { calories: 280, protein: 8, carbs: 52, fat: 5 }, tags: ['vegetarian'] },
    { id: 'b3', name: 'Whole Wheat Toast', station: 'Bakery', nutrition: { calories: 140, protein: 5, carbs: 26, fat: 2 }, tags: ['vegan'] },
    { id: 'b4', name: 'Greek Yogurt Parfait', station: 'Deli', nutrition: { calories: 230, protein: 14, carbs: 35, fat: 4 }, tags: ['vegetarian'] },
    { id: 'b5', name: 'Banana', station: 'Fruit', nutrition: { calories: 105, protein: 1, carbs: 27, fat: 0 }, tags: ['vegan'] },
  ],
  lunch: [
    { id: 'l1', name: 'Grilled Chicken Breast', station: 'Grill', nutrition: { calories: 280, protein: 52, carbs: 0, fat: 6 }, tags: [] },
    { id: 'l2', name: 'Brown Rice', station: 'Entrees', nutrition: { calories: 215, protein: 5, carbs: 45, fat: 2 }, tags: ['vegan'] },
    { id: 'l3', name: 'Caesar Salad', station: 'Salad Bar', nutrition: { calories: 180, protein: 6, carbs: 12, fat: 13 }, tags: ['vegetarian'] },
    { id: 'l4', name: 'Roasted Vegetables', station: 'Entrees', nutrition: { calories: 120, protein: 3, carbs: 22, fat: 4 }, tags: ['vegan'] },
    { id: 'l5', name: 'Black Bean Burger', station: 'Grill', nutrition: { calories: 310, protein: 18, carbs: 42, fat: 8 }, tags: ['vegan'] },
    { id: 'l6', name: 'Pasta Primavera', station: 'Pasta', nutrition: { calories: 340, protein: 12, carbs: 58, fat: 9 }, tags: ['vegetarian'] },
  ],
  dinner: [
    { id: 'd1', name: 'Salmon Fillet', station: 'Grill', nutrition: { calories: 310, protein: 42, carbs: 0, fat: 14 }, tags: [] },
    { id: 'd2', name: 'Quinoa', station: 'Entrees', nutrition: { calories: 185, protein: 7, carbs: 34, fat: 3 }, tags: ['vegan'] },
    { id: 'd3', name: 'Steamed Broccoli', station: 'Vegetables', nutrition: { calories: 55, protein: 4, carbs: 11, fat: 1 }, tags: ['vegan'] },
    { id: 'd4', name: 'Beef Stir Fry', station: 'Asian', nutrition: { calories: 390, protein: 35, carbs: 28, fat: 15 }, tags: [] },
    { id: 'd5', name: 'Lentil Soup', station: 'Soup', nutrition: { calories: 220, protein: 14, carbs: 38, fat: 3 }, tags: ['vegan'] },
    { id: 'd6', name: 'Chicken Tikka Masala', station: 'Entrees', nutrition: { calories: 420, protein: 38, carbs: 32, fat: 16 }, tags: [] },
    { id: 'd7', name: 'Garlic Bread', station: 'Bakery', nutrition: { calories: 160, protein: 4, carbs: 28, fat: 5 }, tags: ['vegetarian'] },
  ],
};

// A fixed 10-day menu of breakfast/lunch/dinner combos
const DAY_PLANS = [
  { breakfast: ['b1','b3','b5'], lunch: ['l1','l2','l3'], dinner: ['d1','d2','d3'] },       // day 0 (today)
  { breakfast: ['b4','b5'],      lunch: ['l1','l2','l4'], dinner: ['d6','d2','d3'] },       // day 1
  { breakfast: ['b1','b2'],      lunch: ['l3','l5'],      dinner: ['d4','d2','d3'] },       // day 2
  { breakfast: ['b2','b5'],      lunch: ['l1','l2','l4'], dinner: ['d1','d2','d7'] },       // day 3
  { breakfast: ['b1','b3','b5'], lunch: ['l6','l4'],      dinner: ['d6','d3'] },            // day 4
  { breakfast: ['b4','b5'],      lunch: ['l1','l3','l4'], dinner: ['d4','d2'] },            // day 5
  { breakfast: ['b2','b5'],      lunch: ['l5','l2'],      dinner: ['d1','d3','d7'] },       // day 6
  { breakfast: ['b1','b3'],      lunch: ['l1','l2','l4'], dinner: ['d5','d2','d3'] },       // day 7
  { breakfast: ['b4','b5'],      lunch: ['l6','l3'],      dinner: ['d4','d7'] },            // day 8
  { breakfast: ['b2','b3','b5'], lunch: ['l1','l2','l4'], dinner: ['d1','d2','d3'] },       // day 9
];

function mealItems(mealType, dayIndex) {
  const ids = DAY_PLANS[dayIndex % DAY_PLANS.length][mealType];
  return ids.map(id => MEALS[mealType].find(m => m.id === id));
}

// ── Build meal_history rows for the past 10 days ──────────────────────────
function buildMealHistory(userId) {
  const rows = [];
  for (let d = 9; d >= 0; d--) {
    const date = daysAgo(d);
    for (const meal of ['breakfast', 'lunch', 'dinner']) {
      const items = mealItems(meal, d);
      // Stagger the timestamps across each day
      const hour = meal === 'breakfast' ? 8 : meal === 'lunch' ? 12 : 18;
      rows.push({
        user_id: userId,
        items,
        confirmed_at: `${date}T${String(hour).padStart(2,'0')}:30:00Z`,
      });
    }
  }
  return rows;
}

// ── Weekly summaries ───────────────────────────────────────────────────────
function buildWeeklySummaries(userId) {
  return [
    {
      user_id:      userId,
      week_start:   '2026-04-27',
      avg_calories: 1812,
      avg_protein:  89,
      avg_carbs:    218,
      avg_fat:      55,
      top_foods:    [
        { name: 'Grilled Chicken Breast', count: 5 },
        { name: 'Brown Rice',             count: 5 },
        { name: 'Banana',                 count: 4 },
        { name: 'Roasted Vegetables',     count: 4 },
        { name: 'Steamed Broccoli',       count: 3 },
      ],
      best_day:       'Wednesday',
      streak_at_end:  7,
    },
    {
      user_id:      userId,
      week_start:   '2026-04-20',
      avg_calories: 1754,
      avg_protein:  82,
      avg_carbs:    205,
      avg_fat:      52,
      top_foods:    [
        { name: 'Salmon Fillet',      count: 4 },
        { name: 'Quinoa',             count: 4 },
        { name: 'Caesar Salad',       count: 3 },
        { name: 'Scrambled Eggs',     count: 3 },
        { name: 'Steamed Broccoli',   count: 3 },
      ],
      best_day:       'Thursday',
      streak_at_end:  0,
    },
  ];
}

// ── Main ──────────────────────────────────────────────────────────────────
async function seed() {
  // 1. Delete existing demo user if present
  const { data: existing } = await supabase.auth.admin.listUsers();
  const prev = existing?.users?.find(u => u.email === 'demo@bento.app');
  if (prev) {
    console.log('Removing existing demo user…');
    await supabase.auth.admin.deleteUser(prev.id);
  }

  // 2. Create the auth user
  console.log('Creating demo user…');
  const { data: { user }, error: createErr } = await supabase.auth.admin.createUser({
    email:          'demo@bento.app',
    password:       'BentoDemo123!',
    email_confirm:  true,
  });
  if (createErr) { console.error(createErr); process.exit(1); }
  const uid = user.id;
  console.log(`Created user ${uid}`);

  // 3. Profile
  await supabase.from('profiles').upsert({
    id:             uid,
    weight:         135,
    weight_unit:    'lbs',
    height_feet:    5,
    height_inches:  5,
    age:            21,
    sex:            'female',
    activity_level: 'moderate',
    goal:           'maintain',
    terms_accepted: true,
    updated_at:     new Date().toISOString(),
  });

  // 4. Nutrition targets
  await supabase.from('nutrition_targets').upsert({
    user_id:    uid,
    calories:   1800,
    protein:    90,
    carbs:      225,
    fat:        60,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  // 5. Meal history (10 days × 3 meals)
  console.log('Inserting meal history…');
  const history = buildMealHistory(uid);
  const { error: histErr } = await supabase.from('meal_history').insert(history);
  if (histErr) { console.error('meal_history:', histErr); process.exit(1); }
  console.log(`Inserted ${history.length} meal_history rows`);

  // 6. Weekly summaries (2 weeks)
  console.log('Inserting weekly summaries…');
  const { error: summErr } = await supabase.from('weekly_summaries').insert(buildWeeklySummaries(uid));
  if (summErr) { console.error('weekly_summaries:', summErr); process.exit(1); }

  // 7. Streak
  await supabase.from('streaks').upsert({
    user_id:             uid,
    current_streak:      10,
    longest_streak:      10,
    last_confirmed_date: daysAgo(0),
  }, { onConflict: 'user_id' });

  console.log('\nDone! Sign in at localhost:5173 with:');
  console.log('  Email:    demo@bento.app');
  console.log('  Password: BentoDemo123!');
}

seed().catch(e => { console.error(e); process.exit(1); });
