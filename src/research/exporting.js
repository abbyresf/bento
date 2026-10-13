import { SHEETS } from './sheets.js';
import { dictionaryRows, DICTIONARY_HEADERS } from './dictionary.js';

/* Turning sheets into files. CSV is written by hand. XLSX uses write-excel-file,
 * loaded only when someone exports, so the grid page does not carry it.
 *
 * A spreadsheet treats a cell that starts with = + - or @ as a formula. Survey
 * answers include words typed by participants, so one of them could carry a
 * formula that runs when a researcher opens the file. Text that could be read that
 * way gets a leading apostrophe in CSV, which Excel hides and does not run. In an
 * XLSX every text cell is stored as text and is never a formula. */

const FORMULA_START = /^[=+@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function safeText(value) {
  const s = String(value);
  if (FORMULA_START.test(s) || (s.startsWith('-') && !PLAIN_NUMBER.test(s))) return `'${s}`;
  return s;
}

function plain(value, type) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'datetime') { const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toISOString(); }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return safeText(value);
}

export function csvCell(value, type) {
  const text = plain(value, type);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/* A byte order mark first, so Excel reads the file as UTF-8 and not as Windows-1252. */
export function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.header, 'text')).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c.field], c.type)).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/* One cell for write-excel-file, typed so Excel sorts and filters it properly. */
export function xlsxCell(value, type) {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'number') { const n = Number(value); return Number.isFinite(n) ? { value: n, type: Number } : { value: String(value), type: String }; }
  if (type === 'bool') return { value: value === true, type: Boolean };
  if (type === 'datetime' || type === 'date') {
    const d = new Date(type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00Z` : value);
    if (Number.isNaN(d.getTime())) return { value: String(value), type: String };
    return { value: d, type: Date, format: type === 'date' ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm' };
  }
  return { value: String(value), type: String };
}

export function sheetMatrix(columns, rows) {
  const head = columns.map((c) => ({ value: c.header, type: String, fontWeight: 'bold' }));
  return [head, ...rows.map((row) => columns.map((c) => xlsxCell(row[c.field], c.type)))];
}

/* Excel sheet names: at most 31 characters, none of  [ ] : * ? / \ . */
export function sheetName(label) {
  return String(label).replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
}

/* The argument write-excel-file wants for a workbook. `entries` is
 * [{ sheet, rows }]. The data dictionary is added as the last sheet, so a file
 * passed on explains itself. */
export function workbookParts(entries, { dictionary = true } = {}) {
  const parts = entries.map(({ sheet, rows }) => ({
    data: sheetMatrix(sheet.columns, rows),
    sheet: sheetName(sheet.label),
    stickyRowsCount: 1,
    stickyColumnsCount: 1,
    columns: sheet.columns.map((c) => ({ width: Math.max(8, Math.round((c.width ?? 120) / 7)) })),
  }));
  if (dictionary) {
    parts.push({
      data: [DICTIONARY_HEADERS.map((h) => ({ value: h, type: String, fontWeight: 'bold' })),
        ...dictionaryRows(entries.map((e) => e.sheet)).map((r) => r.map((v) => xlsxCell(v, 'text')))],
      sheet: 'Data dictionary',
      stickyRowsCount: 1,
      columns: [18, 22, 24, 10, 28, 90].map((width) => ({ width })),
    });
  }
  return parts;
}

/* bento-research-meals-2026-10-13.csv, with -filtered when a filter was on and
 * -contains-identities when names or emails are inside. */
export function fileName(label, ext, { identities = false, filtered = false, now = new Date() } = {}) {
  const slug = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
  const day = now.toISOString().slice(0, 10);
  return `bento-research-${slug}-${day}${filtered ? '-filtered' : ''}${identities ? '-contains-identities' : ''}.${ext}`;
}

export function anyIdentity(sheets) { return sheets.some((s) => s.identity); }
export const ALL_SHEETS = SHEETS;

/* Browser only. */
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function csvBlob(columns, rows) { return new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }); }

export async function xlsxBlob(entries, options) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  return writeExcelFile(workbookParts(entries, options)).toBlob();
}
