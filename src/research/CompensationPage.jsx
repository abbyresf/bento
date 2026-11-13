import { useMemo } from 'react';
import SheetView from './SheetView.jsx';
import { SHEETS } from './sheets.js';
import { useLiveSheet } from './useLiveSheet.js';
import { responseRates } from './live.js';

const ACTIVITY = SHEETS.find((s) => s.id === 'activity');
const pct = (r) => (r === null ? 'Nothing due yet' : `${r}%`);

/* The compensation numbers, one row per participant, with the overall response
 * rate at the top. The study has one group, so there is one rate. */
export default function CompensationPage() {
  const { rows } = useLiveSheet(ACTIVITY);
  const rates = useMemo(() => responseRates(rows ?? []), [rows]);

  return (
    <div className="rs-page-fill">
      <header className="rs-pagehead">
        <h1>Compensation</h1>
        <p className="rs-sub">Survey answers over surveys due, per participant. No food data on this sheet.</p>
      </header>
      <div className="rs-cards rs-cards-tight">
        <article className="rs-card">
          <h2>Response rate</h2>
          <p className="rs-big">{pct(rates.all.rate)}</p>
          <p className="rs-sub">{rates.all.answered} answered of {rates.all.due} due</p>
        </article>
      </div>
      <SheetView sheet={ACTIVITY} />
    </div>
  );
}
