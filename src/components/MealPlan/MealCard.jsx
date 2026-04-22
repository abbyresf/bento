import { useState, useEffect } from 'react';
import FoodItem from './FoodItem';
import { STATIONS } from '../../data/mockMenu';
import './MealCard.css';

// Display order for station categories within a meal
const CATEGORY_ORDER = ['breakfast', 'entree', 'grill', 'deli', 'pizza', 'allgood', 'sides', 'soup', 'salad', 'bakery', 'beverage'];

function groupItemsByStation(items) {
  const groups = {};
  items.forEach((item, index) => {
    const station = item.station || 'entree';
    if (!groups[station]) groups[station] = [];
    groups[station].push({ item, index });
  });
  // Sort groups by display order, unknown stations go last
  return Object.entries(groups).sort(([a], [b]) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

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
  itemAlternatives,
  onLoadAlternatives,
  onSwapToItem,
  recommendations,
  onLoadRecommendations,
  onAddItem,
  onRemoveItem,
  isConfirmed,
  onConfirm,
}) {
  const [expandedItem, setExpandedItem] = useState(null);
  const [showRecommendations, setShowRecommendations] = useState(false);

  const currentPlan = selectedLocation === 'sherman' ? shermanPlan : usdanPlan;
  const isCurrentLocationOpen = selectedLocation === 'sherman' ? shermanOpen : usdanOpen;

  // Load recommendations when panel opens
  useEffect(() => {
    if (showRecommendations && recommendations === null) {
      onLoadRecommendations?.();
    }
  }, [showRecommendations]); // eslint-disable-line

  // Close recommendation panel when location changes
  useEffect(() => {
    setShowRecommendations(false);
  }, [selectedLocation]);

  if (!currentPlan && !shermanPlan && !usdanPlan) return null;

  const mealLabel = meal.charAt(0).toUpperCase() + meal.slice(1);
  const timeRange = `${mealTime.start > 12 ? mealTime.start - 12 : mealTime.start}${mealTime.start >= 12 ? 'pm' : 'am'} - ${mealTime.end > 12 ? mealTime.end - 12 : mealTime.end}${mealTime.end >= 12 ? 'pm' : 'am'}`;

  const toggleExpanded = (itemId) => {
    setExpandedItem((prev) => (prev === itemId ? null : itemId));
  };

  const handleAddRecommendation = (item) => {
    onAddItem?.(item);
    setShowRecommendations(false);
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
          {(() => {
            const groups = groupItemsByStation(currentPlan?.items ?? []);
            const showHeaders = groups.length > 1;
            return groups.map(([station, entries]) => (
              <div key={station} className="meal-category-group">
                {showHeaders && (
                  <p className="meal-category-label">{STATIONS[station] || station}</p>
                )}
                {entries.map(({ item, index }) => (
                  <FoodItem
                    key={item.id}
                    item={item}
                    isExpanded={expandedItem === item.id}
                    onToggleExpand={() => toggleExpanded(item.id)}
                    alternatives={itemAlternatives?.[`${selectedLocation}-${meal}-${index}`] ?? null}
                    onLoadAlternatives={() => onLoadAlternatives(meal, selectedLocation, index, item)}
                    onSwapToItem={(newItem) => onSwapToItem(index, newItem)}
                    onRemove={!isConfirmed ? () => onRemoveItem?.(item.id) : undefined}
                    disabled={isConfirmed}
                  />
                ))}
              </div>
            ));
          })()}

          {!isConfirmed && !isPast && (
            <div className="add-item-section">
              <button
                className={`add-item-btn ${showRecommendations ? 'active' : ''}`}
                onClick={() => setShowRecommendations((prev) => !prev)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add to plate
              </button>

              {showRecommendations && (
                <div className="recommendations-panel">
                  <p className="recommendations-label">Recommended for you</p>
                  {recommendations === null ? (
                    <p className="recs-loading">Finding the best match…</p>
                  ) : recommendations.length === 0 ? (
                    <p className="recs-empty">No recommendations available</p>
                  ) : (
                    <div className="recommendations-list">
                      {recommendations.map((rec) => (
                        <button
                          key={rec.id}
                          className="rec-item"
                          onClick={() => handleAddRecommendation(rec)}
                        >
                          <div className="rec-item-info">
                            <span className="rec-name">{rec.name}</span>
                            <span className="rec-reason">{rec.reason}</span>
                          </div>
                          <div className="rec-macros">
                            <span>{rec.nutrition.calories} cal</span>
                            <span>{rec.nutrition.protein}g P</span>
                            <span>{rec.nutrition.carbs}g C</span>
                            <span>{rec.nutrition.fat}g F</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isCurrentLocationOpen && <div className="meal-card-footer">
        <div className="meal-totals">
          <div className="total-item">
            <span className="total-value">{currentPlan.totals.calories || 0}</span>
            <span className="total-label">cal</span>
          </div>
          <div className="total-item">
            <span className="total-value">{currentPlan.totals.protein || 0}g</span>
            <span className="total-label">protein</span>
          </div>
          <div className="total-item">
            <span className="total-value">{currentPlan.totals.carbs || 0}g</span>
            <span className="total-label">carbs</span>
          </div>
          <div className="total-item">
            <span className="total-value">{currentPlan.totals.fat || 0}g</span>
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
