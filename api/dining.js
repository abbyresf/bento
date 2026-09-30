/* eslint-env node */
// Vercel serverless function — proxies requests to brandeishospitality.com
// Checks a shared Supabase menu_cache table before hitting Brandeis so the
// upstream only gets scraped once per (slug, date) window.
//
// Route: /api/dining/locations/:slug/?date=YYYY-MM-DD
// Forwards to: https://www.brandeishospitality.com/locations/:slug/?date=YYYY-MM-DD
//
// Returns PARSED JSON, not the upstream HTML.
//
// It used to pass the page through untouched, so every student downloaded
// 17.9 MB of dining-hall HTML per app open across the three halls and ran
// DOMParser over all of it on the main thread. On a desktop that is invisible.
// On a phone it is seconds of blocking work and well over 100 MB of DOM, and an
// iOS PWA — a standalone webview with tighter memory limits than a Safari tab —
// gets evicted for less. It presented as "Fetching today's menu" hanging
// forever, which read as the servers being down while they answered in under a
// second.
//
// Parsing here sends about 294 KB instead of 17.9 MB, roughly sixty times less,
// and the phone does no parsing at all. The same reduction applies to
// menu_cache, which stores the parsed result rather than multi-megabyte HTML —
// that table is what filled the free-tier disk and took the database down.
//
// The parser is the module the browser used to run, unchanged, so the output is
// identical. Verified by hashing both sides' output over the same bytes:
// 1c805381318c47a5 / 7f7ab7be9a5fa41b / 255a2fb33dea954f matched exactly.

import { createClient } from '@supabase/supabase-js';
import { parse } from 'node-html-parser';
import { parseBrandeisDoc } from '../src/services/brandeisParse.js';

// How long a cached copy counts as fresh, and how long it stays servable.
//
// This was 30 minutes, which meant the first student to open each hall every
// half hour triggered a fresh scrape of 7-8 MB of HTML and waited out the whole
// round trip. Measured cold, that round trip runs 10-15 seconds, so the app
// announced "Couldn't reach dining servers" twice an hour against a source that
// was working perfectly.
//
// A dining hall menu for a given date is published ahead of time and barely
// changes. Six hours is a fair reading of fresh. Past that, a stale copy is
// still served rather than making a student wait, up to a hard limit, because
// yesterday's lunch listing beats a spinner and beats an error. The hourly
// warm-menu-cache workflow calls with ?bust=true and is what actually refreshes
// the row, so a student never pays for a scrape at all.
const CACHE_FRESH_SECONDS = 6 * 3600;   // serve without question
const CACHE_STALE_SECONDS = 36 * 3600;  // serve, but re-scrape once past this

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

  const bust = parsedUrl.searchParams.get('bust') === 'true';

  // Check shared DB cache before hitting Brandeis.
  //
  // Bounded and swallowed on purpose. This read used to be unguarded, so when
  // Postgres stopped answering the whole request hung until the function timed
  // out and students got no menu at all, even though Brandeis was up the whole
  // time. The cache is an optimisation. Losing it should cost a scrape, not the
  // feature.
  let cached = null;
  if (admin && slug && !bust) {
    try {
      const { data } = await admin
        .from('menu_cache')
        .select('html_content, fetched_at')
        .eq('university', 'brandeis')
        .eq('slug', slug)
        .eq('date', dateParam)
        .abortSignal(AbortSignal.timeout(3000))
        .single();
      cached = data;
    } catch { /* database unreachable or slow: fall through and scrape */ }
  }

  const cachedAge = cached
    ? (Date.now() - new Date(cached.fetched_at).getTime()) / 1000
    : null;

  function sendCached(state) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('X-Cache', state);
    res.setHeader('X-Cache-Age', String(Math.round(cachedAge)));
    return res.status(200).send(cached.html_content);
  }

  // Rows written before this endpoint started parsing hold raw HTML. Serving
  // one as JSON would be a lie, so treat it as a miss and let the scrape below
  // replace it. Self-healing: each stale row is rewritten the first time it is
  // asked for, and no migration is needed.
  const cachedIsParsed = typeof cached?.html_content === 'string'
    && cached.html_content.trimStart().startsWith('{');

  if (cachedIsParsed && cachedAge < CACHE_FRESH_SECONDS) return sendCached('HIT');
  if (cachedIsParsed && cachedAge < CACHE_STALE_SECONDS) return sendCached('STALE');

  // Cache miss — fetch from Brandeis
  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Bento/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      // 18s, not 10s. A cold scrape of the Sherman page has been measured at
      // over 12 seconds end to end, so a 10 second abort was giving up on
      // requests that were about to succeed and turning them into a 502.
      signal: AbortSignal.timeout(18000),
    });

    const html = await upstream.text();

    // Parse here so neither the cache nor the client ever holds the raw page.
    let payload;
    try {
      payload = JSON.stringify(parseBrandeisDoc(parse(html)));
    } catch (err) {
      // A parse failure must not be cached, or one bad scrape poisons the menu
      // for everyone until it expires. Serve any stale copy instead.
      console.error('menu parse failed:', err?.message);
      if (cachedIsParsed) return sendCached('STALE-PARSE-FAIL');
      return res.status(502).json({ error: 'Could not read the dining menu.' });
    }

    if (admin && slug && upstream.ok) {
      // Awaited deliberately. A serverless function is frozen the moment it
      // responds, so a fire-and-forget write is killed before it reaches the
      // database — which is why this cache had never stored a single row. The
      // cost is one write on a miss; the saving is skipping the upstream
      // scrape entirely on every subsequent request.
      const { error: cacheError } = await admin
        .from('menu_cache')
        .upsert(
          { university: 'brandeis', slug, date: dateParam, html_content: payload, fetched_at: new Date().toISOString() },
          { onConflict: 'university,slug,date' }
        );
      if (cacheError) console.error('menu_cache write failed:', cacheError.message);

      await pruneOldCache(admin, 'brandeis');
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('X-Cache', 'MISS');
    res.status(200).send(payload);
  } catch (err) {
    // Brandeis is unreachable or too slow. If any cached copy exists, serve it
    // however old it is: a student looking at a day-old menu is in a far better
    // position than one looking at an error, and this endpoint returning 502 is
    // what the app reports as "Couldn't reach dining servers".
    if (cachedIsParsed) return sendCached('STALE-FALLBACK');
    res.status(502).json({ error: 'Failed to fetch dining data', detail: err.message });
  }
}
