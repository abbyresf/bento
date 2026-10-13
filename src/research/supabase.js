import { createClient } from '@supabase/supabase-js';

/* The dashboard's own Supabase client. It is not the student app's client: that
 * one loads native plugins and mock data, and none of it belongs here.
 *
 * The session lives in sessionStorage, so closing the tab ends it. A tool that
 * shows participants' names and meals should not stay signed in on a shared
 * laptop. */
const env = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);

// A live binding: installStub swaps it in development only.
export let supabase = configured && typeof window !== 'undefined'
  ? createClient(url, key, {
      auth: {
        storage: window.sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

/* Development only: main.jsx calls this with a stand-in client when the address
 * has ?stub=. Never reached in a production build, which does not include it. */
export function installStub(client) { supabase = client; }
