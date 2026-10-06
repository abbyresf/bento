import { Capacitor } from '@capacitor/core';

/* A blank screen is the worst way for an app to fail. Nothing says what broke,
 * and the person has nothing to tap.
 *
 * Three different things produced one in this app: a CORS failure that left
 * App.jsx rendering null, a module that threw while loading, and an auth call
 * that never settled. None of them reach ErrorBoundary, which only sees render
 * errors, and none leave a trace on a phone with no console.
 *
 * So after a few seconds with nothing drawn, native builds put a message on the
 * screen with the first errors seen and a reload button. If the app draws
 * later, the message removes itself. Web is left alone: a browser has a console
 * and a refresh button.
 *
 * Import this before anything else so it can see errors from other modules.
 */
const WAIT_MS = 8000;

if (Capacitor.isNativePlatform()) {
  const seen = [];
  const note = (m) => { if (seen.length < 4) seen.push(String(m).slice(0, 200)); };
  window.addEventListener('error', (e) => note(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => note(e.reason?.message || e.reason));

  const drawn = () => (document.getElementById('root')?.childElementCount ?? 0) > 0;

  setTimeout(() => {
    if (drawn()) return;

    const box = document.createElement('div');
    box.id = 'startup-guard';
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#faf7f4;color:#243b55;'
      + 'display:flex;flex-direction:column;align-items:center;justify-content:center;'
      + 'gap:14px;padding:32px;text-align:center;font-family:system-ui,sans-serif';

    const title = document.createElement('div');
    title.textContent = 'Bento did not start';
    title.style.cssText = 'font-size:22px;font-weight:700';

    const body = document.createElement('div');
    body.textContent = 'Check your connection and try again.';
    body.style.cssText = 'font-size:16px;opacity:.8';

    const btn = document.createElement('button');
    btn.textContent = 'Try again';
    btn.style.cssText = 'margin-top:8px;padding:12px 28px;font-size:16px;font-weight:600;color:#fff;'
      + 'background:#ff6a00;border:0;border-radius:10px';
    btn.onclick = () => window.location.reload();

    const detail = document.createElement('div');
    detail.textContent = seen.length ? seen.join('\n') : 'No error was reported.';
    detail.style.cssText = 'margin-top:12px;font:11px ui-monospace,monospace;opacity:.55;'
      + 'white-space:pre-wrap;word-break:break-word;max-width:100%';

    box.append(title, body, btn, detail);
    document.body.appendChild(box);

    // If the app does draw after all, get out of its way.
    const poll = setInterval(() => {
      if (drawn()) { box.remove(); clearInterval(poll); }
    }, 500);
  }, WAIT_MS);
}
