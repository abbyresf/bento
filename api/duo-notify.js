// "I'm here": records the tap and tells the friends.
//
// Route: POST /api/duo-notify   body { hall, meal, friends? }
//
// The caller proves who they are with their Supabase session token. The tap is
// recorded by calling the database function duo_ping_here AS THAT USER, so the
// limits (6 a day), the per-friend switches and the friendship check all run in
// the database, and this route never takes a recipient on trust. Only the ids
// the function returns are notified, and only those who turned on friend alerts.
//
// Wording is fixed ("Maya is at Usdan"), so the sender's display name is the only
// free text a friend ever receives.
//
// A push can fail without the tap failing: the ping is already saved and shows in
// the friend's app the next time it opens. The response says how many were told.

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { apnsConfigFromEnv, sendApns } from './_apns.js';

const MEALS = ['breakfast', 'lunch', 'dinner'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The native app calls this from https://localhost. The token travels in a
// header, not a cookie, so any origin may ask and none gains anything by it.
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function pushText(senderName, hall) {
  const who = clean(senderName) || 'A buddy';
  return `${who} is at ${clean(hall) || 'the dining hall'}`;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceKey) return res.status(500).json({ error: 'Supabase not configured' });

  const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
  if (!token) return res.status(401).json({ error: 'not_signed_in' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Bad JSON' }); }
  }
  const hall = clean(body?.hall);
  const meal = body?.meal;
  const friends = body?.friends ?? null;
  const minutes = body?.minutes ?? null;
  if (!hall || hall.length > 40) return res.status(400).json({ error: 'invalid_hall' });
  if (!MEALS.includes(meal)) return res.status(400).json({ error: 'invalid_meal' });
  // How long the tap lasts. The database clamps it to 15 to 120 as well.
  if (minutes !== null && !(Number.isInteger(minutes) && minutes >= 1 && minutes <= 1000)) {
    return res.status(400).json({ error: 'Bad duration' });
  }
  if (friends !== null && !(Array.isArray(friends) && friends.length <= 20 && friends.every((f) => UUID.test(f)))) {
    return res.status(400).json({ error: 'Bad friends list' });
  }

  // As the caller. A bad or expired token fails here and nothing is recorded.
  const asUser = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: who, error: whoErr } = await asUser.auth.getUser(token);
  if (whoErr || !who?.user) return res.status(401).json({ error: 'not_signed_in' });

  const { data: reached, error: pingErr } = await asUser.rpc('duo_ping_here', {
    p_hall: hall, p_meal: meal, p_friends: friends, p_minutes: minutes,
  });
  if (pingErr) {
    // The function raises short codes (ping_limit, invalid_hall, ...). Anything
    // else is reported plainly and not echoed back.
    const known = /ping_limit|invalid_hall|invalid_meal|not_signed_in/.exec(pingErr.message || '');
    return res.status(known ? 400 : 500).json({ error: known ? known[0] : 'failed' });
  }
  const recipients = (reached ?? []).map((r) => r.recipient);
  if (recipients.length === 0) return res.status(200).json({ reached: 0, notified: 0 });

  // From here on the tap is saved. A problem telling people is not the sender's.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  try {
    const [{ data: sender }, { data: willing }] = await Promise.all([
      admin.from('profiles').select('display_name').eq('id', who.user.id).maybeSingle(),
      admin.from('profiles').select('id').in('id', recipients).eq('push_social_enabled', true),
    ]);
    const ids = (willing ?? []).map((p) => p.id);
    if (ids.length === 0) return res.status(200).json({ reached: recipients.length, notified: 0 });

    const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', ids);
    if (!subs?.length) return res.status(200).json({ reached: recipients.length, notified: 0 });

    const title = pushText(sender?.display_name, hall);
    const tag = `bento-here-${who.user.id}`;
    let notified = 0;

    const nativeSubs = subs.filter((s) => s.apns_token);
    const webSubs = subs.filter((s) => !s.apns_token);

    const apns = nativeSubs.length ? apnsConfigFromEnv() : null;
    if (apns) {
      const { results } = await sendApns({
        tokens: nativeSubs.map((s) => s.apns_token), title, collapseId: tag, config: apns,
      });
      await Promise.all(nativeSubs.map(async (sub) => {
        const r = results.find((x) => x.token === sub.apns_token);
        if (r?.ok) {
          notified++;
          await admin.from('push_subscriptions')
            .update({ last_sent_at: new Date().toISOString(), failure_count: 0 }).eq('id', sub.id);
        } else if (r?.prune) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          await admin.from('push_subscriptions')
            .update({ failure_count: (sub.failure_count ?? 0) + 1 }).eq('id', sub.id);
        }
      }));
    }

    const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (webSubs.length && publicKey && privateKey) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@bentodining.com', publicKey, privateKey);
      await Promise.all(webSubs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title, body: '', tag, url: '/app' }),
          );
          notified++;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }));
    }

    return res.status(200).json({ reached: recipients.length, notified });
  } catch (err) {
    console.error('duo-notify: push failed after the ping was saved:', err?.message);
    return res.status(200).json({ reached: recipients.length, notified: 0 });
  }
}
