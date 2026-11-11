/* The Loud redesign is a pilot. It shows only on a device where it was switched on: open the app with ?loud=1 once (the
 * choice is remembered on this device), or ?loud=0 to turn it off. Off for everyone else, research participants included.
 *
 * The address is read once, when this file loads, because the router rewrites it before Today renders and the query string
 * would be gone by then. Same pattern as the day box prototype. */
let on = false;
try {
  const q = new URLSearchParams(window.location.search).get('loud');
  if (q === '1') localStorage.setItem('bento_loud', '1');
  if (q === '0') localStorage.removeItem('bento_loud');
  on = localStorage.getItem('bento_loud') === '1';
} catch { /* storage unavailable: stays off */ }
// A pilot build for the simulator or TestFlight can switch it on for everyone running that build: VITE_LOUD=1. The iPhone
// app has no address bar to type ?loud=1 into.
if (import.meta.env?.VITE_LOUD === '1') on = true;
// The page itself takes the Loud look (ground, tab bar, sheets) through html.loud-app. Nothing in loud-app.css applies
// without it, so the current app is untouched when the pilot is off.
if (on && typeof document !== 'undefined') document.documentElement.classList.add('loud-app');

export const loudOn = () => on;
