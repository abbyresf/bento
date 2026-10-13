/* Row handling that does not touch the network, so it can be tested. */
export const PAGE = 1000;
export const MAX_ROWS = 250000;

/* The id the grid keeps a row under. */
export const rowIdOf = (sheet) => (row) => String(row[sheet.rowId ?? 'row_id']);

/* What changed between the rows the grid holds and the rows just read, so the grid
 * can add, replace and remove those rows alone and keep its sort, filters and
 * scroll. */
export function diffRows(sheet, before, after) {
  const id = rowIdOf(sheet);
  const had = new Map(before.map((r) => [id(r), r]));
  const now = new Map(after.map((r) => [id(r), r]));
  const add = [], update = [], remove = [];
  for (const [k, r] of now) {
    if (!had.has(k)) add.push(r);
    else if (JSON.stringify(had.get(k)) !== JSON.stringify(r)) update.push(r);
  }
  for (const [k, r] of had) if (!now.has(k)) remove.push(r);
  return { add, update, remove };
}

/* The label for a cell, as shown in the grid. Files use the raw value instead. */
export function displayValue(value, type) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'bool') return value === true ? 'Yes' : 'No';
  if (type === 'datetime') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  return String(value);
}
