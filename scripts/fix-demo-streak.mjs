/**
 * Patches the existing demo user's streak last_confirmed_date to yesterday
 * so the streak is still active and can be incremented today.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/fix-demo-streak.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local from project root
try {
  const envPath = resolve(new URL('.', import.meta.url).pathname, '..', '.env.local');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const [k, v] = line.split('=');
    if (k && v && !process.env[k.trim()]) process.env[k.trim()] = v.trim();
  }
} catch {}

const SUPABASE_URL = 'https://jeexzjphglnpugsuznad.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in .env.local or as an env var.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fix() {
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const demo = users?.find(u => u.email === 'demo@bento.app');
  if (!demo) { console.error('Demo user not found.'); process.exit(1); }

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const { error } = await supabase
    .from('streaks')
    .update({ last_confirmed_date: yesterday })
    .eq('user_id', demo.id);

  if (error) { console.error(error); process.exit(1); }
  console.log(`Updated demo user streak last_confirmed_date → ${yesterday}`);
  console.log('The 10-day streak is now active. Confirming all 3 meals today will bring it to 11.');
}

fix().catch(e => { console.error(e); process.exit(1); });
