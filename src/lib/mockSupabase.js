/* A stand-in for the Supabase client, used ONLY for design work.
 *
 * It exists so the signed-in screens can be opened in a simulator or a browser
 * without a real account: a made-up student, profile, targets and meal history,
 * and nothing is saved anywhere. Turned on by building with VITE_UI_MOCK=true,
 * which nothing in this repository sets. The release workflow fails if the
 * marker string below is found in a shipped bundle.
 *
 * Marker: BENTO_UI_MOCK_ACTIVE
 */
const day = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const USER = { id: 'mock-user', email: 'student@bento.test' };

const item = (id, name, calories, protein, carbs, fat, source = 'Mock Station') => ({
  id, name, calories, protein, carbs, fat, servings: 1, source,
  nutrition: { calories, protein, carbs, fat },
});

// A believable fortnight of meals, so Insights, streaks, badges and the closet have something to show.
const DISHES = {
  breakfast: [
    [item('b1', 'Scrambled eggs', 190, 13, 2, 14, 'Grill'), item('b2', 'Whole wheat toast', 130, 5, 24, 2, 'Bakery'), item('b3', 'Fresh fruit cup', 80, 1, 20, 0, 'Fruit Bar')],
    [item('b4', 'Greek yogurt parfait', 240, 15, 32, 6, 'Fruit Bar'), item('b5', 'Granola', 160, 4, 26, 5, 'Fruit Bar')],
    [item('b6', 'Oatmeal', 150, 5, 27, 3, 'Hot Cereal'), item('b7', 'Berries', 60, 1, 14, 0, 'Fruit Bar'), item('b8', 'Almond butter', 95, 3, 3, 8, 'Hot Cereal')],
  ],
  lunch: [
    [item('l1', 'Grilled chicken breast', 280, 42, 0, 8, 'Grill'), item('l2', 'Brown rice', 215, 5, 45, 2, 'Global'), item('l3', 'Roasted broccoli', 70, 4, 10, 2, 'Global')],
    [item('l4', 'Garden veg wrap', 360, 12, 48, 13, 'Deli'), item('l5', 'Tomato basil soup', 170, 4, 24, 6, 'Soups'), item('l6', 'Side salad', 60, 2, 8, 3, 'Salad Bar')],
    [item('l7', 'Vegetable uramaki', 310, 9, 58, 5, 'Sushi'), item('l8', 'Edamame', 120, 11, 9, 5, 'Sushi'), item('l9', 'Miso soup', 40, 3, 4, 1, 'Soups')],
    [item('l10', 'Turkey club', 420, 31, 38, 16, 'Deli'), item('l11', 'Kettle chips', 150, 2, 15, 10, 'Deli')],
  ],
  dinner: [
    [item('d1', 'Baked salmon', 350, 34, 0, 22, 'Entree'), item('d2', 'Roasted sweet potatoes', 180, 3, 41, 0, 'Sides'), item('d3', 'Steamed green beans', 45, 2, 10, 0, 'Sides')],
    [item('d4', 'Chicken tikka masala', 390, 32, 18, 21, 'Global'), item('d5', 'Basmati rice', 205, 4, 45, 0, 'Global'), item('d6', 'Naan', 140, 4, 25, 3, 'Global')],
    [item('d7', 'Tofu stir fry', 270, 19, 20, 14, 'Wok'), item('d8', 'Jasmine rice', 200, 4, 44, 0, 'Wok'), item('d9', 'Steamed bok choy', 25, 2, 4, 0, 'Wok')],
    [item('d10', 'Pasta primavera', 380, 14, 62, 9, 'Pasta'), item('d11', 'Garlic bread', 150, 4, 20, 6, 'Pasta'), item('d12', 'Caesar salad', 120, 4, 9, 8, 'Salad Bar')],
  ],
};
const HALLS = { breakfast: 'Sherman', lunch: 'Usdan', dinner: 'Sherman' };
const at = (offset, hour) => {
  const d = new Date(Date.now() + offset * 86400000);
  d.setHours(hour, 12, 0, 0);
  return d.toISOString();
};
const HOURS = { breakfast: 8, lunch: 12, dinner: 18 };

// Every day for 14 days back (today excluded): lunch and dinner, breakfast on most. Today: breakfast only, so the plates for
// lunch and dinner are still open.
const HISTORY = [];
for (let o = -1; o >= -14; o--) {
  const meals = ['lunch', 'dinner'];
  if (o % 3 !== 0) meals.unshift('breakfast');
  meals.forEach((type, i) => {
    const pool = DISHES[type];
    HISTORY.push({
      id: `m${-o}${type[0]}`, meal_type: type, meal_date: day(o), confirmed_at: at(o, HOURS[type]),
      dining_hall: HALLS[type], items: pool[(Math.abs(o) + i) % pool.length],
    });
  });
}
HISTORY.push({ id: 'm0b', meal_type: 'breakfast', meal_date: day(0), confirmed_at: at(0, 8), dining_hall: 'Sherman', items: DISHES.breakfast[0] });

const RATED = [
  ['l1', 'Grilled chicken breast', 5], ['d1', 'Baked salmon', 5], ['l7', 'Vegetable uramaki', 5], ['d4', 'Chicken tikka masala', 5],
  ['b6', 'Oatmeal', 4], ['l4', 'Garden veg wrap', 4], ['d7', 'Tofu stir fry', 4], ['b4', 'Greek yogurt parfait', 4],
  ['l8', 'Edamame', 5], ['d2', 'Roasted sweet potatoes', 4], ['l5', 'Tomato basil soup', 4], ['d10', 'Pasta primavera', 3],
  ['l10', 'Turkey club', 4], ['b1', 'Scrambled eggs', 3], ['d12', 'Caesar salad', 4], ['l2', 'Brown rice', 3],
];

const FIXTURES = {
  profiles: [{
    id: USER.id, weight: 150, weight_unit: 'lb', height_feet: 5, height_inches: 7,
    age: 21, sex: 'female', activity_level: 'moderate', goal: 'maintain',
    university: 'brandeis', terms_accepted: true, push_enabled: false,
    show_calories: true, show_protein: true, show_carbs: true, show_fat: true,
    display_name: 'Abby', push_social_enabled: false,
    mascot_outfit: 'chefhat', mascot_color: null,
  }],
  nutrition_targets: [{ calories: 2000, protein: 110, carbs: 240, fat: 65 }],
  dietary_restrictions: [{
    vegetarian: false, vegan: false, gluten_free: false, halal: false, kosher: false,
    allergies: [], avoid_ingredients: [],
  }],
  streaks: [{ current_streak: 14, longest_streak: 14, last_confirmed_date: day(0) }],
  meal_history: HISTORY,
  item_ratings: RATED.map(([item_id, item_name, rating], i) => ({
    item_id, item_name, rating, updated_at: at(-(i % 6), 14), dining_hall: i % 2 ? 'Sherman' : 'Usdan',
  })),
  quest_claims: [['days4', 7], ['rate3', 14], ['twoMeals', 21]].map(([quest_id, back]) => ({
    quest_id, week_start: day(-((new Date().getDay() + 6) % 7) - back),
  })),
  weekly_summaries: [{
    week_start: day(-((new Date().getDay() + 6) % 7) - 7), avg_calories: 1940, avg_protein: 112, avg_carbs: 226, avg_fat: 64,
    best_day: 'Thursday', streak_at_end: 7,
    top_foods: [{ name: 'Grilled chicken breast', count: 4 }, { name: 'Baked salmon', count: 3 }, { name: 'Brown rice', count: 3 }],
  }],
  item_rating_aggregates: [
    ['a1', 'Crispy Chick\'n Tender', 4.8, 61, 'Sherman'], ['a2', 'Vegetable Uramaki', 4.7, 48, 'Usdan'], ['a3', 'Baked Salmon', 4.6, 39, 'Sherman'],
    ['a4', 'Chicken Tikka Masala', 4.5, 52, 'Sherman'], ['a5', 'Garden Veg Wrap', 4.3, 33, 'Usdan'], ['a6', 'Tofu Stir Fry', 4.2, 27, 'Usdan'],
  ].map(([item_id, item_name, avg_rating, rating_count, dining_hall]) => ({ item_id, item_name, avg_rating, rating_count, dining_hall, university: 'brandeis' })),
  suggestions: [
    ['Please bring back the build-your-own grain bowls at Sherman on weekdays.', 41, 1],
    ['More halal options at dinner, especially a protein that is not chicken.', 33, 2],
    ['A gluten-free bread option at the deli at lunch.', 27, 3],
    ['Label the spicy dishes at Usdan. I find out the hard way every time.', 19, 4],
    ['Keep the oat milk stocked at breakfast. It runs out by 9.', 12, 6],
  ].map(([content, emphasize_count, days], i) => ({
    id: `s${i}`, content, emphasize_count, created_at: at(-days, 11), is_hidden: false, university: 'brandeis',
  })),
};

// Made-up buddies. Maya is out at a hall right now. Each wears a different Bento.
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const monday = () => {
  const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const QUESTS = {
  f1: [['daily_duo', 2, 2, false], ['week_dinners', 4, 5, false], ['review_duo', 3, 3, false], ['taste_test', 1, 1, true]],
  f2: [['daily_duo', 1, 2, false], ['week_dinners', 2, 5, false], ['review_duo', 1, 3, false], ['taste_test', 0, 1, false]],
};
const STREAKS = { f1: 9, f2: 4, f3: 0 };
const RPC = {
  duo_friends: () => [
    { friend_id: 'f1', display_name: 'Maya', started_at: minutesAgo(60 * 24 * 12), i_share: true,
      here_hall: 'Usdan', here_meal: 'lunch', here_at: minutesAgo(18), here_until: minutesAgo(-42),
      mascot_outfit: 'sunglasses', mascot_color: 'cherry' },
    { friend_id: 'f2', display_name: 'Sam', started_at: minutesAgo(60 * 24 * 5), i_share: true,
      here_hall: null, here_meal: null, here_at: null, here_until: null, mascot_outfit: 'headband', mascot_color: 'sky' },
    { friend_id: 'f3', display_name: 'Rae', started_at: minutesAgo(60 * 24 * 2), i_share: false,
      here_hall: null, here_meal: null, here_at: null, here_until: null, mascot_outfit: null, mascot_color: 'matcha' },
  ],
  duo_streak: (a) => [{ current_streak: STREAKS[a?.p_friend] ?? 0, me_today: true, friend_today: a?.p_friend === 'f1' }],
  duo_quests: (a) => (QUESTS[a?.p_friend] ?? []).map(([quest_id, progress, target, claimed]) => ({
    quest_id, progress, target, claimed: claimed || a?.p_week !== monday(),   // last week reads as already claimed
  })),
  duo_perks: () => [{ claims: 3 }],
  duo_create_invite: () => [{ code: 'K7QM2XAF', expires_at: minutesAgo(-60 * 24) }],
  duo_redeem: () => [{ status: 'ok', friend_id: 'f9', display_name: 'Jo' }],
};

// Applies the filters a screen asks for, so "today" really means today and a week really means a week.
function query(name) {
  let rows = (FIXTURES[name] ?? []).slice();
  let head = false;
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const filter = (col, test) => { rows = rows.filter((r) => r[col] !== undefined && r[col] !== null && test(r[col])); };
  const result = () => ({ data: head ? null : rows, error: null, count: rows.length });
  const one = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  const q = {
    select: (_cols, opts) => { if (opts?.head) head = true; return q; },
    eq: (c, v) => { if (c !== 'user_id') filter(c, (x) => String(x) === String(v)); return q; },
    neq: (c, v) => { filter(c, (x) => String(x) !== String(v)); return q; },
    gte: (c, v) => { filter(c, (x) => cmp(String(x), String(v)) >= 0); return q; },
    gt: (c, v) => { filter(c, (x) => cmp(String(x), String(v)) > 0); return q; },
    lte: (c, v) => { filter(c, (x) => cmp(String(x), String(v)) <= 0); return q; },
    lt: (c, v) => { filter(c, (x) => cmp(String(x), String(v)) < 0); return q; },
    in: (c, vs) => { filter(c, (x) => vs.map(String).includes(String(x))); return q; },
    is: () => q, not: () => q, match: () => q, ilike: () => q, or: () => q,
    order: (c, o = {}) => { rows.sort((a, b) => cmp(a[c], b[c]) * (o.ascending === false ? -1 : 1)); return q; },
    limit: (n) => { rows = rows.slice(0, n); return q; },
    range: () => q,
    insert: () => q, update: () => q, upsert: () => q, delete: () => q,
    single: one, maybeSingle: one,
    then: (res, rej) => Promise.resolve(result()).then(res, rej),
  };
  return q;
}

export function createMock(mode = 'true') {
  // 'onboarding' starts a brand-new account: no profile yet, terms not accepted.
  if (mode === 'onboarding') {
    FIXTURES.profiles = [{ id: USER.id, university: null, terms_accepted: false, push_enabled: false }];
    FIXTURES.nutrition_targets = [];
    FIXTURES.dietary_restrictions = [];
    FIXTURES.meal_history = [];
    FIXTURES.streaks = [];
  }
  const session = { access_token: 'mock', refresh_token: 'mock', user: USER };
  return {
    __mock: 'BENTO_UI_MOCK_ACTIVE',
    from: query,
    rpc: (name, args) => Promise.resolve({ data: RPC[name]?.(args) ?? null, error: null }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: USER }, error: null }),
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({ error: null }),
      signInWithPassword: () => Promise.resolve({ data: { user: USER, session }, error: null }),
      signUp: () => Promise.resolve({ data: { user: USER, session }, error: null }),
      signInWithOAuth: () => Promise.resolve({ data: {}, error: null }),
      signInWithIdToken: () => Promise.resolve({ data: { user: USER, session }, error: null }),
      setSession: () => Promise.resolve({ data: { session }, error: null }),
      updateUser: () => Promise.resolve({ data: { user: USER }, error: null }),
      resetPasswordForEmail: () => Promise.resolve({ data: {}, error: null }),
    },
  };
}
