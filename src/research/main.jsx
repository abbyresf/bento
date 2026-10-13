import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './research.css';

/* Development only: ?stub=researcher (or owner, nomfa, enroll, student, signedout)
 * swaps the database for made-up data, so the dashboard can be looked at and
 * worked on without a real study. The stub is imported only under this check, and
 * a production build contains neither the check nor the stub. */
async function start() {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('stub')) {
    const [{ installStub }, { makeStub }] = await Promise.all([import('./supabase.js'), import('./devStub.js')]);
    installStub(makeStub(new URLSearchParams(window.location.search).get('stub')));
  }
  const { default: App } = await import('./App.jsx');
  document.body.dataset.agThemeMode = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
}
start();
