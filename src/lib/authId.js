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
export const currentUserId = () => resolver.get();

/* The signed-in student's whole profiles row, read once for everyone who asks within a second. Resolves to
 * { data, error } like a Supabase read, or { data: null, error: null } when nobody is signed in. Call forgetProfileRead()
 * after any write to profiles, so the next read is fresh. */
const profileRead = createCoalescer(1000);
export const forgetProfileRead = () => profileRead.forget();
export const readProfileRow = () => profileRead.shared(async () => {
  const id = await currentUserId();
  if (!id) return { data: null, error: null };
  return supabase.from('profiles').select('*').eq('id', id).maybeSingle();
});

// A different student, or none, must never be served the last one's id or row.
supabase.auth.onAuthStateChange(() => { resolver.reset(); profileRead.forget(); });
