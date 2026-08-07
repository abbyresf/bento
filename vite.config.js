import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Dev-only middleware that replicates api/tufts.js for local testing.
// In production, the Vercel serverless function handles /api/tufts.
function tuftsDevPlugin() {
  const ALLOWED = new Set(['carmichael-dining-hall', 'dewick-dining']);
  const MEALS   = ['breakfast', 'lunch', 'dinner'];

  function nutrisliceUrl(slug, meal, dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `https://tufts.api.nutrislice.com/menu/api/weeks/school/${slug}/menu-type/${meal}/${y}/${m}/${d}/?format=json`;
  }

  function extractDay(weekly, dateStr) {
    if (!weekly?.days) return [];
    const day = weekly.days.find(d => d.date === dateStr);
    return (day?.menu_items ?? []).map(i => i.food).filter(f => f?.name);
  }

  return {
    name: 'tufts-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/tufts')) return next();
        const url    = new URL(req.url, 'http://localhost');
        const slug   = url.searchParams.get('slug');
        const date   = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
        if (!slug || !ALLOWED.has(slug)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Unknown dining location' }));
        }
        try {
          const results = await Promise.all(
            MEALS.map(meal =>
              fetch(nutrisliceUrl(slug, meal, date), {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bento/1.0)' },
              }).then(r => r.ok ? r.json() : null).catch(() => null)
            )
          );
          const body = JSON.stringify({
            date, slug,
            meals: Object.fromEntries(MEALS.map((meal, i) => [meal, extractDay(results[i], date)])),
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(body);
        } catch (err) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Tufts fetch failed', detail: err.message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tuftsDevPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Bento – Brandeis Meal Planner',
        short_name: 'Bento',
        description: 'Personalized daily meal plans from Brandeis dining halls',
        theme_color: '#243b55',
        background_color: '#faf7f4',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        globIgnores: ['logo.png'],
        runtimeCaching: [
          {
            // Cache the Brandeis dining pages for offline fallback
            urlPattern: /\/api\/(dining|tufts)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'dining-menu',
              expiration: { maxAgeSeconds: 60 * 60 * 24 }, // 1 day
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      // Proxy Brandeis dining requests in dev to avoid CORS.
      // In production, Vercel's /api/dining.js serverless function handles this.
      '/api/dining': {
        target: 'https://www.brandeishospitality.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/dining/, ''),
      },
    },
  },
})
