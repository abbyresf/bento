import { useMemo } from 'react';
import SheetView from './SheetView.jsx';
import { SHEETS } from './sheets.js';
import { useLiveSheet } from './useLiveSheet.js';
import { responseRates } from './live.js';

const ACTIVITY = SHEETS.find((s) => s.id === 'activity');
const pct = (r) => (r === null ? 'Nothing due yet' : `${r}%`);

/* The compensation numbers, one row per participant, with response rate beside
 * each group. The rate is also the study's main control: the same figure has to be
 * published next to every waste number, so it is at the top and not buried. */
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
        {[['S', 'Group S'], ['L', 'Group L'], ['all', 'Everyone']].map(([k, label]) => (
          <article className="rs-card" key={k}>
            <h2>{label}</h2>
            <p className="rs-big">{pct(rates[k].rate)}</p>
            <p className="rs-sub">{rates[k].answered} answered of {rates[k].due} due</p>
          </article>
        ))}
      </div>
      <SheetView sheet={ACTIVITY} />
    </div>
  );
}
