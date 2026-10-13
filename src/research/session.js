import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { IDLE_MS } from './steps.js';

/* Everything about being signed in to the dashboard: the session, what the
 * database says this account is, and the authenticator app (a time-based one-time
 * code, TOTP). The password gets someone a session. Only the code gets them an
 * aal2 session, and only aal2 is allowed to read research data, in the database. */

export async function whoami() {
  const { data, error } = await supabase.rpc('research_whoami');
  if (error) return { is_researcher: false, role: null, aal: '', email: null };
  return data?.[0] ?? { is_researcher: false, role: null, aal: '', email: null };
}

/* The researcher's verified authenticator apps. */
export async function verifiedFactors() {
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.totp ?? []).filter((f) => f.status === 'verified');
}

/* Starts adding an authenticator app. An earlier attempt that was abandoned before
 * the first code was entered would block a new one with the same name, so those
 * are removed first. Returns { id, qr, secret } or { error }. */
export async function startEnroll() {
  const { data: listed } = await supabase.auth.mfa.listFactors();
  for (const f of listed?.all ?? []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Bento Research' });
  if (error) return { error: error.message };
  return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/* Checks a code against a factor. Resolves to null on success. */
export async function verifyCode(factorId, code) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  return error ? 'That code did not work. Check the time on your phone and try the next one.' : null;
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: String(email).trim(), password });
  return error ?? null;
}

export async function signOut() { await supabase.auth.signOut(); }

/* The three facts nextStep() decides from. */
export function useAuthFlow() {
  const [session, setSession] = useState(undefined);
  const [who, setWho] = useState(undefined);
  const [factors, setFactors] = useState(undefined);

  const load = useCallback(async () => {
    setWho(await whoami());
    setFactors(await verifiedFactors());
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
      if (data.session) load(); else { setWho(undefined); setFactors(undefined); }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      setSession(next ?? null);
      if (!next) { setWho(undefined); setFactors(undefined); return; }
      // Deferred, so this callback does not call back into the client while it runs.
      if (event !== 'TOKEN_REFRESHED') setTimeout(load, 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [load]);

  return { session, who, factors, refresh: load };
}

/* Signs out after a stretch with no mouse, key or touch. A tool that shows
 * participants' meals should not sit open on an unattended laptop. */
export function useIdleSignOut(enabled, onIdle, ms = IDLE_MS) {
  const timer = useRef(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const reset = () => { clearTimeout(timer.current); timer.current = setTimeout(onIdle, ms); };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(timer.current); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [enabled, onIdle, ms]);
}
