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

  return (
    <div className="daily-summary">
      <h2>Daily Progress</h2>

      <div className="summary-grid">
        <div className={`summary-item ${getStatusClass(caloriePercent)}`}>
          <div className="summary-header">
            <span className="summary-label">Calories</span>
            <span className="summary-values">
              {totals.calories} / {targets.calories}
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(caloriePercent, 100)}%` }}
            ></div>
          </div>
          <span className="summary-percent">{caloriePercent}%</span>
        </div>

        <div className={`summary-item ${getStatusClass(proteinPercent)}`}>
          <div className="summary-header">
            <span className="summary-label">Protein</span>
            <span className="summary-values">
              {totals.protein}g / {targets.macros.protein}g
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(proteinPercent, 100)}%` }}
            ></div>
          </div>
          <span className="summary-percent">{proteinPercent}%</span>
        </div>

        <div className={`summary-item ${getStatusClass(carbsPercent)}`}>
          <div className="summary-header">
            <span className="summary-label">Carbs</span>
            <span className="summary-values">
              {totals.carbs}g / {targets.macros.carbs}g
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(carbsPercent, 100)}%` }}
            ></div>
          </div>
          <span className="summary-percent">{carbsPercent}%</span>
        </div>

        <div className={`summary-item ${getStatusClass(fatPercent)}`}>
          <div className="summary-header">
            <span className="summary-label">Fat</span>
            <span className="summary-values">
              {totals.fat}g / {targets.macros.fat}g
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(fatPercent, 100)}%` }}
            ></div>
          </div>
          <span className="summary-percent">{fatPercent}%</span>
        </div>
      </div>
    </div>
  );
}
