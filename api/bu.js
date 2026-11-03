// Vercel serverless function: Boston University dining menus.
//
// Route: /api/bu?slug=warren&date=YYYY-MM-DD
// Source: https://www.bu.edu/dining/location/<slug>/
//
// BU lists a whole week of menus on each hall's page, a few MB of HTML (up to
// 16 MB). So one scrape here fills the cache for every date on the page, and
// students are served parsed JSON from menu_cache, never the page itself. The
// same reasoning as api/dining.js: the hourly warm-menu-cache workflow is what
// pays for the scrape, a student pays for it only on a cold miss.
//
// BU asks crawlers for a 15 second gap between requests (robots.txt). A scrape
// is one request per hall, and the warm workflow waits 15 seconds between halls.
// BU Dining agreed to Bento showing its menu (Nov 2026).

import { createClient } from '@supabase/supabase-js';
import { parseBuMenuPage, buListedDates } from '../src/services/buParse.js';

const CACHE_FRESH_SECONDS = 6 * 3600;
const CACHE_STALE_SECONDS = 36 * 3600;
const ALLOWED_SLUGS = new Set(['warren', 'marciano', 'west', 'granby']);
const UNIVERSITY = 'bu';

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function pruneOldCache(admin) {
  const cutoff = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  try {
    await admin.from('menu_cache').delete().eq('university', UNIVERSITY).lt('date', cutoff)
      .abortSignal(AbortSignal.timeout(5000));
  } catch { /* housekeeping, never fails a menu request */ }
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const slug = url.searchParams.get('slug');
  const dateParam = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const bust = url.searchParams.get('bust') === 'true';

  if (!slug || !ALLOWED_SLUGS.has(slug)) return res.status(400).json({ error: 'Unknown dining location' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return res.status(400).json({ error: 'Bad date' });

  const admin = getSupabaseAdmin();

  let cached = null;
  if (admin && !bust) {
    try {
      const { data } = await admin
        .from('menu_cache')
        .select('html_content, fetched_at')
        .eq('university', UNIVERSITY).eq('slug', slug).eq('date', dateParam)
        .abortSignal(AbortSignal.timeout(3000))
        .single();
      cached = data;
    } catch { /* database unreachable or slow: scrape instead */ }
  }

  const cachedAge = cached ? (Date.now() - new Date(cached.fetched_at).getTime()) / 1000 : null;
  const cachedIsParsed = typeof cached?.html_content === 'string' && cached.html_content.trimStart().startsWith('{');

  function send(payload, state) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('X-Cache', state);
    return res.status(200).send(payload);
  }

  if (cachedIsParsed && cachedAge < CACHE_FRESH_SECONDS) return send(cached.html_content, 'HIT');
  if (cachedIsParsed && cachedAge < CACHE_STALE_SECONDS) return send(cached.html_content, 'STALE');

  try {
    const upstream = await fetch(`https://www.bu.edu/dining/location/${slug}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Bento/1.0; +https://www.bentodining.com)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!upstream.ok) throw new Error(`BU answered ${upstream.status}`);
    const html = await upstream.text();

    // Parse every date the page lists, so the whole week is cached from one scrape.
    const dates = [...new Set(buListedDates(html))];
    if (!dates.includes(dateParam)) dates.push(dateParam);
    const rows = [];
    let requested = null;
    try {
      for (const d of dates) {
        const payload = JSON.stringify(parseBuMenuPage(html, d));
        if (d === dateParam) requested = payload;
        rows.push({ university: UNIVERSITY, slug, date: d, html_content: payload, fetched_at: new Date().toISOString() });
      }
    } catch (err) {
      // A parse failure is never cached, or one bad scrape would poison the menu until it expired.
      console.error('bu menu parse failed:', err?.message);
      if (cachedIsParsed) return send(cached.html_content, 'STALE-PARSE-FAIL');
      return res.status(502).json({ error: 'Could not read the dining menu.' });
    }

    if (admin) {
      // Awaited on purpose: a serverless function is frozen once it responds.
      const { error } = await admin.from('menu_cache').upsert(rows, { onConflict: 'university,slug,date' });
      if (error) console.error('menu_cache write failed:', error.message);
      await pruneOldCache(admin);
    }
    return send(requested, 'MISS');
  } catch (err) {
    if (cachedIsParsed) return send(cached.html_content, 'STALE-FALLBACK');
    return res.status(502).json({ error: 'Failed to fetch dining data', detail: err.message });
  }
}
