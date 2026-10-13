import { useEffect, useMemo, useRef, useState } from 'react';
import Grid from './Grid.jsx';
import { useLiveSheet } from './useLiveSheet.js';
import { SHEETS } from './sheets.js';
import { loadSheet, fetchQuestions, logAction } from './data.js';
import { withQuestions, wideRows, highlights } from './survey.js';
import { csvBlob, xlsxBlob, download, fileName, anyIdentity } from './exporting.js';

/* One sheet: the grid, a search box, the column picker, the live indicator and the
 * exports.
 *
 * An export is written to the audit log FIRST. If the log refuses, nothing is
 * downloaded: the file would be data leaving with no record of it. A file that
 * holds names or emails says so in its file name. The whole sheet is exported with
 * every column, whatever is hidden on screen, so the file is complete. */

const seen = new Set();   // identity sheets already recorded in this session

export default function SheetView({ sheet: base }) {
  const { rows: raw, error, loaded, updatedAt, status, reload } = useLiveSheet(base);
  // The wide survey sheet gets its columns from the questions, read again whenever
  // its rows are, so a renamed column or a new question shows up with the data.
  const [questions, setQuestions] = useState(null);
  useEffect(() => {
    if (!base.wide || raw === null) return undefined;
    let live = true;
    fetchQuestions().then((q) => { if (live) setQuestions(q); }).catch(() => { if (live) setQuestions([]); });
    return () => { live = false; };
  }, [base, raw]);
  const ready = !base.wide || questions !== null;
  const sheet = useMemo(() => (base.wide && questions ? withQuestions(base, questions, raw ?? []) : base), [base, questions, raw]);
  const rows = useMemo(() => {
    if (raw === null || !ready) return null;
    return base.wide ? wideRows(raw, questions ?? []) : raw;
  }, [raw, base, questions, ready]);
  const top = useMemo(() => (base.wide && raw && questions ? highlights(raw, questions) : []), [base, raw, questions]);
  const grid = useRef(null);
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState({ shown: 0, total: 0, filtered: false });
  const [colsOpen, setColsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [hidden, setHidden] = useState(() => new Set());
  const [ignoreFilters, setIgnoreFilters] = useState(false);
  const [withIdentities, setWithIdentities] = useState(false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  // Opening a sheet of names or emails is itself recorded, once per session.
  useEffect(() => {
    if (sheet.identity && !seen.has(sheet.id)) { seen.add(sheet.id); logAction('view_identities', { sheet: sheet.id }); }
  }, [sheet]);

  const toggleColumn = (field) => {
    const next = new Set(hidden);
    if (next.has(field)) next.delete(field); else next.add(field);
    setHidden(next);
    grid.current?.setColumnVisible(field, !next.has(field));
  };

  const run = async (label, work) => {
    setBusy(label); setNote('');
    try { await work(); } catch (e) { setNote(e.message || 'The export failed.'); } finally { setBusy(''); }
  };

  const exportCurrent = (kind) => run(kind, async () => {
    const use = ignoreFilters ? rows : grid.current.displayedRows();
    if (use.length === 0) { setNote('There are no rows to export. Clear the filters or turn on Ignore filters.'); return; }
    const filtered = !ignoreFilters && (counts.filtered || use.length !== rows.length);
    const identities = Boolean(sheet.identity);
    const ok = await logAction('export', { sheet: sheet.id, format: kind, rows: use.length, filtered, identities });
    if (!ok) throw new Error('The export could not be recorded, so no file was made.');
    const name = fileName(sheet.label, kind, { identities, filtered });
    if (kind === 'csv') download(csvBlob(sheet.columns, use), name);
    else download(await xlsxBlob([{ sheet, rows: use }]), name);
    setNote(`${use.length.toLocaleString()} rows exported.`);
  });

  const exportAll = () => run('all', async () => {
    const chosen = SHEETS.filter((s) => withIdentities || !s.identity);
    const entries = [];
    let total = 0;
    for (const s of chosen) {
      setBusy(`Reading ${s.label}`);
      const loaded_ = await loadSheet(s);
      entries.push(loaded_);
      total += loaded_.rows.length;
    }
    const identities = anyIdentity(chosen);
    const ok = await logAction('export', { sheet: 'all', format: 'xlsx', sheets: chosen.map((s) => s.id), rows: total, filtered: false, identities });
    if (!ok) throw new Error('The export could not be recorded, so no file was made.');
    setBusy('Writing the workbook');
    download(await xlsxBlob(entries), fileName('All sheets', 'xlsx', { identities }));
    setNote(`${chosen.length} sheets and the data dictionary exported.`);
  });

  const statusText = status === 'live' ? 'Live' : status === 'offline' ? 'Not live' : 'Connecting';

  return (
    <section className="rs-sheet" aria-label={sheet.label}>
      <div className="rs-toolbar">
        <input className="rs-search" type="search" placeholder="Search this sheet" value={search}
               onChange={(e) => setSearch(e.target.value)} aria-label="Search this sheet" />

        <div className="rs-menu">
          <button type="button" className="rs-btn" aria-expanded={colsOpen} onClick={() => { setColsOpen(!colsOpen); setExportOpen(false); }}>Columns</button>
          {colsOpen && (
            <div className="rs-pop rs-cols" role="group" aria-label="Columns">
              {sheet.columns.map((c) => (
                <label key={c.field} className="rs-check">
                  <input type="checkbox" checked={!hidden.has(c.field)} disabled={c.pinned} onChange={() => toggleColumn(c.field)} />
                  <span>{c.header}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {counts.filtered && <button type="button" className="rs-btn rs-quiet" onClick={() => { grid.current?.clearFilters(); setSearch(''); }}>Clear filters</button>}

        <div className="rs-spacer" />
        <span className={`rs-live rs-live-${status}`} title={updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : ''}>
          <i aria-hidden="true" /> {statusText}
        </span>

        <div className="rs-menu">
          <button type="button" className="rs-btn rs-primary" aria-expanded={exportOpen} disabled={!rows || Boolean(busy)}
                  onClick={() => { setExportOpen(!exportOpen); setColsOpen(false); }}>
            {busy ? 'Working…' : 'Export'}
          </button>
          {exportOpen && (
            <div className="rs-pop rs-export" role="group" aria-label="Export">
              <label className="rs-check"><input type="checkbox" checked={ignoreFilters} onChange={(e) => setIgnoreFilters(e.target.checked)} /><span>Ignore filters (every row)</span></label>
              <button type="button" className="rs-item" onClick={() => { setExportOpen(false); exportCurrent('csv'); }}>This sheet as CSV</button>
              <button type="button" className="rs-item" onClick={() => { setExportOpen(false); exportCurrent('xlsx'); }}>This sheet as Excel</button>
              <hr />
              <label className="rs-check"><input type="checkbox" checked={withIdentities} onChange={(e) => setWithIdentities(e.target.checked)} /><span>Include names and emails</span></label>
              <button type="button" className="rs-item" onClick={() => { setExportOpen(false); exportAll(); }}>All sheets as one Excel file</button>
              <p className="rs-hint">Every export is recorded. A file with names or emails says so in its name.</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rs-alert" role="alert">
          {error} <button type="button" className="rs-link" onClick={reload}>Try again</button>
        </div>
      )}
      {note && <div className="rs-note" role="status">{note}</div>}

      {top.length > 0 && (
        <dl className="rs-highlights" aria-label="Survey highlights">
          {top.map((h) => (<div key={h.label}><dt>{h.label}</dt><dd>{h.value}</dd></div>))}
        </dl>
      )}

      <div className="rs-body">
        {rows === null && !error && <div className="rs-loading">Reading {sheet.label.toLowerCase()}{loaded ? `, ${loaded.toLocaleString()} rows so far` : ''}…</div>}
        {rows !== null && (
          <Grid key={`${sheet.id}:${sheet.columns.length}`} ref={grid} sheet={sheet} rows={rows} quickFilter={search} onCounts={setCounts} />
        )}
      </div>

      <footer className="rs-foot">
        <span>
          {rows === null ? '' : counts.filtered
            ? `${counts.shown.toLocaleString()} of ${counts.total.toLocaleString()} rows`
            : `${counts.total.toLocaleString()} rows`}
        </span>
        <span>{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : ''}</span>
      </footer>
    </section>
  );
}
