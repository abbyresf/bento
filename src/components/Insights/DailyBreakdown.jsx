import { useState } from 'react';
import './DailyBreakdown.css';

const MACROS = [
  { key: 'calories', label: 'Calories', unit: '' },
  { key: 'protein',  label: 'Protein',  unit: 'g' },
  { key: 'carbs',    label: 'Carbs',    unit: 'g' },
  { key: 'fat',      label: 'Fat',      unit: 'g' },
];

export default function DailyBreakdown({ days, targets }) {
  const [selected, setSelected] = useState('calories');

  const macro = MACROS.find(m => m.key === selected);
  const target = selected === 'calories'
    ? targets?.calories
    : targets?.macros?.[selected];

  const empty = !days?.length;

  const displayDays = empty
    ? Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return {
          date: String(i),
          dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
          hasData: false,
        };
      })
    : days;

  return (
    <div className="daily-breakdown-card">
      <div className="db-header">
        <p className="insights-section-label">Daily Breakdown</p>
        <div className="db-picker">
          {MACROS.map(m => (
            <button
              key={m.key}
              className={`db-pill${selected === m.key ? ' active' : ''}`}
              onClick={() => setSelected(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="db-rows">
        {displayDays.map(day => {
          const value = day[selected];
          const hasValue = day.hasData && value != null && value > 0;
          const pct = (hasValue && target) ? Math.min(Math.round((value / target) * 100), 100) : 0;
          const over = hasValue && target && value > target * 1.05;
          return (
            <div key={day.date} className="db-row">
              <span className="db-day-label">{day.dayLabel}</span>
              <div className="db-bar-track">
                <div
                  className={`db-bar-fill${over ? ' over' : ''}${!hasValue ? ' empty' : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`db-bar-value${!hasValue ? ' placeholder-text' : ''}`}>
                {hasValue
                  ? `${Math.round(value)}${macro.unit}${target ? ` / ${target}${macro.unit}` : ''}`
                  : target ? `— / ${target}${macro.unit}` : '—'
                }
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
