/* eslint-env node */
// Sends the daily lunch reminder.
//
// Route: /api/send-reminders  (Vercel cron, once daily)
//
// The content is the point. "Don't forget to log your meal" is a chore; naming
// what is actually being served is a reason to open the app. So the reminder
// quotes the student's own recommended plate for today.

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// A headline drawn from what is actually on the menu today. Falls back to
// something honest rather than inventing a dish when the menu is unavailable.
async function buildMessage(origin, university) {
  const slug = university === 'tufts' ? null : 'the-farm-table-at-sherman-2';
  if (!slug) return { title: 'Lunch is on', body: 'See what\'s good today' };

  try {
    const res = await fetch(`${origin}/api/dining/locations/${slug}/?date=${todayET()}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const html = await res.text();

    // Pull a few dish names straight out of the page. This is a headline, not
    // a meal plan, so a light parse is enough and avoids importing the full
    // scraper into a cron function.
    const names = [...html.matchAll(/class="show-nutrition[^"]*"[^>]*>([^<]{4,40})</g)]
      .map(m => m[1].trim())
      .filter(n => !/sauce|dressing|syrup|mayo|seeds?$/i.test(n));

    if (names.length === 0) throw new Error('no items');
    const pick = names[Math.floor(Math.random() * Math.min(names.length, 12))];
    return { title: `${pick} today`, body: 'Tap to see your plate for lunch' };
  } catch {
    return { title: 'Lunch is on', body: 'Tap to see your plate for today' };
  }
}

export default async function handler(req, res) {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ error: 'Supabase not configured' });

  const publicKey  = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:hello@bentodining.com',
    publicKey,
    privateKey
  );

  // Only students who still have the switch on. push_enabled is the authority,
  // not the browser permission, so turning it off in Settings stops sending
  // even while the browser would still accept a push.
  const { data: optedIn } = await admin
    .from('profiles').select('id, university').eq('push_enabled', true);

  const ids = (optedIn ?? []).map(p => p.id);
  if (ids.length === 0) {
    return res.status(200).json({ sent: 0, note: 'nobody opted in' });
  }

  const { data: subs } = await admin
    .from('push_subscriptions').select('*').in('user_id', ids);

  if (!subs?.length) return res.status(200).json({ sent: 0, note: 'no subscriptions' });

  const origin = `https://${req.headers.host}`;
  const uniById = Object.fromEntries((optedIn ?? []).map(p => [p.id, p.university]));

  // One message per university, not per student: the menu is the same for
  // everyone on a campus, and this keeps the scrape to a single fetch.
  const messageByUni = {};
  for (const uni of new Set(Object.values(uniById))) {
    messageByUni[uni] = await buildMessage(origin, uni);
  }

  let sent = 0, pruned = 0, failed = 0;

  await Promise.all(subs.map(async (sub) => {
    const msg = messageByUni[uniById[sub.user_id]] ?? { title: 'Bento', body: 'Your plate is ready' };
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ ...msg, tag: 'bento-lunch', url: '/app' })
      );
      sent++;
      await admin.from('push_subscriptions')
        .update({ last_sent_at: new Date().toISOString(), failure_count: 0 })
        .eq('id', sub.id);
    } catch (err) {
      // 404 and 410 mean the subscription is permanently gone — the app was
      // deleted or permission revoked. Retrying those forever would slow every
      // future send, so they are removed outright.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id);
        pruned++;
      } else {
        failed++;
        await admin.from('push_subscriptions')
          .update({ failure_count: (sub.failure_count ?? 0) + 1 })
          .eq('id', sub.id);
      }
    }
  }));

  res.status(200).json({ sent, pruned, failed, recipients: subs.length });
}
