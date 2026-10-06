import { createClient, processLock } from '@supabase/supabase-js';
import { createMock } from './mockSupabase.js';
import { Capacitor } from '@capacitor/core';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const mockMode = import.meta.env.VITE_UI_MOCK;
const useMock = mockMode === 'true' || mockMode === 'onboarding';

if (!useMock && (!supabaseUrl || !supabaseAnonKey)) {
  const msg = document.createElement('div');
  msg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#dc2626;padding:2rem;text-align:center';
  msg.textContent = 'Supabase environment variables are not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your deployment settings.';
  document.body.appendChild(msg);
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

// In the native app the auth session lock is an in-process one. The default uses
// the browser's navigator.locks, which exists to coordinate several tabs of one
// site. The app has a single web view and no tabs, and a lock that fails to
// acquire there leaves getSession() pending, so App.jsx draws nothing. The web
// keeps the default.
export const supabase = useMock
  ? createMock(mockMode)
  : createClient(
      supabaseUrl,
      supabaseAnonKey,
      Capacitor.isNativePlatform() ? { auth: { lock: processLock } } : undefined,
    );
