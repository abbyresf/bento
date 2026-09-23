/* eslint-env node */
// Vercel serverless function — proxies Nutrislice requests for Tufts dining.
// Aggregates breakfast/lunch/dinner for the requested date into a single JSON response.
//
// Route: /api/tufts?slug=carmichael-dining-hall&date=YYYY-MM-DD

import { createClient } from '@supabase/supabase-js';

// See api/dining.js for the reasoning. Same defect, same fix: a 30 minute TTL
// meant students paid for a live upstream fetch twice an hour and saw an error
// whenever it was slow. Fresh for six hours, servable well past that, and
// refreshed by the hourly warm-menu-cache workflow rather than by a student.
const CACHE_FRESH_SECONDS = 6 * 3600;
const CACHE_STALE_SECONDS = 36 * 3600;
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];
const ALLOWED_SLUGS = new Set(['carmichael-dining-hall', 'dewick-dining']);

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function nutrisliceUrl(slug, mealType, dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `https://tufts.api.nutrislice.com/menu/api/weeks/school/${slug}/menu-type/${mealType}/${year}/${month}/${day}/?format=json`;
}

function extractDayItems(weeklyData, dateStr) {
  if (!weeklyData?.days) return [];
  const day = weeklyData.days.find(d => d.date === dateStr);
  if (!day) return [];
  return (day.menu_items ?? [])
    .map(item => item.food)
    .filter(food => food?.name);
}


// Keep the cache to a couple of days. Nothing ever deleted from this table, so
// it grew to 312 MB of dining-hall HTML against a 500 MB free-tier cap at
// 11.5 MB a day. A full disk is a very good way to make Postgres unhealthy.
// Runs on a cache miss only, which is a few dozen times a day, not per request.
async function pruneOldCache(admin, university) {
  const cutoff = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  try {
    await admin
      .from('menu_cache')
      .delete()
      .eq('university', university)
      .lt('date', cutoff)
      .abortSignal(AbortSignal.timeout(5000));
  } catch { /* pruning is housekeeping; never fail a menu request for it */ }
}

export default async function handler(req, res) {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const slug = parsedUrl.searchParams.get('slug');
  const dateParam = parsedUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);

  if (!slug || !ALLOWED_SLUGS.has(slug)) {
    return res.status(400).json({ error: 'Unknown dining location' });
  }

  const admin = getSupabaseAdmin();

  const bust = parsedUrl.searchParams.get('bust') === 'true';

  // Declared out here on purpose: the stale-fallback path in the catch block
  // below needs to reach it.
  let cached = null;

  if (admin && !bust) {
    // Bounded. Same failure dining.js had: an unguarded read against a hung
    // Postgres hangs the whole request until the function times out, so Tufts
    // students got no menu during an outage even though Nutrislice was fine.
    try {
      const { data } = await admin
        .from('menu_cache')
        .select('html_content, fetched_at')
        .eq('university', 'tufts')
        .eq('slug', slug)
        .eq('date', dateParam)
        .abortSignal(AbortSignal.timeout(3000))
        .single();
      cached = data;
    } catch { /* unreachable or slow: fall through and fetch upstream */ }

  }

  const cachedAge = cached
    ? (Date.now() - new Date(cached.fetched_at).getTime()) / 1000
    : null;

  function sendCached(state) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('X-Cache', state);
    res.setHeader('X-Cache-Age', String(Math.round(cachedAge)));
    return res.status(200).send(cached.html_content);
  }

  if (cached && cachedAge < CACHE_FRESH_SECONDS) return sendCached('HIT');
  if (cached && cachedAge < CACHE_STALE_SECONDS) return sendCached('STALE');

  try {
    const weeklyResponses = await Promise.all(
      MEAL_TYPES.map(mealType =>
        fetch(nutrisliceUrl(slug, mealType, dateParam), {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Bento/1.0)',
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(18000),
        })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    );

    const combined = {
      date: dateParam,
      slug,
      meals: {
        breakfast: extractDayItems(weeklyResponses[0], dateParam),
        lunch:     extractDayItems(weeklyResponses[1], dateParam),
        dinner:    extractDayItems(weeklyResponses[2], dateParam),
      },
    };

    const body = JSON.stringify(combined);

    if (admin) {
      // Awaited deliberately. A serverless function is frozen the moment it
      // responds, so a fire-and-forget write is killed before it reaches the
      // database — which is why this cache had never stored a single row. The
      // cost is one write on a miss; the saving is skipping the upstream
      // scrape entirely on every subsequent request.
      const { error: cacheError } = await admin
        .from('menu_cache')
        .upsert(
          { university: 'tufts', slug, date: dateParam, html_content: body, fetched_at: new Date().toISOString() },
          { onConflict: 'university,slug,date' }
        );
      if (cacheError) console.error('menu_cache write failed:', cacheError.message);
      await pruneOldCache(admin, 'tufts');
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).send(body);
  } catch (err) {
    // Nutrislice unreachable or slow. Any cached copy beats an error screen.
    if (cached) return sendCached('STALE-FALLBACK');
    res.status(502).json({ error: 'Failed to fetch Tufts dining data', detail: err.message });
  }
}
