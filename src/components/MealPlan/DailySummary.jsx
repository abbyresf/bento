import './DailySummary.css';

export default function DailySummary({ totals, targets }) {
  const getPercentage = (current, target) => {
    if (!target) return 0;
    return Math.min(Math.round((current / target) * 100), 150);
  };

  const getStatusClass = (percentage) => {
    if (percentage < 80) return 'under';
    if (percentage > 110) return 'over';
    return 'good';
  };

  const caloriePercent = getPercentage(totals.calories, targets.calories);
  const proteinPercent = getPercentage(totals.protein, targets.macros.protein);
  const carbsPercent = getPercentage(totals.carbs, targets.macros.carbs);
  const fatPercent = getPercentage(totals.fat, targets.macros.fat);

  const MacroItem = ({ label, percent, values }) => (
    <div className={`summary-item ${getStatusClass(percent)}`}>
      <div className="summary-header">
        <span className="summary-label">{label}</span>
        <span className="summary-percent">{percent}%</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <span className="summary-values">{values}</span>
    </div>
  );

  return (
    <div className="daily-summary">
      <h2>Daily Progress</h2>
      <div className="summary-grid">
        <MacroItem label="Calories" percent={caloriePercent} values={`${totals.calories} / ${targets.calories}`} />
        <MacroItem label="Protein" percent={proteinPercent} values={`${totals.protein}g / ${targets.macros.protein}g`} />
        <MacroItem label="Carbs" percent={carbsPercent} values={`${totals.carbs}g / ${targets.macros.carbs}g`} />
        <MacroItem label="Fat" percent={fatPercent} values={`${totals.fat}g / ${targets.macros.fat}g`} />
      </div>
    </div>
  );
}
