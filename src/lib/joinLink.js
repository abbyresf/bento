import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { parseJoinLink, normalizeCode, isValidCode } from '../data/duo';

/* An invite link, remembered until the person is signed in and ready to answer it.
 *
 * Opening the link can happen before sign in, in the middle of onboarding, or
 * with the app closed. So the code is kept under a bento_ key (cleared at sign
 * out) and the join sheet asks for it once the main screen is up.
 *
 * The link only reaches the app as a link once the app has the associated-domains
 * setup described in SOCIAL_SPEC.md (B6). Until then the same code can be typed. */
const KEY = 'bento_duo_join_code';

export function rememberJoinCode(code) {
  const c = normalizeCode(code);
  if (!isValidCode(c)) return null;
  try { localStorage.setItem(KEY, c); } catch { /* ignore */ }
  return c;
}

export function peekJoinCode() {
  try {
    const c = localStorage.getItem(KEY);
    return c && isValidCode(c) ? c : null;
  } catch { return null; }
}

export function forgetJoinCode() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/* Call once at startup. onCode runs with the code when a link arrives. */
export function initJoinLinks(onCode) {
  // The web: /join/CODE in the address bar.
  const fromPath = parseJoinLink(typeof window !== 'undefined' ? window.location.pathname : '');
  if (fromPath) {
    const c = rememberJoinCode(fromPath);
    if (c) onCode?.(c);
  }
  if (!Capacitor.isNativePlatform()) return;
  const handle = (url) => {
    const code = parseJoinLink(url);
    if (!code) return;
    const c = rememberJoinCode(code);
    if (c) onCode?.(c);
  };
  App.addListener('appUrlOpen', ({ url }) => handle(url));
  // Opened from a closed app.
  App.getLaunchUrl().then((r) => r?.url && handle(r.url)).catch(() => {});
}
