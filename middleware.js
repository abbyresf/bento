/* Serves the prerendered homepage at "/".
 *
 * A rewrite in vercel.json cannot do this. Vercel checks the filesystem before
 * it applies rewrites, and the build emits index.html at the root, so the
 * filesystem answers "/" and the rewrite never runs. Verified on a preview
 * deploy: /home.html returned all 4750 characters while / still returned the
 * 7.8 KB empty shell.
 *
 * Middleware runs before that filesystem check, so it can hand "/" the
 * prerendered file while index.html stays exactly what it is today: the SPA
 * shell, precached by the service worker and used as its navigation fallback.
 * Nothing about the app or the service worker changes, which matters because
 * the alternative was repointing navigateFallback at a second shell file.
 *
 * The matcher is a single path. Every other route, /app included, never reaches
 * this function.
 */
import { rewrite } from '@vercel/edge';

export const config = { matcher: '/' };

export default function middleware(request) {
  return rewrite(new URL('/home.html', request.url));
}
