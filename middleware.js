// Vercel Edge Middleware — runs at the edge before every request reaches a function.
// Uses Web standard APIs — no framework dependency required for non-Next.js apps.
//
// Rate-limits /api/dining to 30 requests per IP per minute.
// Note: the Map is per-edge-instance (not global). This blocks burst abuse
// from a single IP hitting the same edge node, which covers the common bot pattern.
// For a global counter, replace with Vercel KV (Redis) — one line swap.
//
// To activate: Vercel automatically detects middleware.js at the project root.

const buckets = new Map();
const WINDOW_MS    = 60_000;
const MAX_REQUESTS = 30;

function check(ip) {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now - b.t > WINDOW_MS) {
    buckets.set(ip, { n: 1, t: now });
    return { ok: true, remaining: MAX_REQUESTS - 1 };
  }
  b.n += 1;
  return { ok: b.n <= MAX_REQUESTS, remaining: Math.max(0, MAX_REQUESTS - b.n) };
}

export default function middleware(req) {
  const url = new URL(req.url);

  // Only rate-limit the dining proxy
  if (!url.pathname.startsWith('/api/dining')) return;

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
           ?? req.headers.get('x-real-ip')
           ?? 'unknown';

  const { ok } = check(ip);

  if (!ok) {
    return new Response(
      JSON.stringify({ error: 'Too many requests. Please wait a moment.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
          'X-RateLimit-Limit': String(MAX_REQUESTS),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // Returning undefined lets the request pass through normally
}
