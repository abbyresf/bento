// "Who sent you?" on signup, for the referral race.
//
// The answer lives in the auth user's metadata (raw_user_meta_data.referred_by),
// so no table or migration is needed. Email signups send it with the signUp call,
// which works even when the confirmation link is opened on another device.
// Google and Apple signups leave the page before an account exists, so the answer
// waits in localStorage and is written once the new user is signed in.

import { supabase } from './supabase';

const PENDING_KEY = 'bento_pending_referral';
const MAX_LEN = 60;

export function cleanReferral(value) {
  return (value || '').trim().replace(/\s+/g, ' ').slice(0, MAX_LEN);
}

// ?ref=handle on a shared link fills the box in for the new user.
export function referralFromUrl() {
  try {
    return cleanReferral(new URLSearchParams(window.location.search).get('ref'));
  } catch {
    return '';
  }
}

export function rememberReferral(value) {
  const ref = cleanReferral(value);
  try {
    if (ref) localStorage.setItem(PENDING_KEY, ref);
    else localStorage.removeItem(PENDING_KEY);
  } catch { /* storage blocked: email signups still carry it in signUp */ }
}

export async function signUpWithReferral(email, password, referredBy) {
  const ref = cleanReferral(referredBy);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    ...(ref ? { options: { data: { referred_by: ref } } } : {}),
  });
  if (error) throw error;
  return data;
}

async function applyPendingReferral() {
  let ref = '';
  try { ref = localStorage.getItem(PENDING_KEY) || ''; } catch { return; }
  if (!ref) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
  if (user.user_metadata?.referred_by) return;
  // Only credit brand-new accounts, so an old user signing in can't be counted.
  const ageMs = Date.now() - new Date(user.created_at).getTime();
  if (ageMs > 60 * 60 * 1000) return;
  await supabase.auth.updateUser({ data: { referred_by: ref } });
}

// Deferred with setTimeout: awaiting auth calls inside this callback can deadlock supabase-js.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN') setTimeout(() => { applyPendingReferral().catch(() => {}); }, 0);
});
