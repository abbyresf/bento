import './WeeklySummaryCard.css';

function formatWeekRange(weekStart) {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

export default function WeeklySummaryCard({ summary, targets }) {
  const empty = !summary;

  const macros = [
    { label: 'Calories', value: empty ? null : Math.round(summary.avg_calories ?? 0), target: targets?.calories,        unit: '' },
    { label: 'Protein',  value: empty ? null : Math.round(summary.avg_protein  ?? 0), target: targets?.macros?.protein, unit: 'g' },
    { label: 'Carbs',    value: empty ? null : Math.round(summary.avg_carbs    ?? 0), target: targets?.macros?.carbs,   unit: 'g' },
    { label: 'Fat',      value: empty ? null : Math.round(summary.avg_fat      ?? 0), target: targets?.macros?.fat,     unit: 'g' },
  ];

  return (
    <div className="weekly-summary-card">
      <p className="summary-week-range">
        {empty ? 'This Week' : `Week of ${formatWeekRange(summary.week_start)}`}
      </p>

      <div className="macro-bars">
        {macros.map(({ label, value, target, unit }) => {
          const pct = (value != null && target) ? Math.min(Math.round((value / target) * 100), 100) : 0;
          const over = value != null && target && value > target * 1.05;
          return (
            <div key={label} className="macro-bar-row">
              <span className="macro-bar-label">{label}</span>
              <div className="macro-bar-track">
                <div
                  className={`macro-bar-fill${over ? ' over' : ''}${empty || value == null ? ' empty' : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`macro-bar-values${empty ? ' placeholder-text' : ''}`}>
                {value != null
                  ? `${value}${unit}${target ? ` / ${target}${unit}` : ''}`
                  : target ? `— / ${target}${unit}` : '—'
                }
              </span>
            </div>
          );
        })}
      </div>

      {!empty && (
        <div className="summary-extras">
          {summary.best_day && (
            <span className="summary-extra-chip">
              Best day: <strong>{summary.best_day}</strong>
            </span>
          )}
          {summary.top_foods?.slice(0, 3).map((f, i) => (
            <span key={i} className="summary-extra-chip food-chip">{f.name}</span>
          ))}
        </div>
      )}

      {empty && (
        <div className="summary-extras">
          <span className="summary-extra-chip placeholder-chip">Best day: —</span>
          <span className="summary-extra-chip placeholder-chip food-chip">Top food —</span>
          <span className="summary-extra-chip placeholder-chip food-chip">Top food —</span>
        </div>
      )}
    </div>
  );
}
