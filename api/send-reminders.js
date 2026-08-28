/* eslint-env node */
// Sends a meal reminder.
//
// Route: /api/send-reminders?meal=lunch|dinner
//
// Vercel's Hobby plan allows a cron to run only once per day, so the second
// send is driven by an external scheduler hitting the same route with
// ?meal=dinner. Both paths are protected by CRON_SECRET.
//
// The content is the point. "Don't forget to log your meal" is a chore; naming
// what is actually being served is a reason to open the app. So the reminder
// quotes the student's own recommended plate for today.

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { reminderMessage } from './reminderMessages.js';

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export default async function handler(req, res) {
  // This endpoint pushes to every opted-in student, so it must not be callable
  // by anyone who knows the URL. Vercel's scheduler sends CRON_SECRET as a
  // bearer token; any other caller has to present the same value.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = (req.headers.authorization || '').replace(/^Bearer /, '')
      || new URL(req.url, 'http://localhost').searchParams.get('key');
    if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  }

  // Which meal this run is for. Defaults to lunch so an unqualified call
  // behaves as before.
  const meal = new URL(req.url, 'http://localhost').searchParams.get('meal') === 'dinner'
    ? 'dinner' : 'lunch';

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

  // One message for everyone, rotating by day. Nothing is fetched: the copy
  // makes no claim about what is being served, so there is nothing to look up.
  const line = reminderMessage(meal, todayET());

  let sent = 0, pruned = 0, failed = 0;

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        // The message goes in the title. iOS appends its own "from Bento"
        // attribution to every web push from an installed app, sourced from the
        // manifest name, and there is no payload field that suppresses it.
        // Putting the name in the title as well only prints it twice, so the
        // title carries the message and iOS supplies the attribution.
        JSON.stringify({ title: line, body: '', tag: `bento-${meal}`, url: '/app' })
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

  res.status(200).json({ meal, line, sent, pruned, failed, recipients: subs.length });
}
