import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { parseStartLink } from '../data/research';

/* The start code from the QR code at the snack pickup station, remembered until
 * the student is signed in and ready to use it. The QR code holds
 * https://www.bentodining.com/start/CODE. Scanned with the phone camera it opens
 * the iPhone app (a universal link) or the web app on Android, and either way the
 * code arrives here.
 *
 * Opening the link can happen before sign in or with the app closed, so the code
 * is kept under a bento_ key (cleared at sign out) and the study host asks for it
 * once the main screen is up. */
const KEY = 'bento_study_start_code';

export function rememberStartCode(code) {
  try { localStorage.setItem(KEY, code); } catch { /* ignore */ }
  // Tells the study host, which may already be on screen, that a code just arrived.
  try { window.dispatchEvent(new Event('bento-start-code')); } catch { /* ignore */ }
  return code;
}

export function peekStartCode() {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

export function forgetStartCode() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/* Call once at startup. onCode runs with the code when a link arrives. */
export function initStartLinks(onCode) {
  const fromPath = parseStartLink(typeof window !== 'undefined' ? window.location.pathname : '');
  if (fromPath) onCode?.(rememberStartCode(fromPath));
  if (!Capacitor.isNativePlatform()) return;
  const handle = (url) => {
    const code = parseStartLink(url);
    if (code) onCode?.(rememberStartCode(code));
  };
  App.addListener('appUrlOpen', ({ url }) => handle(url));
  App.getLaunchUrl().then((r) => r?.url && handle(r.url)).catch(() => {});
}
