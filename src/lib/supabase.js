import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const msg = document.createElement('div');
  msg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#dc2626;padding:2rem;text-align:center';
  msg.textContent = 'Supabase environment variables are not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your deployment settings.';
  document.body.appendChild(msg);
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
