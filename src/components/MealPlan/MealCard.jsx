import { useState } from 'react';
import FoodItem from './FoodItem';
import './MealCard.css';

export default function MealCard({
  meal,
  mealTime,
  isPast,
  shermanPlan,
  usdanPlan,
  shermanOpen,
  usdanOpen,
  selectedLocation,
  onLocationChange,
  onSwapItem,
  isConfirmed,
  onConfirm,
}) {
  const [expandedItem, setExpandedItem] = useState(null);

  const currentPlan = selectedLocation === 'sherman' ? shermanPlan : usdanPlan;
  const isCurrentLocationOpen = selectedLocation === 'sherman' ? shermanOpen : usdanOpen;

  if (!currentPlan && !shermanPlan && !usdanPlan) return null;

  const mealLabel = meal.charAt(0).toUpperCase() + meal.slice(1);
  const timeRange = `${mealTime.start > 12 ? mealTime.start - 12 : mealTime.start}${mealTime.start >= 12 ? 'pm' : 'am'} - ${mealTime.end > 12 ? mealTime.end - 12 : mealTime.end}${mealTime.end >= 12 ? 'pm' : 'am'}`;

  const toggleExpanded = (itemId) => {
    setExpandedItem((prev) => (prev === itemId ? null : itemId));
  };

  return (
    <div className={`meal-card meal-${meal} ${isPast ? 'past' : ''} ${isConfirmed ? 'confirmed' : ''}`}>
      <div className="meal-card-header">
        <div className="meal-info">
          <h3>{mealLabel}</h3>
          <span className="meal-time">{timeRange}</span>
          {isPast && <span className="past-badge">Past</span>}
          {isConfirmed && <span className="confirmed-badge">Confirmed</span>}
        </div>

        <div className="location-tabs">
          <button
            className={`location-tab ${selectedLocation === 'sherman' ? 'active' : ''}`}
            onClick={() => onLocationChange('sherman')}
          >
            Sherman
            {!shermanOpen && <span className="closed-dot" title="Closed today" />}
          </button>
          <button
            className={`location-tab ${selectedLocation === 'usdan' ? 'active' : ''}`}
            onClick={() => onLocationChange('usdan')}
          >
            Usdan
            {!usdanOpen && <span className="closed-dot" title="Closed today" />}
          </button>
        </div>
      </div>

      {currentPlan.warnings.length > 0 && (
        <div className="meal-warnings">
          {currentPlan.warnings.map((warning, i) => (
            <div key={i} className="warning">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              {warning}
            </div>
          ))}
        </div>
      )}

      {!isCurrentLocationOpen ? (
        <div className="location-closed">
          <span className="closed-icon">🔒</span>
          <p>Closed today</p>
          <p className="closed-sub">Try the other location</p>
        </div>
      ) : (
        <div className="meal-items">
          {currentPlan?.items.map((item, index) => (
            <FoodItem
              key={item.id}
              item={item}
              isExpanded={expandedItem === item.id}
              onToggleExpand={() => toggleExpanded(item.id)}
              onSwap={() => onSwapItem(index, item)}
              disabled={isConfirmed}
            />
          ))}
        </div>
      )}

      {isCurrentLocationOpen && <div className="meal-card-footer">
        <div className="meal-totals">
          <div className="total-item">
            <span className="total-value">{currentPlan.totals.calories}</span>
            <span className="total-label">cal</span>
          </div>
          <div className="total-item">
            <span className="total-value">{currentPlan.totals.protein}g</span>
            <span className="total-label">protein</span>
          </div>
          <div className="total-item">
            <span className="total-value">{currentPlan.totals.carbs}g</span>
            <span className="total-label">carbs</span>
          </div>
          <div className="total-item">
            <span className="total-value">{currentPlan.totals.fat}g</span>
            <span className="total-label">fat</span>
          </div>
        </div>

        {!isConfirmed && !isPast && (
          <button className="confirm-btn" onClick={onConfirm}>
            Mark as Eaten
          </button>
        )}
      </div>}
    </div>
  );
}
