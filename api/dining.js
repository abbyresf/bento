// Vercel serverless function — proxies requests to brandeishospitality.com
// This runs server-side, so there are no CORS restrictions.
//
// Route: /api/dining/locations/:slug/?date=YYYY-MM-DD
// Forwards to: https://www.brandeishospitality.com/locations/:slug/?date=YYYY-MM-DD

export default async function handler(req, res) {
  // Strip the /api/dining prefix to get the upstream path
  const upstreamPath = req.url.replace(/^\/api\/dining/, '');
  const upstreamUrl = `https://www.brandeishospitality.com${upstreamPath}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        // Mimic a browser request so the site doesn't block us
        'User-Agent': 'Mozilla/5.0 (compatible; Bento/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    const body = await upstream.text();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(upstream.status).send(body);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch dining data', detail: err.message });
  }
}
