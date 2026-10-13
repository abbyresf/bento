import test from 'node:test';
import assert from 'node:assert/strict';
import { withoutActiveParticipants, runResearchSend, EXPIRES_IN } from '../api/_research.js';

/* A stand-in for the Supabase service client. `rpc` maps a function name to a
 * handler. `subs` are push_subscriptions rows and `profiles` are profile rows. */
function fakeAdmin({ rpc = {}, subs = [], profiles = [], profilesError = null } = {}) {
  const calls = { rpc: [], deleted: [], reads: [] };
  const table = (name) => {
    let ids = null, idCol = 'user_id', flagged = false, op = 'select';
    const q = {
      select: () => q,
      delete: () => { op = 'delete'; return q; },
      in: (col, vals) => { idCol = col; ids = vals; return q; },
      not: () => q,
      eq: (col, v) => { if (col === 'research_cohort') flagged = v; return q; },
      then: (res, rej) => {
        calls.reads.push(name);
        if (op === 'delete') { calls.deleted.push(...ids); return Promise.resolve({ error: null }).then(res, rej); }
        if (name === 'push_subscriptions') {
          return Promise.resolve({ data: subs.filter((s) => ids.includes(s[idCol])) }).then(res, rej);
        }
        if (profilesError) return Promise.resolve({ data: null, error: profilesError }).then(res, rej);
        return Promise.resolve({ data: profiles.filter((p) => ids.includes(p.id) && p.research_cohort === flagged), error: null }).then(res, rej);
      },
    };
    return q;
  };
  return {
    calls,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      const h = rpc[name];
      return h ? h(args) : { data: null, error: null };
    },
    from: table,
  };
}

const MISSING = { code: 'PGRST202', message: 'Could not find the function public.x in the schema cache' };

test('active participants are held back from regular pushes and everyone else is kept', async () => {
  const admin = fakeAdmin({ rpc: { research_active_user_ids: () => ({ data: ['b', 'd'], error: null }) } });
  const r = await withoutActiveParticipants(admin, ['a', 'b', 'c', 'd']);
  assert.deepEqual(r, { ids: ['a', 'c'], held: 2, via: 'rpc' });
});

test('the database may answer with rows or with bare ids', async () => {
  const rows = fakeAdmin({ rpc: { research_active_user_ids: () => ({ data: [{ research_active_user_ids: 'b' }], error: null }) } });
  assert.deepEqual((await withoutActiveParticipants(rows, ['a', 'b'])).ids, ['a']);
});

test('nothing to check means no call', async () => {
  const admin = fakeAdmin();
  assert.deepEqual(await withoutActiveParticipants(admin, []), { ids: [], held: 0, via: 'none' });
  assert.equal(admin.calls.rpc.length, 0);
});

test('a database with no study set up holds nobody back', async () => {
  const admin = fakeAdmin({ rpc: { research_active_user_ids: () => ({ data: null, error: MISSING }) } });
  assert.deepEqual(await withoutActiveParticipants(admin, ['a', 'b']), { ids: ['a', 'b'], held: 0, via: 'none' });
});

test('when the check fails the cohort flag keeps past and present participants out', async () => {
  const admin = fakeAdmin({
    rpc: { research_active_user_ids: () => ({ data: null, error: { code: '57014', message: 'timeout' } }) },
    profiles: [{ id: 'a', research_cohort: false }, { id: 'b', research_cohort: true }, { id: 'c', research_cohort: false }],
  });
  assert.deepEqual(await withoutActiveParticipants(admin, ['a', 'b', 'c']), { ids: ['a', 'c'], held: 1, via: 'cohort-flag' });
});

test('if even the fallback fails it sends rather than silencing every student', async () => {
  const admin = fakeAdmin({
    rpc: { research_active_user_ids: () => ({ data: null, error: { code: '57014', message: 'timeout' } }) },
    profilesError: { code: '42703', message: 'column does not exist' },
  });
  assert.deepEqual(await withoutActiveParticipants(admin, ['a', 'b']), { ids: ['a', 'b'], held: 0, via: 'unfiltered' });
});

// ── The sender ───────────────────────────────────────────────────────────────

const apns = { keyId: 'k', teamId: 't', privateKey: 'p', topic: 'com.bentodining.app' };
const due = (id, user, kind = 'reminder', title = 'Snack time', body = 'Eat your snack now.') =>
  ({ prompt_id: id, user_id: user, kind, title, body, grp: 'S', schedule_id: 's1' });

function sender(plan = {}) {
  const sent = [];
  const fn = async (args) => {
    sent.push(args);
    if (plan.fatal) return { fatal: plan.fatal, results: args.tokens.map((token) => ({ token, ok: false, status: 403, reason: plan.fatal })) };
    return { fatal: null, results: args.tokens.map((token) => (plan.byToken?.[token] ?? { token, ok: true, status: 200 })).map((r, i) => ({ token: args.tokens[i], ...r })) };
  };
  fn.sent = sent;
  return fn;
}

const rpcFor = (rows) => ({
  research_housekeeping: () => ({ data: { closed: 0 }, error: null }),
  research_claim_due_prompts: () => ({ data: rows, error: null }),
  research_mark_prompts: () => ({ data: 0, error: null }),
});
const marked = (admin) => admin.calls.rpc.find((c) => c.name === 'research_mark_prompts')?.args.p_results;

test('nothing due means nothing sent and nothing marked', async () => {
  const admin = fakeAdmin({ rpc: rpcFor([]) });
  const send = sender();
  const out = await runResearchSend({ admin, apns, send });
  assert.equal(out.claimed, 0);
  assert.equal(send.sent.length, 0);
  assert.equal(marked(admin), undefined);
});

test('a database without the study migrations is a quiet success, not a failing cron', async () => {
  const admin = fakeAdmin({ rpc: { research_housekeeping: () => ({ data: null, error: MISSING }) } });
  const out = await runResearchSend({ admin, apns, send: sender() });
  assert.equal(out.ok, true);
  assert.match(out.note, /not set up/);
  const admin2 = fakeAdmin({ rpc: { research_housekeeping: () => ({ data: {}, error: null }), research_claim_due_prompts: () => ({ data: null, error: MISSING }) } });
  assert.equal((await runResearchSend({ admin: admin2, apns, send: sender() })).ok, true);
});

test('a real error claiming prompts fails the run so it shows up in Actions', async () => {
  const admin = fakeAdmin({ rpc: { research_housekeeping: () => ({ data: {}, error: null }), research_claim_due_prompts: () => ({ data: null, error: { code: 'XX000', message: 'boom' } }) } });
  const out = await runResearchSend({ admin, apns, send: sender() });
  assert.equal(out.ok, false);
});

test('students with the same words share one call, and each prompt is marked sent', async () => {
  const admin = fakeAdmin({
    rpc: rpcFor([due('p1', 'u1'), due('p2', 'u2'), due('p3', 'u3', 'reminder', 'Loop, plan, then plate', 'Walk the hall once.')]),
    subs: [{ id: 's1', user_id: 'u1', apns_token: 't1' }, { id: 's2', user_id: 'u2', apns_token: 't2' }, { id: 's3', user_id: 'u3', apns_token: 't3' }],
  });
  const send = sender();
  const out = await runResearchSend({ admin, apns, send });
  assert.equal(send.sent.length, 2, 'two different messages, two calls');
  const snack = send.sent.find((s) => s.title === 'Snack time');
  assert.deepEqual(snack.tokens.sort(), ['t1', 't2']);
  assert.equal(snack.body, 'Eat your snack now.');
  assert.deepEqual(snack.data, { research: { kind: 'reminder' } });
  assert.equal(snack.expiresIn, EXPIRES_IN.reminder);
  assert.equal(snack.collapseId, 'bento-study-reminder');
  assert.deepEqual(marked(admin).map((r) => r.status), ['sent', 'sent', 'sent']);
  assert.equal(out.sent, 3);
});

test('a survey prompt lasts longer than a reminder', async () => {
  const admin = fakeAdmin({ rpc: rpcFor([due('p1', 'u1', 'survey', 'Questions', '')]), subs: [{ id: 's1', user_id: 'u1', apns_token: 't1' }] });
  const send = sender();
  await runResearchSend({ admin, apns, send });
  assert.equal(send.sent[0].expiresIn, EXPIRES_IN.survey);
  assert.ok(EXPIRES_IN.survey > EXPIRES_IN.reminder);
  assert.equal(send.sent[0].body, undefined, 'an empty body is not sent');
  assert.deepEqual(send.sent[0].data, { research: { kind: 'survey' } });
});

test('a student with no device is marked no_device, and one with a bad token is marked failed', async () => {
  const admin = fakeAdmin({
    rpc: rpcFor([due('p1', 'u1'), due('p2', 'u2'), due('p3', 'u3')]),
    subs: [{ id: 's2', user_id: 'u2', apns_token: 'bad' }, { id: 's3', user_id: 'u3', apns_token: 'good' }],
  });
  const out = await runResearchSend({ admin, apns, send: sender({ byToken: { bad: { ok: false, status: 400, reason: 'DeviceTokenNotForTopic' } } }) });
  const m = Object.fromEntries(marked(admin).map((r) => [r.id, r]));
  assert.equal(m.p1.status, 'no_device');
  assert.equal(m.p2.status, 'failed');
  assert.equal(m.p2.error, 'DeviceTokenNotForTopic');
  assert.equal(m.p3.status, 'sent');
  assert.deepEqual([out.sent, out.failed, out.no_device], [1, 1, 1]);
});

test('a student with two devices is sent if either one worked', async () => {
  const admin = fakeAdmin({
    rpc: rpcFor([due('p1', 'u1')]),
    subs: [{ id: 'a', user_id: 'u1', apns_token: 'old' }, { id: 'b', user_id: 'u1', apns_token: 'new' }],
  });
  await runResearchSend({ admin, apns, send: sender({ byToken: { old: { ok: false, status: 410, reason: 'Unregistered', prune: true } } }) });
  assert.equal(marked(admin)[0].status, 'sent');
  assert.deepEqual(admin.calls.deleted, ['a'], 'the dead one is removed');
});

test('a rejected APNs key fails everything once and sends nothing more', async () => {
  const admin = fakeAdmin({
    rpc: rpcFor([due('p1', 'u1'), due('p2', 'u2', 'survey', 'Questions', '')]),
    subs: [{ id: 's1', user_id: 'u1', apns_token: 't1' }, { id: 's2', user_id: 'u2', apns_token: 't2' }],
  });
  const send = sender({ fatal: 'InvalidProviderToken' });
  const out = await runResearchSend({ admin, apns, send });
  assert.equal(send.sent.length, 1, 'stopped after the first rejection');
  assert.deepEqual(marked(admin).map((r) => r.status), ['failed', 'failed']);
  assert.match(out.note, /rejected the key/);
});

test('APNs not configured fails the prompts without crashing', async () => {
  const admin = fakeAdmin({ rpc: rpcFor([due('p1', 'u1')]), subs: [{ id: 's1', user_id: 'u1', apns_token: 't1' }] });
  const out = await runResearchSend({ admin, apns: null, send: sender() });
  assert.equal(marked(admin)[0].status, 'failed');
  assert.equal(marked(admin)[0].error, 'APNs not configured');
  assert.equal(out.failed, 1);
});

test('the summary carries counts and never a token, user id or message', async () => {
  const admin = fakeAdmin({ rpc: rpcFor([due('p1', 'user-secret')]), subs: [{ id: 's1', user_id: 'user-secret', apns_token: 'token-secret' }] });
  const out = await runResearchSend({ admin, apns, send: sender() });
  const text = JSON.stringify(out);
  for (const secret of ['user-secret', 'token-secret', 'Snack time', 'Eat your snack']) assert.ok(!text.includes(secret), secret);
});

test('if recording the outcomes fails the run still succeeds and says so', async () => {
  const admin = fakeAdmin({
    rpc: { ...rpcFor([due('p1', 'u1')]), research_mark_prompts: () => ({ data: null, error: { code: 'XX000', message: 'down' } }) },
    subs: [{ id: 's1', user_id: 'u1', apns_token: 't1' }],
  });
  const out = await runResearchSend({ admin, apns, send: sender() });
  assert.equal(out.ok, true);
  assert.equal(out.recorded, false);
  assert.equal(out.sent, 1);
});

test('the claim is asked for at the time the run says it is', async () => {
  const admin = fakeAdmin({ rpc: rpcFor([]) });
  await runResearchSend({ admin, apns, send: sender(), now: new Date('2026-10-13T14:30:00Z') });
  assert.equal(admin.calls.rpc.find((c) => c.name === 'research_claim_due_prompts').args.p_now, '2026-10-13T14:30:00.000Z');
});
