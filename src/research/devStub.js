/* A stand-in for the database, for looking at and working on the dashboard without
 * a real study. Development only: main.jsx imports it only when the address has
 * ?stub=, and a production build contains neither.
 *
 *   ?stub=researcher   signed in, multi-factor done
 *   ?stub=owner        the same, as an owner (the Audit page appears)
 *   ?stub=nomfa        signed in but still has to enter a code. The code is 123456
 *   ?stub=enroll       signed in and has no authenticator app yet
 *   ?stub=student      signed in as an account that is not a researcher
 *   ?stub=signedout    shows the sign in page. Any email and password work
 *
 * Add &rows=8000 to make the plate items sheet that big, to try the grid on a lot
 * of rows. In the console, __stubAddMeal() adds a meal and tells the page, to watch
 * rows arrive live. All of it is invented. */

function prng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const FOODS = ['Grilled chicken', 'Brown rice', 'Roasted broccoli', 'Pasta marinara', 'Garden salad', 'Black bean burger', 'Tofu stir fry',
  'Mashed potatoes', 'Fruit cup', 'Oatmeal', 'Scrambled eggs', 'Turkey sandwich', 'Lentil soup', 'Pizza slice', 'Yogurt parfait'];
const FIRST = ['Maya', 'Sam', 'Rae', 'Tess', 'Jordan', 'Alex', 'Priya', 'Noah', 'Lena', 'Omar', 'Ivy', 'Kai', 'Zoe', 'Ben', 'Nina', 'Leo', 'Ada', 'Eli', 'Mia', 'Theo', 'Ana', 'Sol', 'Uma', 'Finn', 'Ola', 'Raj', 'Tia', 'Abe', 'Gia', 'Hal'];
const iso = (d) => d.toISOString();
const day = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

function build(extraPlateRows) {
  const r = prng(7);
  const now = new Date();
  const participants = [], roster = [], responses = [], meals = [], plate = [], events = [], snaps = [], prompts = [], activity = [];
  let eventId = 1;
  for (let i = 0; i < 24; i++) {
    const code = `P-${String(i + 1).padStart(3, '0')}`;
    const grp = i % 2 === 0 ? 'S' : 'L';
    const enrolled = addDays(now, -(2 + (i % 14)));
    const status = i === 21 ? 'withdrawn' : i === 22 || i === 23 ? 'completed' : 'active';
    const email = `${FIRST[i].toLowerCase()}.${['cohen', 'lee', 'park', 'diaz', 'ng'][i % 5]}@example.edu`;
    const p = {
      row_id: `p${i}`, participant_code: code, grp, status, full_name: `${FIRST[i]} ${['Cohen', 'Lee', 'Park', 'Diaz', 'Ng'][i % 5]}`, email,
      enrolled_at: iso(enrolled), window_ends_at: iso(addDays(enrolled, 21)), withdrawn_at: status === 'withdrawn' ? iso(addDays(enrolled, 5)) : null,
      acknowledged_at: iso(enrolled), platform: 'ios', push_status: i % 7 === 3 ? 'off' : 'on', install_state: null,
    };
    participants.push(p);
    roster.push({ row_id: `r${i}`, email, full_name: p.full_name, grp, enrolled: true, participant_code: code, participant_status: status, added_at: iso(addDays(enrolled, -3)), claimed_at: iso(enrolled) });
    const days = Math.max(1, Math.floor((now - enrolled) / 86400000));
    let answered = 0, due = 0, plates = 0, reports = 0, opens = 0, claimed = 0, delivered = 0, undelivered = 0, late = 0;
    for (let d = 0; d < days; d++) {
      const date = day(addDays(enrolled, d));
      due += 1;
      claimed += 1; if (r() > 0.1) delivered += 1; else undelivered += 1;
      prompts.push({ row_id: `x${i}-${d}`, participant_code: code, grp, local_date: date, kind: 'reminder', title: grp === 'S' ? 'Snack time' : 'Loop, plan, then plate', status: r() > 0.1 ? 'sent' : 'failed', claimed_at: `${date}T14:30:02Z`, sent_at: `${date}T14:30:04Z`, error: null });
      if (r() > 0.2) {
        answered += 1; const isLate = r() > 0.85; if (isLate) late += 1;
        const qa = [['Did you eat lunch in Usdan or Sherman all-you-care-to-eat (AYCTE) dining hall today?', 'multiple_choice', r() > 0.5 ? 'Yes - in Sherman' : 'Yes - in Usdan', 10],
          [grp === 'S' ? 'Did you eat the snack given to you before lunch today?' : 'When having lunch at Usdan/Sherman, did you use the "loop and plan" strategy before getting food?', grp === 'S' ? 'yes_no' : 'rating', grp === 'S' ? 'Yes' : String(1 + Math.floor(r() * 5)), 20],
          ['To what extent were your lunch choices today consistent with your eating goals?', 'rating', String(1 + Math.floor(r() * 5)), 30],
          ['How much food was left at the end of your meal?', 'multiple_choice', ['Little or None', '1/4 plate', '1/2 plate', '3/4 plate'][Math.floor(r() * 4)], 40]];
        qa.forEach(([q, f, a, pos], k) => responses.push({ row_id: `a${i}-${d}-${k}`, participant_code: code, grp, for_date: date, late: isLate, submitted_at: `${date}T00:${String(10 + k).padStart(2, '0')}:00Z`, question_position: pos, question_text: q, question_format: f, answer_text: a }));
      }
      for (const type of ['lunch', 'dinner']) {
        if (r() > 0.85) continue;
        plates += 1; const reported = r() > 0.3; if (reported) reports += 1;
        const mealId = `m${i}-${d}-${type}`;
        meals.push({ row_id: mealId, participant_code: code, grp, meal_date: date, meal_type: type, dining_hall: r() > 0.5 ? 'Sherman' : 'Usdan', confirmed_at: `${date}T${type === 'lunch' ? '17' : '23'}:05:00Z`, item_count: 3, consumption_reported_at: reported ? `${date}T${type === 'lunch' ? '18' : '23'}:30:00Z` : null, deleted_at: null });
        for (let k = 0; k < 3; k++) plate.push({ row_id: `${mealId}:${k}`, participant_code: code, grp, meal_date: date, meal_type: type, dining_hall: 'Sherman', item_position: k, item_name: FOODS[Math.floor(r() * FOODS.length)], servings: 1, consumed: reported ? Math.round(r() * 4) / 4 : null, calories: 120 + Math.floor(r() * 300), protein: Math.floor(r() * 30), carbs: Math.floor(r() * 60), fat: Math.floor(r() * 20), deleted_at: null });
      }
      if (r() > 0.4) { opens += 1; events.push({ row_id: String(eventId++), participant_code: code, grp, at: `${date}T13:${String(10 + Math.floor(r() * 40))}:00Z`, kind: 'app_open', detail: '{}' }); }
    }
    snaps.push({ row_id: `s${i}`, participant_code: code, grp, taken_at: iso(enrolled), reason: 'enrolment', university: 'brandeis', weight: 130 + Math.floor(r() * 60), weight_unit: 'lbs', height_feet: 5, height_inches: Math.floor(r() * 12), age: 18 + Math.floor(r() * 5), sex: i % 2 ? 'female' : 'male', activity_level: 'moderate', goal: 'maintain', skip_breakfast: r() > 0.7, calories: 1900 + Math.floor(r() * 500), protein: 100, carbs: 250, fat: 70, restrictions: i % 5 === 0 ? '{"vegetarian":true,"halal":true}' : '{}' });
    activity.push({ row_id: `p${i}`, participant_code: code, grp, status, enrolled_at: iso(enrolled), days_enrolled: days, prompts_claimed: claimed, prompts_delivered: delivered, prompts_undelivered: undelivered, surveys_due: due, surveys_answered: answered, surveys_late: late, plates_logged: plates, consumption_reports: reports, app_opens: opens, push_status: p.push_status });
  }
  for (let i = 24; i < 30; i++) roster.push({ row_id: `r${i}`, email: `${FIRST[i].toLowerCase()}.new@example.edu`, full_name: `${FIRST[i]} New`, grp: i % 2 ? 'L' : 'S', enrolled: false, participant_code: null, participant_status: null, added_at: iso(addDays(now, -9)), claimed_at: null });
  for (let k = 0; k < extraPlateRows; k++) plate.push({ row_id: `big:${k}`, participant_code: `P-${String(1 + (k % 24)).padStart(3, '0')}`, grp: k % 2 ? 'L' : 'S', meal_date: day(addDays(now, -(k % 20))), meal_type: k % 2 ? 'lunch' : 'dinner', dining_hall: 'Sherman', item_position: k % 5, item_name: FOODS[k % FOODS.length], servings: 1, consumed: (k % 5) / 4, calories: 100 + (k % 300), protein: k % 30, carbs: k % 60, fat: k % 20, deleted_at: null });
  const audit = [
    { id: 3, at: iso(addDays(now, -1)), email: 'researcher@example.edu', user_id: '00000000-0000-0000-0000-000000000001', action: 'export', detail: '{"sheet":"meals","format":"csv","rows":340,"filtered":false}' },
    { id: 2, at: iso(addDays(now, -1)), email: 'researcher@example.edu', user_id: '00000000-0000-0000-0000-000000000001', action: 'view_identities', detail: '{"sheet":"participants"}' },
    { id: 1, at: iso(addDays(now, -1)), email: 'researcher@example.edu', user_id: '00000000-0000-0000-0000-000000000001', action: 'sign_in', detail: '{}' },
  ];
  return { grid_participants: participants, grid_roster: roster, grid_responses: responses, grid_meals: meals, grid_plate_items: plate, grid_events: events, grid_snapshots: snaps, grid_prompts: prompts, grid_activity: activity, audit_log: audit };
}

export function makeStub(mode = 'researcher') {
  const extra = Number(new URLSearchParams(window.location.search).get('rows')) || 0;
  const tables = build(extra);
  const owner = mode === 'owner';
  const state = {
    session: mode === 'signedout' ? null : { user: { id: '00000000-0000-0000-0000-000000000001', email: mode === 'student' ? 'student@example.edu' : 'researcher@example.edu' } },
    aal: mode === 'researcher' || owner ? 'aal2' : 'aal1',
    factors: mode === 'enroll' ? [] : [{ id: 'factor-1', status: 'verified', factor_type: 'totp' }],
  };
  const listeners = new Set();
  const subs = new Set();
  const emitAuth = (event) => listeners.forEach((cb) => cb(event, state.session));
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  const who = () => ({
    is_researcher: mode !== 'student', role: mode === 'student' ? null : owner ? 'owner' : 'researcher', aal: state.aal,
    email: mode === 'student' ? null : state.session?.user.email,
  });

  window.__stubEmit = (table) => subs.forEach((s) => s.filters.filter((f) => f.table === table).forEach((f) => f.cb({})));
  window.__stubAddMeal = () => {
    const n = tables.grid_meals.length + 1; const date = day(new Date());
    tables.grid_meals.push({ row_id: `new-${n}`, participant_code: 'P-001', grp: 'S', meal_date: date, meal_type: 'dinner', dining_hall: 'Sherman', confirmed_at: iso(new Date()), item_count: 3, consumption_reported_at: null, deleted_at: null });
    for (let k = 0; k < 3; k++) tables.grid_plate_items.push({ row_id: `new-${n}:${k}`, participant_code: 'P-001', grp: 'S', meal_date: date, meal_type: 'dinner', dining_hall: 'Sherman', item_position: k, item_name: FOODS[k], servings: 1, consumed: null, calories: 200, protein: 10, carbs: 30, fat: 5, deleted_at: null });
    tables.grid_events.push({ row_id: `ev-${n}`, participant_code: 'P-001', grp: 'S', at: iso(new Date()), kind: 'app_open', detail: '{}' });
    ['meals', 'events'].forEach(window.__stubEmit);
  };

  const query = (source) => {
    const q = { orders: [], lim: null };
    q.select = () => q;
    q.order = (col, opts) => { q.orders.push([col, opts?.ascending !== false]); return q; };
    q.limit = (n) => { q.lim = n; return q; };
    const rowsNow = () => {
      if (source === 'studies') return [{ name: 'Fall 2026 study', cap: 40, window_days: 21, survey_intro: null }];
      const data = [...(tables[source] ?? [])];
      data.sort((a, b) => { for (const [col, asc] of q.orders) { const x = a[col], y = b[col]; if (x === y) continue; const c = x === null || x === undefined ? -1 : y === null || y === undefined ? 1 : x < y ? -1 : 1; return asc ? c : -c; } return 0; });
      return data;
    };
    q.range = async (from, to) => { await sleep(40); return { data: rowsNow().slice(from, to + 1), error: null }; };
    q.then = (res, rej) => sleep(20).then(() => ({ data: rowsNow().slice(0, q.lim ?? undefined), error: null })).then(res, rej);
    return q;
  };

  return {
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: (cb) => { listeners.add(cb); return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }; },
      signInWithPassword: async () => { state.session = { user: { id: '00000000-0000-0000-0000-000000000001', email: 'researcher@example.edu' } }; emitAuth('SIGNED_IN'); return { error: null }; },
      signOut: async () => { state.session = null; state.aal = mode === 'nomfa' || mode === 'enroll' ? 'aal1' : state.aal; emitAuth('SIGNED_OUT'); return { error: null }; },
      mfa: {
        listFactors: async () => ({ data: { totp: state.factors, all: state.factors }, error: null }),
        unenroll: async () => ({ error: null }),
        enroll: async () => ({ data: { id: 'factor-new', totp: { qr_code: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="white"/><rect x="12" y="12" width="48" height="48"/><rect x="120" y="12" width="48" height="48"/><rect x="12" y="120" width="48" height="48"/><rect x="84" y="84" width="20" height="20"/></svg>', secret: 'JBSWY3DPEHPK3PXP' } }, error: null }),
        challengeAndVerify: async ({ code }) => {
          await sleep(100);
          if (String(code) !== '123456') return { error: { message: 'Invalid TOTP code' } };
          state.aal = 'aal2'; state.factors = [{ id: 'factor-1', status: 'verified', factor_type: 'totp' }]; emitAuth('MFA_CHALLENGE_VERIFIED'); return { error: null };
        },
      },
    },
    rpc: async (name, args) => {
      await sleep(30);
      if (name === 'research_whoami') return { data: [who()], error: null };
      if (name === 'research_log_action') {
        if (state.aal !== 'aal2' || mode === 'student') return { data: false, error: null };
        tables.audit_log.unshift({ id: tables.audit_log.length + 1, at: iso(new Date()), email: state.session.user.email, user_id: state.session.user.id, action: args.p_action, detail: JSON.stringify(args.p_detail) });
        window.__stubAudit = tables.audit_log;
        return { data: true, error: null };
      }
      return { data: null, error: { message: `stub: unknown function ${name}` } };
    },
    schema: () => ({ from: (source) => query(source) }),
    channel: () => {
      const ch = { filters: [] };
      ch.on = (_type, filter, cb) => { ch.filters.push({ table: filter.table, cb }); return ch; };
      ch.subscribe = (cb) => { subs.add(ch); setTimeout(() => cb?.('SUBSCRIBED'), 50); return ch; };
      return ch;
    },
    removeChannel: (ch) => { subs.delete(ch); },
  };
}
