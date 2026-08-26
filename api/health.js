/* eslint-env node */
// Health check for all dining locations — fetches directly from upstream sources
// and logs results to menu_health_log in Supabase.
//
// GET /api/health          → check all locations, return JSON status
// GET /api/health?bust=true → also bust the dining/tufts cache for degraded locations

import { createClient } from '@supabase/supabase-js';

const BRANDEIS_LOCATIONS = [
  { slug: 'the-farm-table-at-sherman-2', name: 'Farm Table at Sherman' },
  { slug: 'lower-usdan',                 name: 'Usdan Kitchen' },
  { slug: 'the-farm-table-at-sherman',   name: 'Kosher Table at Sherman' },
];

const TUFTS_LOCATIONS = [
  { slug: 'carmichael-dining-hall', name: 'Carmichael' },
  { slug: 'dewick-dining',          name: 'Dewick' },
];

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

async function checkBrandeis(slug, name, dateStr) {
  const url = `https://www.brandeishospitality.com/locations/${slug}/?date=${dateStr}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bento/1.0)', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { slug, name, university: 'brandeis', status: 'error', error: `HTTP ${res.status}`, item_count: 0 };
    const html = await res.text();
    const hasTabs = html.includes('id="menu-tabs"');
    const itemCount = (html.match(/class="menu-item-li"/g) || []).length;
    const status = !hasTabs ? 'closed' : itemCount === 0 ? 'degraded' : 'ok';
    return { slug, name, university: 'brandeis', status, item_count: itemCount, has_tabs: hasTabs };
  } catch (err) {
    return { slug, name, university: 'brandeis', status: 'error', error: err.message, item_count: 0 };
  }
}

async function checkTufts(slug, name, dateStr) {
  const [y, m, d] = dateStr.split('-');
  try {
    const responses = await Promise.all(
      MEAL_TYPES.map(meal =>
        fetch(`https://tufts.api.nutrislice.com/menu/api/weeks/school/${slug}/menu-type/${meal}/${y}/${m}/${d}/?format=json`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bento/1.0)', 'Accept': 'application/json' },
          signal: AbortSignal.timeout(12000),
        }).then(r => r.ok ? r.json() : null).catch(() => null)
      )
    );
    // Distinguish "Nutrislice answered, this hall just isn't serving" from
    // "we couldn't reach Nutrislice at all". Without this, a closed hall is
    // indistinguishable from a broken scraper and pages every day it's shut.
    const reachable = responses.some(r => r !== null);
    if (!reachable) {
      return { slug, name, university: 'tufts', status: 'error', error: 'Nutrislice unreachable', item_count: 0 };
    }
    const itemCount = responses.reduce((sum, data) => {
      const day = data?.days?.find(d => d.date === dateStr);
      return sum + (day?.menu_items?.filter(i => i.food?.name).length ?? 0);
    }, 0);
    return { slug, name, university: 'tufts', status: itemCount === 0 ? 'closed' : 'ok', item_count: itemCount };
  } catch (err) {
    return { slug, name, university: 'tufts', status: 'error', error: err.message, item_count: 0 };
  }
}

async function bustCache(admin, result, dateStr) {
  if (!admin || result.status !== 'degraded') return;
  // Delete stale cache entry so the next real request re-fetches fresh
  await admin
    .from('menu_cache')
    .delete()
    .eq('slug', result.slug)
    .eq('date', dateStr)
    .catch(() => {});
}

export default async function handler(req, res) {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const bust = parsedUrl.searchParams.get('bust') === 'true';
  const dateStr = todayET();

  const [brandeisResults, tuftsResults] = await Promise.all([
    Promise.all(BRANDEIS_LOCATIONS.map(l => checkBrandeis(l.slug, l.name, dateStr))),
    Promise.all(TUFTS_LOCATIONS.map(l => checkTufts(l.slug, l.name, dateStr))),
  ]);

  const results = [...brandeisResults, ...tuftsResults];

  // A single dark hall is normal. Every hall at one school going dark on the
  // same day is far more likely to be a broken parser than a closed campus,
  // so escalate that case even though each location looked merely closed.
  for (const university of ['brandeis', 'tufts']) {
    const forUni = results.filter(r => r.university === university);
    if (forUni.length && forUni.every(r => r.status === 'closed')) {
      forUni.forEach(r => {
        r.status = 'degraded';
        r.error = 'All locations at this university returned no items';
      });
    }
  }

  const admin = getSupabaseAdmin();

  if (bust && admin) {
    await Promise.all(results.map(r => bustCache(admin, r, dateStr)));
  }

  const checkedAt = new Date().toISOString();
  if (admin) {
    await admin
      .from('menu_health_log')
      .insert(results.map(r => ({ ...r, date: dateStr, checked_at: checkedAt })))
      .catch(() => {});
  }

  const overallStatus = results.some(r => r.status === 'error' || r.status === 'degraded')
    ? 'degraded'
    : 'ok';

  res.status(overallStatus === 'ok' ? 200 : 500).json({
    status: overallStatus,
    checked_at: checkedAt,
    date: dateStr,
    bust_applied: bust,
    locations: results,
  });
}
