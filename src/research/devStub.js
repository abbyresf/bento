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
  const participants = [], roster = [], wide = [], responses = [], meals = [], plate = [], events = [], snaps = [], prompts = [], activity = [];
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
    roster.push({ row_id: `r${i}`, email, full_name: p.full_name, enrolled: true, participant_code: code, participant_status: status, added_at: iso(addDays(enrolled, -3)), claimed_at: iso(enrolled) });
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
        const lastMeal = ['Little or None', '1/4 plate', '1/2 plate', '3/4 plate'][Math.floor(r() * 4)];
        wide.push({ row_id: `w${i}-${d}`, participant_code: code, grp, for_date: date, late: isLate, submitted_at: `${date}T00:10:00Z`,
          answers: { 'q-where': qa[0][2], [grp === 'S' ? 'q-snack' : 'q-loop']: grp === 'S' ? true : Number(qa[1][2]), 'q-goals': Number(qa[2][2]), 'q-left': lastMeal } });
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
  const study = { id: 'study-1', name: 'Fall 2026 study', cap: 40, is_open: true, window_days: 21, starts_at: null, ends_at: null, survey_intro: 'This is a 1-minute survey about your meal experiences today at Usdan and Sherman all-you-care-to-eat (AYCTE) dining halls. Please answer honestly and accurately, as best you can.', groups: ['S', 'L'], timezone: 'America/New_York', created_at: iso(addDays(now, -20)) };
  const sch = (id, grp, kind, time, title, body, late) => ({ id, study_id: 'study-1', grp, kind, send_time: time, days: [1, 2, 3, 4, 5, 6, 7], late_minutes: late, title, body, is_active: true, created_at: iso(addDays(now, -20)) });
  const schedules = [
    sch('sch-s', 'S', 'reminder', '10:30:00', 'Snack time', 'Lunch opens at 11. Eat your snack now.', 30),
    sch('sch-l', 'L', 'reminder', '10:30:00', 'Loop, plan, then plate', 'Walk the hall once and see what is offered. Decide what you want. Then fill your plate.', 30),
    sch('sch-q', null, 'survey', '20:00:00', "Today's questions", '', 180),
  ];
  const Q = (id, text, format, options, grps, position, show_if = null, column_key = null, codes = null) => ({ id, study_id: 'study-1', text, format, options, grps, position, is_active: true, replaces: null, show_if, column_key, codes, created_at: iso(addDays(now, -20)) });
  const questions = [
    Q('q-where', 'Did you eat lunch in Usdan or Sherman all-you-care-to-eat (AYCTE) dining hall today?', 'multiple_choice', ['Yes - in Usdan', 'Yes - in Sherman', 'No'], [], 10, null, 'lunchYN', [1, 2, 0]),
    Q('q-loop', 'When having lunch at Usdan/Sherman, did you use the "loop and plan" strategy before getting food?', 'rating', ['Not at all', 'Completely'], ['L'], 20, null, 'lunch_loop'),
    Q('q-snack', 'Did you eat the snack given to you before lunch today?', 'yes_no', [], ['S'], 20, null, 'lunch_snack'),
    Q('q-how', 'How long before lunch did you eat the snack?', 'multiple_choice', ['0-20 min before lunch', '21-60 min before lunch', 'More than 1 hour before lunch'], ['S'], 21, { question: 'q-snack', any_of: [true] }, 'lunch_snack_time'),
    Q('q-goals', 'To what extent were your lunch choices today consistent with your eating goals?', 'rating', ['Not at all', 'Completely'], [], 30, null, 'lunch_goals'),
    Q('q-left', 'How much food was left at the end of your meal? Imagine you put all your leftover food on a single plate (think of the most common size plate), estimate about how much of the plate it would cover.', 'multiple_choice', ['Little or None', '1/4 plate', '1/2 plate', '3/4 plate', '1 plate', '1+ plate'], [], 40, null, 'lunch_waste'),
  ];
  const usage = [{ question_id: 'q-where', answers: 150 }, { question_id: 'q-loop', answers: 74 }, { question_id: 'q-snack', answers: 76 }, { question_id: 'q-how', answers: 51 }, { question_id: 'q-goals', answers: 150 }, { question_id: 'q-left', answers: 150 }];
  return { studies: [study], reminder_schedules: schedules, questions, question_usage: usage, grid_participants: participants, grid_roster: roster, grid_survey_wide: wide, grid_responses: responses, grid_meals: meals, grid_plate_items: plate, grid_events: events, grid_snapshots: snaps, grid_prompts: prompts, grid_activity: activity, audit_log: audit };
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

  const bad = (message) => ({ data: null, error: { message } });
  const audit = (what, detail) => {
    tables.audit_log.unshift({ id: tables.audit_log.length + 1, at: iso(new Date()), email: state.session.user.email, user_id: state.session.user.id, action: 'setup_change', detail: JSON.stringify({ what, ...detail }) });
  };
  /* Stand-ins for the setup functions, with the same refusals, so the page can be
   * tried. The real checks are in migration 058 and have their own tests. */
  const setupRpc = (name, a) => {
    if (!name.startsWith('research_set') && !name.startsWith('research_save') && !name.startsWith('research_add')) return null;
    if (state.aal !== 'aal2' || mode === 'student') return bad('not_authorised');
    const study = tables.studies[0];
    if (name === 'research_set_study') {
      const diff = {};
      for (const [k, v] of Object.entries(a.p_changes)) {
        if (!['cap', 'is_open', 'window_days', 'starts_at', 'ends_at', 'survey_intro'].includes(k)) return bad(`unknown_setting: ${k}`);
        if (k === 'cap' && v < tables.grid_participants.length) return bad('cap_below_enrolled');
        if (k === 'window_days' && (v < 1 || v > 120)) return bad('bad_value: window_days');
        if (study[k] !== v) { diff[k] = { from: study[k], to: v }; study[k] = v; }
      }
      if (Object.keys(diff).length) audit('study', { study: study.id, changes: diff });
      return { data: diff, error: null };
    }
    if (name === 'research_set_study_code') {
      if (a.p_code.replace(/[^A-Za-z0-9]/g, '').length < 6) return bad('code_too_short');
      if (/maple/i.test(a.p_code)) return bad('code_in_use');
      audit('code', { study: study.id }); return { data: true, error: null };
    }
    if (name === 'research_save_schedule') {
      const row = tables.reminder_schedules.find((x) => x.id === a.p_id);
      if (!row) return bad('unknown_schedule');
      const diff = {};
      for (const [k, v] of Object.entries(a.p_changes)) {
        if (!['send_time', 'days', 'late_minutes', 'title', 'body', 'is_active'].includes(k)) return bad(`unknown_setting: ${k}`);
        const value = k === 'send_time' ? `${v}:00` : v;
        if (JSON.stringify(row[k]) !== JSON.stringify(value)) { diff[k] = { from: row[k], to: value }; row[k] = value; }
      }
      if (Object.keys(diff).length) audit('schedule', { schedule: row.id, changes: diff });
      return { data: diff, error: null };
    }
    if (name === 'research_add_schedule') {
      const row = { id: `sch-${tables.reminder_schedules.length + 1}`, study_id: study.id, grp: a.p_grp, kind: a.p_kind, send_time: `${a.p_time}:00`, days: a.p_days, late_minutes: a.p_late, title: a.p_title, body: a.p_body, is_active: true, created_at: iso(new Date()) };
      tables.reminder_schedules.push(row); audit('schedule_added', { schedule: row.id }); return { data: row.id, error: null };
    }
    if (name === 'research_add_question') {
      if (a.p_show_if && !tables.questions.some((x) => x.id === a.p_show_if.question && x.position < a.p_position)) return bad('show_if_needs_an_earlier_question');
      const old = a.p_replaces ? tables.questions.find((x) => x.id === a.p_replaces) : null;
      const kids = old ? tables.questions.filter((x) => x.is_active && x.show_if?.question === old.id) : [];
      if (kids.some((k) => old.format !== a.p_format || (a.p_format === 'multiple_choice' && (k.show_if.any_of ?? k.show_if.none_of).some((v) => !a.p_options.includes(v))))) return bad('follow_ups_would_break');
      if (kids.some((k) => k.position <= a.p_position)) return bad('show_if_needs_an_earlier_question');
      const row = { id: `q-${tables.questions.length + 1}`, study_id: study.id, text: a.p_text, format: a.p_format, options: a.p_options, grps: a.p_grps, position: a.p_position, is_active: true, replaces: a.p_replaces, show_if: a.p_show_if, created_at: iso(new Date()) };
      tables.questions.push(row);
      let moved = 0;
      const move = (oldId, newId) => { for (const f of tables.questions.filter((x) => x.is_active && x.show_if?.question === oldId)) { const copy = { ...f, id: `q-${tables.questions.length + 1}`, replaces: f.id, show_if: { ...f.show_if, question: newId }, created_at: iso(new Date()) }; f.is_active = false; tables.questions.push(copy); moved += 1; move(f.id, copy.id); } };
      if (old) { old.is_active = false; move(old.id, row.id); }
      audit(a.p_replaces ? 'question_replaced' : 'question_added', { question: row.id, follow_ups_moved: moved }); return { data: row.id, error: null };
    }
    if (name === 'research_tag_question') {
      const row = tables.questions.find((x) => x.id === a.p_id);
      if (!row) return bad('unknown_question');
      if (a.p_key && tables.questions.some((x) => x.id !== row.id && x.is_active && x.column_key?.toLowerCase() === a.p_key.toLowerCase())) return bad('column_name_in_use');
      row.column_key = a.p_key; row.codes = a.p_codes;
      audit('question_columns', { question: row.id }); return { data: true, error: null };
    }
    if (name === 'research_set_question') {
      const row = tables.questions.find((x) => x.id === a.p_id);
      if (!row) return bad('unknown_question');
      if (a.p_active === true && row.show_if && !tables.questions.some((x) => x.id === row.show_if.question && x.is_active)) return bad('parent_is_retired');
      if (a.p_active === false) { const down = (id) => tables.questions.filter((x) => x.is_active && x.show_if?.question === id).forEach((x) => { x.is_active = false; down(x.id); }); down(row.id); }
      if (a.p_active !== null) row.is_active = a.p_active;
      if (a.p_position !== null) row.position = a.p_position;
      audit('question', { question: row.id }); return { data: true, error: null };
    }
    return null;
  };

  const query = (source) => {
    const q = { orders: [], lim: null };
    q.select = () => q;
    q.order = (col, opts) => { q.orders.push([col, opts?.ascending !== false]); return q; };
    q.limit = (n) => { q.lim = n; return q; };
    q.eqs = [];
    q.eq = (col, val) => { q.eqs.push([col, val]); return q; };
    const rowsNow = () => {
      const data = (tables[source] ?? []).filter((row) => q.eqs.every(([col, val]) => row[col] === val));
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
      const setupOut = setupRpc(name, args);
      if (setupOut) return setupOut;
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
