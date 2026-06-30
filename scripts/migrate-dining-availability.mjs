import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const SQL = `
CREATE TABLE IF NOT EXISTS dining_availability (
  date       DATE        PRIMARY KEY,
  any_open   BOOLEAN     NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dining_availability ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dining_availability' AND policyname = 'Anyone can read dining availability'
  ) THEN
    CREATE POLICY "Anyone can read dining availability"
      ON dining_availability FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dining_availability' AND policyname = 'Authenticated users can insert dining availability'
  ) THEN
    CREATE POLICY "Authenticated users can insert dining availability"
      ON dining_availability FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dining_availability' AND policyname = 'Authenticated users can update dining availability'
  ) THEN
    CREATE POLICY "Authenticated users can update dining availability"
      ON dining_availability FOR UPDATE USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
`;

const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: SQL }),
});

if (res.ok) {
  console.log('Migration applied successfully.');
} else {
  const text = await res.text();
  console.error('exec_sql not available or failed:', res.status, text.slice(0, 300));
  console.log('\nRun this SQL manually in the Supabase dashboard (SQL Editor):\n');
  console.log(SQL);
}
