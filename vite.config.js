import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
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
            urlPattern: /\/api\/dining\//,
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
