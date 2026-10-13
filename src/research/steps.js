/* Which screen the researcher dashboard shows, decided from three facts and
 * nothing else, so it can be tested without a browser.
 *
 *   session   undefined while loading, null when signed out, otherwise the session
 *   who       what research_whoami said, undefined while it is being asked
 *   factors   the researcher's verified authenticator apps, undefined while asked
 *
 * A password alone never gets past the multi-factor step. The database enforces it
 * as well (research.is_researcher needs aal2), so this decides what to show and is
 * not what keeps anyone out. */
export function nextStep({ session, who, factors }) {
  if (session === undefined) return 'loading';
  if (session === null) return 'signin';
  if (who === undefined) return 'loading';
  if (!who.is_researcher) return 'denied';
  if (who.aal === 'aal2') return 'ready';
  if (factors === undefined) return 'loading';
  return factors.length > 0 ? 'mfa-verify' : 'mfa-enroll';
}

/* A six digit code, typed with or without a space in the middle. */
export function cleanCode(raw) { return String(raw ?? '').replace(/\D/g, '').slice(0, 6); }
export function codeProblem(raw) { return cleanCode(raw).length === 6 ? '' : 'Enter the 6 digit code from your authenticator app.'; }

export const IDLE_MINUTES = 30;
export const IDLE_MS = IDLE_MINUTES * 60 * 1000;

/* What to say after a sign in error. Never says which half was wrong. */
export function signInProblem(error) {
  const m = String(error?.message ?? '');
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a few minutes and try again.';
  if (/network|fetch/i.test(m)) return 'Could not reach the server. Check your connection and try again.';
  return 'That email and password did not work.';
}
