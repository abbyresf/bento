import { useNutritionDisplay } from '../../context/NutritionDisplayContext';
import './DailySummary.css';

export default function DailySummary({ totals, targets }) {
  const display = useNutritionDisplay();

  const getPercentage = (current, target) => {
    if (!target) return 0;
    return Math.min(Math.round((current / target) * 100), 150);
  };

  const getStatusClass = (percentage) => {
    if (percentage < 80) return 'under';
    if (percentage > 110) return 'over';
    return 'good';
  };

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

  // A hidden metric loses its progress bar too, not just its digits: a bar
  // filled to 93% is still a number, and for someone avoiding calorie
  // tracking it is the same information in a softer form.
  const metrics = [
    display.calories && { key: 'calories', label: 'Calories', percent: getPercentage(totals.calories, targets.calories), values: `${totals.calories} / ${targets.calories}` },
    display.protein  && { key: 'protein',  label: 'Protein',  percent: getPercentage(totals.protein, targets.macros.protein), values: `${totals.protein}g / ${targets.macros.protein}g` },
    display.carbs    && { key: 'carbs',    label: 'Carbs',    percent: getPercentage(totals.carbs, targets.macros.carbs),   values: `${totals.carbs}g / ${targets.macros.carbs}g` },
    display.fat      && { key: 'fat',      label: 'Fat',      percent: getPercentage(totals.fat, targets.macros.fat),       values: `${totals.fat}g / ${targets.macros.fat}g` },
  ].filter(Boolean);

  // With everything hidden the heading alone would still frame the day as
  // something to measure, so the whole card goes.
  if (metrics.length === 0) return null;

  return (
    <div className="daily-summary">
      <h2>Daily Progress</h2>
      <div className="summary-grid">
        {metrics.map(m => (
          <MacroItem key={m.key} label={m.label} percent={m.percent} values={m.values} />
        ))}
      </div>
    </div>
  );
}
