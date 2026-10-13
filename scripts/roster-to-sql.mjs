// Turns the researchers' list (a CSV) into the SQL that loads it.
//
//   node scripts/roster-to-sql.mjs <study-id> path/to/list.csv | pbcopy
//
// Paste the result into the Supabase SQL editor and run it. The CSV needs a header
// row with `email` and `group` columns, and may have a `name` column.
//
// The output goes to the screen or the clipboard and is never written to a file,
// because the list is names and emails and this repository is public. Keep the CSV
// itself outside the repo too. Running it again with a longer list is safe: see
// research.add_roster in migration 054.
import { readFileSync } from 'node:fs';

const [studyId, path] = process.argv.slice(2);
const fail = (msg) => { console.error(`roster-to-sql: ${msg}`); process.exit(1); };
if (!studyId || !path) fail('usage: node scripts/roster-to-sql.mjs <study-id> <list.csv>');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studyId)) fail('the study id is not a uuid');

// Minimal CSV reader: commas, double-quoted fields, "" for a quote, CRLF or LF.
const parse = (text) => {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
};

const rows = parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
if (rows.length < 2) fail('the file has no data rows');
const header = rows[0].map((h) => h.trim().toLowerCase());
const col = (name) => header.indexOf(name);
if (col('email') < 0 || col('group') < 0) fail(`the header needs "email" and "group" columns, found: ${header.join(', ')}`);

const seen = new Set();
const people = rows.slice(1).map((r, i) => {
  const email = (r[col('email')] ?? '').trim().toLowerCase();
  const group = (r[col('group')] ?? '').trim();
  const name = col('name') >= 0 ? (r[col('name')] ?? '').trim() : '';
  const line = i + 2;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(`line ${line}: "${email}" is not an email address`);
  if (!group) fail(`line ${line}: no group for ${email}`);
  if (seen.has(email)) fail(`line ${line}: ${email} appears twice`);
  seen.add(email);
  return { email, group, ...(name ? { name } : {}) };
});

const counts = people.reduce((m, p) => ({ ...m, [p.group]: (m[p.group] ?? 0) + 1 }), {});
console.error(`roster-to-sql: ${people.length} people. Groups: ${Object.entries(counts).map(([g, c]) => `${g}=${c}`).join(', ')}`);

const json = JSON.stringify(people);
if (json.includes('$roster$')) fail('the file contains the text $roster$, which this script uses as a delimiter');
console.log(`select research.add_roster('${studyId.toLowerCase()}', $roster$${json}$roster$::jsonb);`);
