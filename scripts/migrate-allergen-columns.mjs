import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local
try {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  }
} catch {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const SQL = `
alter table public.dietary_restrictions
  add column if not exists milk      boolean default false,
  add column if not exists eggs      boolean default false,
  add column if not exists wheat     boolean default false,
  add column if not exists soy       boolean default false,
  add column if not exists fish      boolean default false,
  add column if not exists shellfish boolean default false,
  add column if not exists tree_nuts boolean default false,
  add column if not exists peanuts   boolean default false,
  add column if not exists sesame    boolean default false;
`;

const { error } = await supabase.rpc('exec_sql', { query: SQL }).single();
if (error) {
  // exec_sql may not exist; try direct DDL via a known approach
  // Use the pg connection via edge function, or try another way
  console.log('exec_sql not available, trying raw query approach...');

  // Try calling a postgres function if it exists
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: SQL }),
  });
  const text = await res.text();
  console.log('Response:', res.status, text.slice(0, 200));
} else {
  console.log('Migration applied successfully');
}
