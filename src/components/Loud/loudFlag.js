/* The Loud redesign is the default look. A device can go back to the previous look with ?loud=0 (remembered on that
 * device) and return with ?loud=1. VITE_LOUD=0 builds the previous look for everyone running that build.
 *
 * The address is read once, when this file loads, because the router rewrites it before Today renders and the query string
 * would be gone by then. Same pattern as the day box prototype. */
let on = true;
try {
  const q = new URLSearchParams(window.location.search).get('loud');
  if (q === '0') localStorage.setItem('bento_loud', '0');
  if (q === '1') localStorage.removeItem('bento_loud');
  if (localStorage.getItem('bento_loud') === '0') on = false;
} catch { /* storage unavailable: stays on */ }
if (import.meta.env?.VITE_LOUD === '0') on = false;
// The page itself takes the Loud look (ground, tab bar, sheets) through html.loud-app. Nothing in loud-app.css applies
// without it, so the previous look is untouched when it is off.
if (on && typeof document !== 'undefined') document.documentElement.classList.add('loud-app');

export const loudOn = () => on;

// Development only: ?streakdemo=N shows the streak moment for day N, to check each of its looks. Release builds skip it.
let demo = 0;
if (import.meta.env?.DEV) {
  try { demo = parseInt(new URLSearchParams(window.location.search).get('streakdemo') ?? '0', 10) || 0; } catch { /* none */ }
}
export const streakDemo = () => (on ? demo : 0);
