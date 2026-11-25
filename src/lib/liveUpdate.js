import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

/* Tells the Capgo live-update plugin that this web bundle started properly.
 *
 * After a live update the plugin waits appReadyTimeout (capacitor.config.ts)
 * for this call. If it never comes, the bundle is treated as broken and the
 * phone goes back to the last bundle that did call it. So the call has to mean
 * "the app actually drew something", not just "this file loaded": a bundle
 * whose App.jsx renders nothing (the CORS failure startupGuard.js describes)
 * should be rolled back too.
 *
 * Hence the wait for #root to have children, the same test startupGuard uses.
 * Web does nothing.
 */
const CHECK_MS = 200;
const GIVE_UP_MS = 9000; // under the 10 s appReadyTimeout

export function initLiveUpdate() {
  if (!Capacitor.isNativePlatform()) return;

  const started = Date.now();
  const timer = setInterval(() => {
    const drawn = (document.getElementById('root')?.childElementCount ?? 0) > 0;
    if (drawn) {
      clearInterval(timer);
      CapacitorUpdater.notifyAppReady().catch(() => {});
    } else if (Date.now() - started > GIVE_UP_MS) {
      clearInterval(timer); // let the plugin roll back
    }
  }, CHECK_MS);
}
