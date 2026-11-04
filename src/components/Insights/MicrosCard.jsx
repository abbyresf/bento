import { useEffect, useState } from 'react';
import { getMicroWeek } from '../../lib/db';
import { microSummary } from '../../utils/micros';
import { useAthlete, useAthleteAvailable } from '../../lib/athlete';
import './MicrosCard.css';

/* Calcium, iron and potassium from the last 7 days of confirmed meals, in Athlete mode. Shown as a daily average and a share
 * of the Daily Value on food labels (utils/micros.js). Hidden until the read succeeds, and when no confirmed dish listed any. */
export default function MicrosCard() {
  const { athleteMode } = useAthlete();
  const on = useAthleteAvailable() && athleteMode;
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!on) return;
    let live = true;
    getMicroWeek().then((r) => { if (live) setRows(r); }).catch(() => {});
    return () => { live = false; };
  }, [on]);

  if (!on || !rows) return null;
  const { days, micros } = microSummary(rows);
  const shown = micros.filter((m) => m.perDay != null);
  if (!days || !shown.length) return null;
  const thin = shown.some((m) => m.coverage < 0.75);

  return (
    <div className="micros-card">
      <div className="micros-head">
        <p className="micros-title">Minerals</p>
        <span className="micros-sub">Daily average, last 7 days</span>
      </div>
      <ul className="micros-list">
        {shown.map((m) => (
          <li key={m.key} className="micros-row">
            <div className="micros-row-top">
              <span className="micros-label">{m.label}</span>
              <span className="micros-value">
                {m.key === 'iron' ? m.perDay : Math.round(m.perDay).toLocaleString()} mg · {m.percentDv}% DV
              </span>
            </div>
            <div className="micros-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, m.percentDv)}%` }} /></div>
          </li>
        ))}
      </ul>
      <p className="micros-note">
        From the meals you confirmed on {days} {days === 1 ? 'day' : 'days'}. DV is the Daily Value on food labels, one number
        for everyone.{thin ? ' Some dishes do not list these, so the totals may read low.' : ''}
      </p>
    </div>
  );
}
