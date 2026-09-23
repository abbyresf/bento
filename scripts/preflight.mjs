// Pre-demo check. Run it before a pitch, or any time the app is reported down.
//
//   node scripts/preflight.mjs
//
// Answers one question: would a student opening Bento right now get a menu?
// Checks only what students actually touch, hits production, writes nothing,
// and needs no credentials.
//
// Exits non-zero if anything would fail, so it can also be wired into CI.

const BASE = process.env.BENTO_BASE ?? 'https://www.bentodining.com';

const HALLS = [
  ['brandeis', 'Usdan',        `/api/dining/locations/lower-usdan/`],
  ['brandeis', 'Sherman Farm', `/api/dining/locations/the-farm-table-at-sherman-2/`],
  ['brandeis', 'Kosher Table', `/api/dining/locations/the-farm-table-at-sherman/`],
  ['tufts',    'Carmichael',   `/api/tufts?slug=carmichael-dining-hall`],
  ['tufts',    'Dewick',       `/api/tufts?slug=dewick-dining`],
];

// The client gives up on a location after 25s. Anything approaching that is a
// failure in waiting, not a pass, so it is called out well before the cliff.
const SLOW_SECONDS = 8;

const localDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
};

let failures = 0;
let warnings = 0;

const pass = m => console.log(`  ok    ${m}`);
const warn = m => { warnings++; console.log(`  WARN  ${m}`); };
const fail = m => { failures++; console.log(`  FAIL  ${m}`); };

async function timed(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Bento-Preflight/1.0' } });
    const body = await res.text();
    return { ok: res.ok, status: res.status, seconds: (Date.now() - t0) / 1000, body, headers: res.headers };
  } catch (err) {
    return { ok: false, status: 0, seconds: (Date.now() - t0) / 1000, error: err.message, headers: new Headers() };
  }
}

console.log(`\nBento preflight  ${BASE}  ${new Date().toISOString()}\n`);

// ── 1. Database ─────────────────────────────────────────────────────────────
console.log('Database');
{
  const r = await timed(`${BASE}/api/health?probe=db`);
  if (r.status === 200) pass(`reachable (${r.seconds.toFixed(1)}s)`);
  else if (r.status === 503) fail('UNREACHABLE. Students cannot log in or confirm a meal.');
  else fail(`unexpected status ${r.status}`);
}

// ── 2. Menus, for the two days the app can show ─────────────────────────────
for (const [label, offset] of [['Today', 0], ['Tomorrow', 1]]) {
  const date = localDate(offset);
  console.log(`\n${label}  ${date}`);

  for (const [uni, name, path] of HALLS) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await timed(`${BASE}${path}${sep}date=${date}`);
    const cache = r.headers.get('x-cache') ?? '-';
    const age = r.headers.get('x-cache-age');
    const note = `${r.seconds.toFixed(1)}s  ${cache}${age ? ` age=${Math.round(age / 60)}m` : ''}`;

    if (!r.ok) {
      fail(`${name} (${uni}) — HTTP ${r.status} ${r.error ?? ''} ${note}`);
      continue;
    }
    // A 200 carrying no menu is the failure that looks like success, so the
    // count comes from the same shape the client reads, not from a keyword
    // guess. Brandeis serves HTML the client parses for li.menu-item-li;
    // /api/tufts serves { date, slug, meals: { breakfast, lunch, dinner } }.
    let items = 0;
    if (uni === 'brandeis') {
      items = (r.body.match(/menu-item-li/g) ?? []).length;
    } else {
      try {
        const meals = JSON.parse(r.body)?.meals ?? {};
        items = Object.values(meals).reduce((n, list) => n + (list?.length ?? 0), 0);
      } catch {
        fail(`${name} (${uni}) — response was not valid JSON. ${note}`);
        continue;
      }
    }

    if (items === 0) fail(`${name} (${uni}) — 200 but ZERO menu items. ${note}`);
    else if (r.seconds > SLOW_SECONDS) warn(`${name} (${uni}) — ${items} items but slow. ${note}`);
    else pass(`${name} (${uni}) — ${items} items. ${note}`);
  }
}

// ── 3. The build students are actually served ───────────────────────────────
console.log('\nShipped build');
{
  const idx = await timed(`${BASE}/`);
  const bundle = idx.body?.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  if (!bundle) fail('could not find the app bundle in index.html');
  else {
    const js = await timed(`${BASE}/${bundle}`);
    const t = js.body?.match(/AbortSignal\.timeout\((\d+e?\d*)\)/)?.[1];
    if (t === '25e3' || t === '25000') pass(`menu fetch timeout is 25s (${bundle})`);
    else fail(`menu fetch timeout is ${t ?? 'unknown'}, expected 25s. An old build is live.`);
  }

  const sw = await timed(`${BASE}/sw.js`);
  if (/maxEntries:8/.test(sw.body ?? '')) pass('service worker caps the menu cache at 8 entries');
  else fail('service worker is missing the menu cache cap. An old build is live.');
}

// ── Verdict ─────────────────────────────────────────────────────────────────
console.log('');
if (failures) {
  console.log(`${failures} FAILURE(S), ${warnings} warning(s). Do not demo on live data.\n`);
  process.exit(1);
}
console.log(warnings
  ? `Clear, with ${warnings} warning(s). Slow but working.\n`
  : 'All clear.\n');
