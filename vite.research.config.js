import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The researcher dashboard is its own site, built apart from the student app.
//
// It is NOT a route inside the student app. A route would put researcher code into
// the iOS bundle (webDir is dist) and onto the public site. This config builds
// research.html on its own into dist-research, and nothing in the student build
// imports from src/research. Deploy dist-research as its own Vercel project on its
// own subdomain. See RESEARCH_DASHBOARD_SPEC.md, section 2.
//
//   npm run dev:research     http://localhost:5210/research.html
//   npm run build:research   writes dist-research
export default defineConfig({
  plugins: [react()],
  // The student app's public folder (icons, sitemap, service worker) is not wanted.
  publicDir: 'public-research',
  server: { port: 5210 },
  build: {
    outDir: 'dist-research',
    emptyOutDir: true,
    rollupOptions: { input: 'research.html' },
  },
})
