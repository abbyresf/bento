// Renders the landing page to static HTML at build time and writes dist/home.html.
//
//   npm run build   (runs this automatically, after the two vite builds)
//
// Vercel serves that file at "/" via a rewrite in vercel.json, so crawlers,
// link unfurlers and LLM readers get the real copy instead of an empty
// <div id="root">. Everything else still resolves to index.html, so /app and
// the rest of the SPA are untouched and the app never flashes marketing copy.
//
// The prerendered markup is decoration, not state. main.jsx mounts with
// createRoot().render(), which discards whatever is already in the container,
// so React does not hydrate this and cannot mismatch against it. For a
// logged-out visitor the markup it replaces is identical to what it renders.

import { readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, '.ssr-build');

const MOUNT = '<div id="root"></div>';

const { render } = await import(path.join(ssrDir, 'prerender-entry.js'));
const markup = render();

if (!markup || markup.length < 2000) {
  // A near-empty render means the component tree bailed out. Shipping that
  // would quietly restore the exact bug this script exists to fix, so fail the
  // build instead of writing a blank page.
  throw new Error(`prerender produced only ${markup?.length ?? 0} chars of markup; expected the full landing page`);
}

const template = await readFile(path.join(dist, 'index.html'), 'utf8');
if (!template.includes(MOUNT)) {
  throw new Error(`could not find ${MOUNT} in dist/index.html; the mount point changed`);
}

// Same <head> as index.html, so the prerendered page keeps the canonical URL,
// the meta description, the JSON-LD and every asset link already tuned for SEO.
const html = template.replace(MOUNT, `<div id="root">${markup}</div>`);
await writeFile(path.join(dist, 'home.html'), html, 'utf8');

await rm(ssrDir, { recursive: true, force: true });

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`prerendered dist/home.html  ${kb(html.length)}  (${kb(markup.length)} of markup)`);
