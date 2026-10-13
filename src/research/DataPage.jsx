import SheetView from './SheetView.jsx';
import { SHEETS, sheetById } from './sheets.js';

/* All the sheets, as tabs, like the sheets of a workbook. The chosen sheet is in
 * the address, so a link or a reload comes back to the same one. */
export default function DataPage({ sheetId, onPick }) {
  const sheet = sheetById(sheetId) && sheetId !== 'audit' ? sheetById(sheetId) : SHEETS[0];
  return (
    <div className="rs-page-fill">
      <div className="rs-tabs" role="tablist" aria-label="Sheets">
        {SHEETS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === sheet.id}
                  className={`rs-tab${s.id === sheet.id ? ' is-active' : ''}`} onClick={() => onPick(s.id)}>
            {s.label}{s.identity ? <span className="rs-tag" title="Holds names or emails">names</span> : null}
          </button>
        ))}
      </div>
      <SheetView key={sheet.id} sheet={sheet} />
    </div>
  );
}
