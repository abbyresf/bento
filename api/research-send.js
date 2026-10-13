// Sends the research study's reminders and end-of-day survey prompts.
//
// Route: /api/research-send   (GET, behind CRON_SECRET)
//
// Safe to call as often as you like: what is due is claimed in the database before
// anything is sent, so a second call in the same minute finds nothing. The schedule
// (who gets what, and when) lives in the database, in research.reminder_schedules.
//
// This only sends the study's own prompts. The ordinary meal reminders, the streak
// nudge and buddy alerts skip students who are in a study (see _research.js).
//
// SCHEDULING. The prompt that matters most is the snack reminder at 10:30, 30
// minutes before lunch opens, and a late one is worthless: a prompt more than its
// late window past due is dropped, not sent. GitHub's cron is the only scheduler
// wired up today and it can run many minutes late. See RESEARCH_DASHBOARD_SPEC.md,
// "Scheduling", for the precise option (pg_cron).

import { createClient } from '@supabase/supabase-js';
import { apnsConfigFromEnv } from './_apns.js';
import { runResearchSend } from './_research.js';

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  // Unlike the meal reminders, this refuses to run with no secret set. It pushes
  // to study participants and must never be callable by anyone who finds the URL.
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET is not set' });
  const provided = (req.headers.authorization || '').replace(/^Bearer /, '')
    || new URL(req.url, 'http://localhost').searchParams.get('key');
  if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });

  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ error: 'Supabase not configured' });

  const out = await runResearchSend({ admin, apns: apnsConfigFromEnv() });
  return res.status(out.ok ? 200 : 500).json(out);
}
