import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { createUserIdResolver } from './userIdResolver';
import { createCoalescer } from './coalesce';

/* The signed-in user's id, shared (see userIdResolver.js). Use this instead of calling auth.getUser() directly. */
const resolver = createUserIdResolver({
  getUser: () => supabase.auth.getUser(),
  getSession: () => supabase.auth.getSession(),
  isOffline: isAuthRetryableFetchError,
});
export const currentUserId = () => { listen(); return resolver.get(); };

/* The signed-in student's whole profiles row, read once for everyone who asks within a second. Resolves to
 * { data, error } like a Supabase read, or { data: null, error: null } when nobody is signed in. Call forgetProfileRead()
 * after any write to profiles, so the next read is fresh. */
const profileRead = createCoalescer(1000);
export const forgetProfileRead = () => profileRead.forget();
export const readProfileRow = () => { listen(); return profileRead.shared(async () => {
  const id = await currentUserId();
  if (!id) return { data: null, error: null };
  return supabase.from('profiles').select('*').eq('id', id).maybeSingle();
}); };

// A different student, or none, must never be served the last one's id or row. Subscribed on first use, not on import:
// the homepage prerender imports this module through db.js and has no database (supabase.prerender-stub.js throws on
// any access). Nothing is cached before the first use, so nothing can go stale before the subscription starts.
let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  supabase.auth.onAuthStateChange(() => { resolver.reset(); profileRead.forget(); });
}
