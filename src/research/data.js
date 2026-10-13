import { supabase as defaultClient } from './supabase.js';
import { selectList } from './sheets.js';
import { PAGE, MAX_ROWS } from './rows.js';

/* Reading sheets from the database. PostgREST returns at most 1000 rows a request,
 * so a sheet is read in pages until one comes back short. The rows are ordered by a
 * stable key so no row is skipped or read twice between pages. */
export async function fetchSheet(sheet, { onProgress, client = defaultClient } = {}) {
  const rows = [];
  const source = sheet.view ?? sheet.table;
  const order = sheet.order ?? 'row_id';
  const key = sheet.rowId ?? 'row_id';
  for (let from = 0; ; from += PAGE) {
    let q = client.schema('research').from(source).select(selectList(sheet));
    q = q.order(order, { ascending: !sheet.descending });
    if (order !== key) q = q.order(key);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message || 'Could not read this sheet.');
    rows.push(...(data ?? []));
    onProgress?.(rows.length);
    if (!data || data.length < PAGE) break;
    if (rows.length >= MAX_ROWS) throw new Error('This sheet has more rows than the dashboard will load. Narrow it in the database.');
  }
  return rows;
}

export async function fetchStudy(client = defaultClient) {
  const { data } = await client.schema('research').from('studies')
    .select('name, cap, window_days, survey_intro').order('created_at', { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

/* Records an export or an identity view. Returns false when the database refuses,
 * and the caller must not hand over the file if so. */
export async function logAction(action, detail = {}, client = defaultClient) {
  const { data, error } = await client.rpc('research_log_action', { p_action: action, p_detail: detail });
  return !error && data === true;
}
