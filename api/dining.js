/* eslint-env node */
// Vercel serverless function — proxies requests to brandeishospitality.com
// Checks a shared Supabase menu_cache table before hitting Brandeis so the
// upstream only gets scraped once per (slug, date) window.
//
// Route: /api/dining/locations/:slug/?date=YYYY-MM-DD
// Forwards to: https://www.brandeishospitality.com/locations/:slug/?date=YYYY-MM-DD

import { createClient } from '@supabase/supabase-js';

const CACHE_TTL_SECONDS = 1800; // 30 minutes

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const ALLOWED_SLUGS = new Set([
  'the-farm-table-at-sherman-2',
  'lower-usdan',
  'the-farm-table-at-sherman',
]);

export default async function handler(req, res) {
  const upstreamPath = req.url.replace(/^\/api\/dining/, '');
  const upstreamUrl = `https://www.brandeishospitality.com${upstreamPath}`;

  const admin = getSupabaseAdmin();
  const slugMatch = req.url.match(/\/locations\/([^/?]+)/);
  const slug = slugMatch?.[1];

  if (slug && !ALLOWED_SLUGS.has(slug)) {
    return res.status(400).json({ error: 'Unknown dining location' });
  }
  const parsedUrl = new URL(req.url, 'http://localhost');
  const dateParam = parsedUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);

  // Check shared DB cache before hitting Brandeis
  if (admin && slug) {
    const { data: cached } = await admin
      .from('menu_cache')
      .select('html_content, fetched_at')
      .eq('university', 'brandeis')
      .eq('slug', slug)
      .eq('date', dateParam)
      .single();

    if (cached) {
      const ageSeconds = (Date.now() - new Date(cached.fetched_at).getTime()) / 1000;
      if (ageSeconds < CACHE_TTL_SECONDS) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).send(cached.html_content);
      }
    }
  }

  // Cache miss — fetch from Brandeis
  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Bento/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    const body = await upstream.text();

    // Write to cache in the background so it doesn't delay the response
    if (admin && slug && upstream.ok) {
      admin
        .from('menu_cache')
        .upsert(
          { university: 'brandeis', slug, date: dateParam, html_content: body, fetched_at: new Date().toISOString() },
          { onConflict: 'university,slug,date' }
        )
        .then(() => {})
        .catch(() => {});
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('X-Cache', 'MISS');
    res.status(upstream.status).send(body);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch dining data', detail: err.message });
  }
}
