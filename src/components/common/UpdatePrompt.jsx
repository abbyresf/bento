import { useEffect, useState } from 'react';
import './UpdatePrompt.css';

/* "New version available — Update".
 *
 * A new build currently takes TWO launches to reach someone: the first fetches
 * the new service worker, the second runs it. Anyone already in the app keeps
 * the old one until they close it, which is how a fixed bug keeps presenting as
 * broken. That gap has cost real debugging time more than once, and a student
 * would never report it — they would just decide the app is bad.
 *
 * This does not change the update strategy. The service worker still installs
 * and activates on its own (skipWaiting + clientsClaim from registerType
 * autoUpdate), so the silent path is untouched and most people will never see
 * this bar. It only appears when a new worker takes control WHILE the app is
 * open, which is exactly the moment the running page is stale.
 *
 * It never reloads on its own. An automatic refresh mid-session would discard a
 * plate someone was building, and losing work to fix a bug they had not noticed
 * is a worse trade than showing a bar.
 */

// The service worker only checks for a new build on navigation, and a PWA that
// is never closed may not navigate for days. Nudge it on a timer and whenever
// the app comes back to the foreground, which on iOS is the reliable signal.
const CHECK_EVERY_MS = 30 * 60 * 1000;

export default function UpdatePrompt() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Whether a worker was already in charge when this page loaded. Without
    // this, the very first install on a brand new device fires controllerchange
    // and offers an update to someone who just arrived.
    const hadController = Boolean(navigator.serviceWorker.controller);

    const onControllerChange = () => { if (hadController) setReady(true); };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    let cancelled = false;
    const check = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!cancelled) await reg?.update();
      } catch { /* offline, or the browser declined. Nothing to do. */ }
    };

    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    check();

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!ready || dismissed) return null;

  return (
    <div className="update-prompt" role="status">
      <span className="update-prompt-text">A new version of Bento is ready.</span>
      <button className="update-prompt-btn" onClick={() => window.location.reload()}>
        Update
      </button>
      <button
        className="update-prompt-close"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss. The update applies next time you open Bento."
      >
        ✕
      </button>
    </div>
  );
}
