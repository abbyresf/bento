// The buddy list for the home-screen widget.
//
// Route: GET /api/duo-widget      header Authorization: Bearer <widget token>
//
// The widget cannot use the app's sign-in, so it carries a widget token made by
// duo_widget_token (migration 046): 64 hex characters that can do one thing, read
// this list. Only the token's SHA-256 hash is stored. This route hashes what it is
// given, asks the database for the buddies who are at a hall right now and returns
// names, halls, times and each buddy's Bento outfit and color. Nothing else.
//
// An unknown or revoked token gets 401, and the widget then asks the person to open
// Bento. The answer is never cached, so a tap that has ended does not linger.

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const TOKEN = /^[0-9a-f]{64}$/;

export function buddyJson(rows) {
  return (rows ?? []).map((r) => ({
    name: String(r.display_name ?? '').slice(0, 20),
    hall: String(r.hall ?? '').slice(0, 40),
    meal: r.meal ?? '',
    at: new Date(r.here_at).toISOString(),
    until: new Date(r.here_until).toISOString(),
    outfit: r.mascot_outfit ?? null,
    color: r.mascot_color ?? null,
  }));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Supabase not configured' });

  const token = (req.headers.authorization || '').replace(/^Bearer /i, '').trim();
  if (!TOKEN.test(token)) return res.status(401).json({ error: 'invalid_token' });

  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('duo_widget_list', { p_hash: hash });
  if (error) {
    if (/invalid_token/.test(error.message || '')) return res.status(401).json({ error: 'invalid_token' });
    return res.status(500).json({ error: 'failed' });
  }
  return res.status(200).json({ buddies: buddyJson(data), fetchedAt: new Date().toISOString() });
}
