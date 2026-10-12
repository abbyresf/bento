/* Drives the mock app to one screen for App Store screenshots. Marker: BENTO_UI_MOCK_ACTIVE
 *
 * Open the dev server with ?shot=today|buddies|here|insights|badges|closet|community|ratings and it taps through
 * to that screen, so a one-shot headless capture needs no clicks. Loaded only when the app is built with
 * VITE_UI_MOCK=true (see main.jsx). */
const query = new URLSearchParams(window.__shotQuery || location.search);
const shot = query.get('shot');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (selector, text, exact = true) => {
  const el = [...document.querySelectorAll(selector)].find((e) => {
    const t = e.textContent.replace(/\s+/g, ' ').trim();
    return exact ? t === text : t.includes(text);
  });
  el?.click();
  return Boolean(el);
};
const waitFor = async (fn, tries = 60) => { for (let i = 0; i < tries; i++) { if (fn()) return true; await sleep(250); } return false; };

(async () => {
  if (!shot) return;
  const st = document.createElement('style');
  st.textContent = '*,*::before,*::after{animation-duration:0.001s!important;animation-delay:0s!important;transition-duration:0.001s!important;transition-delay:0s!important}.help-btn{display:none!important}';
  document.head.appendChild(st);
  await waitFor(() => document.querySelector('.bottom-nav-tab, nav button'));
  await sleep(1200);
  const tab = { buddies: 'Buddies', here: 'Buddies', insights: 'Insights', badges: 'Insights', community: 'Community', ratings: 'My Ratings' }[shot];
  if (tab) { click('button', tab); await sleep(1200); }
  if (shot === 'here') { click('button', "I'm here"); await sleep(800); }
  if (shot === 'badges') { await waitFor(() => click('button', 'badges', false)); await sleep(1200); }
  if (shot === 'closet') { await waitFor(() => click('button', 'Closet')); await sleep(1000); }
  const y = Number(query.get('y') || 0);
  if (y) { window.scrollTo(0, y); document.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 40 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = y; }); }
  document.documentElement.dataset.shotReady = shot;
})();
