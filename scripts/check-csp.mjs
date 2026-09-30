// Verifies the CSP hash in vercel.json still matches the inline theme script.
//
//   node scripts/check-csp.mjs      (runs as part of npm run build)
//
// index.html runs one inline script before React, to read the saved theme and
// set data-theme so a dark-mode user does not get a white flash on every load.
// Production CSP is script-src 'self', which blocked it, so that flash was
// happening to every dark-mode user on every page load. The fix is to allow
// exactly that one script by its sha256.
//
// A hash pinned in one file against code in another goes stale the moment
// someone edits the script, and it fails the way the original bug did: a
// console error nobody reads and a flash nobody reports. So the build recomputes
// it and refuses to ship a mismatch.

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');

// The inline script is the only <script> with no src and no type.
const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (matches.length !== 1) {
  throw new Error(
    `expected exactly 1 bare inline <script> in dist/index.html, found ${matches.length}. ` +
    'Every inline script needs its own CSP hash, so add it and update this check.'
  );
}

const digest = createHash('sha256').update(matches[0][1], 'utf8').digest('base64');
const expected = `'sha256-${digest}'`;

const vercel = await readFile(path.join(root, 'vercel.json'), 'utf8');
const csp = JSON.parse(vercel).headers
  ?.flatMap((h) => h.headers ?? [])
  .find((h) => h.key.toLowerCase() === 'content-security-policy')?.value;

if (!csp) throw new Error('no Content-Security-Policy header found in vercel.json');

if (!csp.includes(expected)) {
  throw new Error(
    `CSP does not allow the inline theme script.\n` +
    `  expected in script-src: ${expected}\n` +
    `  vercel.json script-src: ${csp.match(/script-src[^;]*/)?.[0] ?? '(none)'}\n` +
    `The script changed, so its hash did too. Put the value above in vercel.json.`
  );
}

console.log(`csp ok: inline theme script allowed by ${expected}`);
