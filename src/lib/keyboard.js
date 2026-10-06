import { Capacitor } from '@capacitor/core';

/* Keeps fields visible when the on-screen keyboard opens.
 *
 * The app's web view fills the whole screen and does not shrink when the
 * keyboard appears, so the keyboard simply covers whatever is at the bottom:
 * the message box in the feedback sheet was hidden behind it. The visual
 * viewport does shrink, so the difference between the two is the keyboard's
 * height.
 *
 * That height is published as --kb, and a class is set on <html> while the
 * keyboard is open. CSS in native.css uses them to lift sheets above the
 * keyboard and to hide the tab bar, which has nothing to do while typing.
 * Native only: a browser looks after this itself.
 */
export function initKeyboardInset() {
  if (!Capacitor.isNativePlatform() || !window.visualViewport) return;

  const vv = window.visualViewport;
  const root = document.documentElement;

  const sync = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    root.style.setProperty('--kb', `${kb}px`);
    // The height that is actually visible. iOS also pans the page to reveal the
    // focused field, so this, not the window height, is what a sheet has to fit.
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    // Under 80px is an input accessory bar or a rounding artefact, not a keyboard.
    root.classList.toggle('kb-open', kb > 80);
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();

  // When a field takes focus, bring it into view once the keyboard has risen.
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || !el.matches('input, textarea, select, [contenteditable]')) return;
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  });
}
