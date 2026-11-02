// The server side of the research study's reminders. The file starts with an
// underscore so Vercel does not expose it as a route. The routes are
// research-send.js (the sender) and the two existing senders that call
// withoutActiveParticipants.
//
// Design: RESEARCH_DASHBOARD_SPEC.md, section 4. The database side is migrations
// 054 to 056.

import webpush from 'web-push';
import { sendApns } from './_apns.js';

const MISSING = (err) => err?.code === 'PGRST202' || err?.code === '42883' || /could not find the function/i.test(err?.message ?? '');

// How long Apple keeps trying a study push. A snack reminder 30 minutes before
// lunch is noise 15 minutes later. The survey is good for the evening.
export const EXPIRES_IN = { reminder: 15 * 60, survey: 3 * 60 * 60, final: 6 * 60 * 60 };

/** The VAPID settings for web push (the Android web app), or null. */
export function webConfigFromEnv(env = process.env) {
  const publicKey = env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT || 'mailto:hello@bentodining.com' };
}

/** One web push. Returns { ok } or { ok: false, prune, reason }. Replaceable in tests. */
export async function sendWebPush({ sub, payload, ttl, config }) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: ttl, urgency: 'high', vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey } },
    );
    return { ok: true };
  } catch (err) {
    const gone = err?.statusCode === 404 || err?.statusCode === 410;
    return { ok: false, prune: gone, reason: gone ? 'subscription gone' : `status ${err?.statusCode ?? 'error'}` };
  }
}

/* Students who are in a study right now must get ONLY the study's own pushes, so
 * the three existing senders (meal reminders, the streak nudge and buddy alerts)
 * leave them out. Returns { ids, held, via }: the ids still to be sent to, how many
 * were held back, and how that was decided.
 *
 * Normally the database says (research_active_user_ids). If that call fails for
 * any reason other than the migration not being there yet, the safe fallback is
 * the profile flag set at enrolment, which keeps everyone who has ever been in a
 * study out of regular pushes until the database answers again. That can hold back
 * a student whose study has ended, for a while. It cannot send a regular reminder
 * to someone in the middle of one, which would damage the study. */
export async function withoutActiveParticipants(admin, ids) {
  if (!ids?.length) return { ids: ids ?? [], held: 0, via: 'none' };

  const { data, error } = await admin.rpc('research_active_user_ids', { p_ids: ids });
  if (!error) {
    const held = new Set((data ?? []).map((r) => (typeof r === 'string' ? r : Object.values(r ?? {})[0])));
    return { ids: ids.filter((id) => !held.has(id)), held: held.size, via: 'rpc' };
  }
  // No study set up on this database yet, so nobody can be in one.
  if (MISSING(error)) return { ids, held: 0, via: 'none' };

  console.error('research_active_user_ids failed, falling back to the cohort flag:', error.message);
  const flagged = new Set();
  for (let i = 0; i < ids.length; i += 150) {
    const { data: rows, error: flagErr } = await admin
      .from('profiles').select('id').in('id', ids.slice(i, i + 150)).eq('research_cohort', true);
    if (flagErr) {
      console.error('cohort flag read failed, sending unfiltered:', flagErr.message);
      return { ids, held: 0, via: 'unfiltered' };
    }
    for (const r of rows ?? []) flagged.add(r.id);
  }
  return { ids: ids.filter((id) => !flagged.has(id)), held: flagged.size, via: 'cohort-flag' };
}

/* One run of the study sender: tidy up, claim what is due, push it, report back.
 * `admin` is a Supabase client with the service role. `apns` is the APNs config or
 * null. `send` is sendApns, replaceable so this can be tested without Apple.
 *
 * Returns counts only. Never a token, a user id or a prompt's words. */
export async function runResearchSend({ admin, apns, web = null, send = sendApns, sendWeb = sendWebPush, now = new Date() }) {
  const hk = await admin.rpc('research_housekeeping');
  if (hk.error && MISSING(hk.error)) return { ok: true, claimed: 0, note: 'research not set up on this database' };

  const { data: due, error } = await admin.rpc('research_claim_due_prompts', { p_now: now.toISOString() });
  if (error) {
    if (MISSING(error)) return { ok: true, claimed: 0, note: 'research not set up on this database' };
    return { ok: false, error: 'could not claim prompts', detail: error.message };
  }
  const prompts = due ?? [];
  const summary = { ok: true, claimed: prompts.length, sent: 0, failed: 0, no_device: 0, pruned: 0, housekeeping: hk.data ?? null };
  if (prompts.length === 0) return summary;

  const userIds = [...new Set(prompts.map((p) => p.user_id))];
  const { data: subs } = await admin
    .from('push_subscriptions').select('id, user_id, apns_token, endpoint, p256dh, auth').in('user_id', userIds);
  const tokensOf = new Map();   // user -> native (APNs) rows
  const webOf = new Map();      // user -> browser rows (the Android web app)
  for (const s of subs ?? []) {
    const into = s.apns_token ? tokensOf : s.endpoint ? webOf : null;
    if (!into) continue;
    if (!into.has(s.user_id)) into.set(s.user_id, []);
    into.get(s.user_id).push(s);
  }
  const reachable = (uid) => tokensOf.has(uid) || webOf.has(uid);

  // Everyone with the same words and kind goes in one call to Apple.
  const groups = new Map();
  for (const p of prompts) {
    const key = JSON.stringify([p.kind, p.title, p.body]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const outcome = new Map();   // prompt_id -> { status, error }
  const dead = [];             // push_subscriptions ids Apple says are gone
  let fatal = null;

  for (const members of groups.values()) {
    const { kind, title, body } = members[0];
    const withDevice = members.filter((p) => reachable(p.user_id));
    for (const p of members) if (!reachable(p.user_id)) outcome.set(p.prompt_id, { status: 'no_device' });
    if (withDevice.length === 0) continue;

    // Each prompt collects what happened on each of its devices and is judged once.
    const results = new Map(withDevice.map((p) => [p.prompt_id, []]));   // prompt_id -> [{ ok, reason }]

    // Native devices, in one call to Apple.
    const native = withDevice.filter((p) => tokensOf.has(p.user_id));
    if (native.length > 0) {
      if (!apns || fatal) {
        for (const p of native) results.get(p.prompt_id).push({ ok: false, reason: fatal ?? 'APNs not configured' });
      } else {
        const tokens = native.flatMap((p) => tokensOf.get(p.user_id).map((s) => s.apns_token));
        const out = await send({
          tokens, title, body: body || undefined, data: { research: { kind } },
          expiresIn: EXPIRES_IN[kind] ?? EXPIRES_IN.reminder, collapseId: `bento-study-${kind}`, config: apns,
        });
        if (out.fatal) fatal = `APNs rejected the key: ${out.fatal}`;
        const byToken = new Map((out.results ?? []).map((r) => [r.token, r]));
        for (const p of native) {
          for (const s of tokensOf.get(p.user_id)) {
            const r = byToken.get(s.apns_token);
            if (r?.prune) dead.push(s.id);
            results.get(p.prompt_id).push(r?.ok ? { ok: true } : { ok: false, reason: fatal ?? r?.reason ?? (r ? `status ${r.status}` : 'no result') });
          }
        }
      }
    }

    // Browser devices (the Android web app), one push each.
    for (const p of withDevice.filter((x) => webOf.has(x.user_id))) {
      for (const s of webOf.get(p.user_id)) {
        if (!web) { results.get(p.prompt_id).push({ ok: false, reason: 'web push not configured' }); continue; }
        const r = await sendWeb({
          sub: s, ttl: EXPIRES_IN[kind] ?? EXPIRES_IN.reminder, config: web,
          payload: { title, body: body || '', tag: `bento-study-${kind}`, url: '/app', research: { kind } },
        });
        if (r.prune) dead.push(s.id);
        results.get(p.prompt_id).push(r.ok ? { ok: true } : { ok: false, reason: r.reason ?? 'failed' });
      }
    }

    for (const p of withDevice) {
      const rs = results.get(p.prompt_id);
      outcome.set(p.prompt_id, rs.some((r) => r.ok) ? { status: 'sent' } : { status: 'failed', error: rs.map((r) => r.reason).find(Boolean) ?? 'no result' });
    }
  }

  if (dead.length) {
    await admin.from('push_subscriptions').delete().in('id', dead);
    summary.pruned = dead.length;
  }

  const results = prompts.map((p) => ({ id: p.prompt_id, ...(outcome.get(p.prompt_id) ?? { status: 'failed', error: 'no outcome' }) }));
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1;
  const { error: markErr } = await admin.rpc('research_mark_prompts', { p_results: results });
  if (markErr) {
    // The pushes went out. The claim rows stay as claimed, which only costs the
    // researchers the delivery detail, and nothing will be sent twice.
    console.error('could not record prompt outcomes:', markErr.message);
    summary.recorded = false;
  }
  if (fatal) summary.note = fatal;
  return summary;
}
