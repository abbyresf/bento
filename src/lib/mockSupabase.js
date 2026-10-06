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

const item = (id, name, calories, protein, carbs, fat) => ({
  id, name, calories, protein, carbs, fat, servings: 1, source: 'Mock Station',
});

const FIXTURES = {
  profiles: [{
    id: USER.id, weight: 150, weight_unit: 'lb', height_feet: 5, height_inches: 7,
    age: 21, sex: 'female', activity_level: 'moderate', goal: 'maintain',
    university: 'brandeis', terms_accepted: true, push_enabled: false,
    show_calories: true, show_protein: true, show_carbs: true, show_fat: true,
  }],
  nutrition_targets: [{ calories: 2000, protein: 110, carbs: 240, fat: 65 }],
  dietary_restrictions: [{
    vegetarian: false, vegan: false, gluten_free: false, halal: false, kosher: false,
    allergies: [], avoid_ingredients: [],
  }],
  streaks: [{ current_streak: 5, longest_streak: 12, last_confirmed_date: day(-1) }],
  meal_history: [
    { id: 'm1', meal_type: 'lunch', confirmed_at: new Date(Date.now() - 86400000).toISOString(),
      items: [item('a', 'Grilled chicken breast', 280, 42, 0, 8), item('b', 'Brown rice', 215, 5, 45, 2)] },
    { id: 'm2', meal_type: 'dinner', confirmed_at: new Date(Date.now() - 86400000).toISOString(),
      items: [item('c', 'Roasted vegetables', 120, 3, 18, 5), item('d', 'Baked salmon', 350, 34, 0, 22)] },
  ],
};

function query(name) {
  const rows = FIXTURES[name] ?? [];
  const result = () => ({ data: rows, error: null, count: rows.length });
  const one = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  const q = {
    select: () => q, eq: () => q, neq: () => q, gte: () => q, lte: () => q, gt: () => q,
    lt: () => q, in: () => q, is: () => q, not: () => q, order: () => q, limit: () => q,
    range: () => q, match: () => q, ilike: () => q, or: () => q,
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
    rpc: () => Promise.resolve({ data: null, error: null }),
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
