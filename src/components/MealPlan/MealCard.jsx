import { useState, useEffect, useRef } from 'react';
import FoodItem from './FoodItem';
import { STATIONS } from '../../data/mockMenu';
import './MealCard.css';

const CATEGORY_ORDER = ['breakfast', 'entree', 'grill', 'deli', 'pizza', 'allgood', 'sides', 'soup', 'salad', 'bakery', 'beverage'];

function groupItemsByStation(items) {
  const groups = {};
  items.forEach((item, index) => {
    const station = item.station || 'entree';
    if (!groups[station]) groups[station] = [];
    groups[station].push({ item, index });
  });
  return Object.entries(groups).sort(([a], [b]) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

const LOCATION_OPTIONS = [
  { id: 'usdan',   label: 'Usdan' },
  { id: 'sherman', label: 'Farm Table' },
  { id: 'kosher',  label: 'Kosher Table' },
];

function LocationPicker({ selectedLocation, onLocationChange, openByLocation }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = LOCATION_OPTIONS.find(l => l.id === selectedLocation);
  const isClosed = openByLocation[selectedLocation] === false;

  return (
    <div className="location-picker" ref={ref} onClick={e => e.stopPropagation()}>
      <button
        className={`location-picker-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen(p => !p)}
      >
        {current?.label}
        {isClosed && <span className="closed-dot" title="Closed today" />}
        <svg className={`picker-chevron ${open ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="location-picker-menu">
          {LOCATION_OPTIONS.map(loc => {
            const closed = openByLocation[loc.id] === false;
            return (
              <button
                key={loc.id}
                className={`location-picker-option ${selectedLocation === loc.id ? 'active' : ''}`}
                onClick={() => { onLocationChange(loc.id); setOpen(false); }}
              >
                <span className="option-label">{loc.label}</span>
                {closed && <span className="option-closed">Closed</span>}
                {selectedLocation === loc.id && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MealCard({
  meal,
  mealTime,
  isPast,
  shermanPlan,
  usdanPlan,
  kosherPlan,
  shermanOpen,
  usdanOpen,
  kosherOpen,
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
  isConfirming,
  onConfirm,
  isKosherUser,
}) {
  const [collapsed, setCollapsed] = useState(isPast);
  const [expandedItem, setExpandedItem] = useState(null);
  const [showRecommendations, setShowRecommendations] = useState(false);

  const plansByLocation = { sherman: shermanPlan, usdan: usdanPlan, kosher: kosherPlan };
  const openByLocation  = { sherman: shermanOpen,  usdan: usdanOpen,  kosher: kosherOpen };
  const currentPlan = plansByLocation[selectedLocation] ?? usdanPlan;
  const isCurrentLocationOpen = openByLocation[selectedLocation] ?? true;

  useEffect(() => {
    if (showRecommendations && recommendations === null) {
      onLoadRecommendations?.();
    }
  }, [showRecommendations]); // eslint-disable-line

  useEffect(() => {
    // Reset recommendations panel when the user switches dining location
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowRecommendations(false);
  }, [selectedLocation]);

  if (!currentPlan && !shermanPlan && !usdanPlan && !kosherPlan) return null;

  const allItemsKosher = currentPlan?.items?.length > 0 &&
    currentPlan.items.every(i => i.tags?.includes('kosher'));
  // Show badge: always at Kosher Table (it's certified by definition), or for kosher users at any location when all items are kosher
  const showKosherBadge = allItemsKosher && (selectedLocation === 'kosher' || isKosherUser);

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
    <div className={`meal-card meal-${meal} ${isPast ? 'past' : ''} ${isConfirmed ? 'confirmed' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="meal-card-header" onClick={isPast ? () => setCollapsed(prev => !prev) : undefined} style={isPast ? { cursor: 'pointer' } : undefined}>
        <div className="meal-info">
          <h3>{mealLabel}</h3>
          <span className="meal-time">{timeRange}</span>
          {isPast && <span className="past-badge">Past</span>}
          {isConfirmed && <span className="confirmed-badge">Confirmed</span>}
          {isPast && (
            <svg className={`collapse-chevron ${collapsed ? '' : 'open'}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </div>

        <LocationPicker
          selectedLocation={selectedLocation}
          onLocationChange={onLocationChange}
          openByLocation={openByLocation}
        />
      </div>

      {!collapsed && currentPlan.warnings.length > 0 && (
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

      {!collapsed && (!isCurrentLocationOpen ? (
        <div className="location-closed">
          <span className="closed-icon">🔒</span>
          <p>Closed today</p>
          <p className="closed-sub">Try another location</p>
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
      ))}

      {!collapsed && isCurrentLocationOpen && (
        <div className="meal-card-footer">
          {showKosherBadge && (
            <div className="kosher-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Kosher certified
            </div>
          )}
          <div className="meal-footer-row">
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

            {!isConfirmed && (
              <button className="confirm-btn" onClick={onConfirm} disabled={isConfirming}>
                {isConfirming ? 'Saving...' : 'Mark as Eaten'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
