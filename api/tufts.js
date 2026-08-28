/* eslint-env node */
// Vercel serverless function — proxies Nutrislice requests for Tufts dining.
// Aggregates breakfast/lunch/dinner for the requested date into a single JSON response.
//
// Route: /api/tufts?slug=carmichael-dining-hall&date=YYYY-MM-DD

import { createClient } from '@supabase/supabase-js';

const CACHE_TTL_SECONDS = 1800; // 30 minutes
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

export default async function handler(req, res) {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const slug = parsedUrl.searchParams.get('slug');
  const dateParam = parsedUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);

  if (!slug || !ALLOWED_SLUGS.has(slug)) {
    return res.status(400).json({ error: 'Unknown dining location' });
  }

  const admin = getSupabaseAdmin();

  const bust = parsedUrl.searchParams.get('bust') === 'true';

  if (admin && !bust) {
    const { data: cached } = await admin
      .from('menu_cache')
      .select('html_content, fetched_at')
      .eq('university', 'tufts')
      .eq('slug', slug)
      .eq('date', dateParam)
      .single();

    if (cached) {
      const ageSeconds = (Date.now() - new Date(cached.fetched_at).getTime()) / 1000;
      if (ageSeconds < CACHE_TTL_SECONDS) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).send(cached.html_content);
      }
    }
  }

  try {
    const weeklyResponses = await Promise.all(
      MEAL_TYPES.map(mealType =>
        fetch(nutrisliceUrl(slug, mealType, dateParam), {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Bento/1.0)',
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
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
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).send(body);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch Tufts dining data', detail: err.message });
  }
}
