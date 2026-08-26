import { useState, useEffect, useRef } from 'react';
import FoodItem from './FoodItem';
import MenuBrowser from './MenuBrowser';
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

function LocationPicker({ locationOptions, selectedLocation, onLocationChange, openByLocation, hasMenuByLocation }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = locationOptions.find(l => l.id === selectedLocation);
  const isClosed = openByLocation[selectedLocation] === false || hasMenuByLocation[selectedLocation] === false;

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
          {locationOptions.map(loc => {
            const closed = openByLocation[loc.id] === false || hasMenuByLocation[loc.id] === false;
            return (
              <button
                key={loc.id}
                className={`location-picker-option ${selectedLocation === loc.id ? 'active' : ''} ${closed ? 'unavailable' : ''}`}
                onClick={() => { if (!closed) { onLocationChange(loc.id); setOpen(false); } }}
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
  locationOptions,
  locationData,
  customPlan,
  onBrowserDone,
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
  onUndo,
  isKosherUser,
}) {
  const [collapsed, setCollapsed] = useState(isPast);
  const [expandedItem, setExpandedItem] = useState(null);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [mode, setMode] = useState(() => customPlan ? 'manual' : 'bento');
  const prevIsPastRef = useRef(isPast);

  useEffect(() => {
    if (isPast && !prevIsPastRef.current) setCollapsed(true);
    prevIsPastRef.current = isPast;
  }, [isPast]);

  useEffect(() => {
    if (isConfirmed) setCollapsed(true);
  }, [isConfirmed]);

  useEffect(() => {
    setShowRecommendations(false);
  }, [selectedLocation]);

  const plansByLocation     = Object.fromEntries((locationOptions ?? []).map(l => [l.id, locationData?.[l.id]?.plan]));
  const openByLocation      = Object.fromEntries((locationOptions ?? []).map(l => [l.id, locationData?.[l.id]?.isOpen ?? true]));
  const rawItemsByLocation  = Object.fromEntries((locationOptions ?? []).map(l => [l.id, locationData?.[l.id]?.rawItems ?? []]));
  const hasMenuByLocation   = Object.fromEntries((locationOptions ?? []).map(l => [l.id, (locationData?.[l.id]?.rawCount ?? 0) > 0]));
  const currentRawCount     = locationData?.[selectedLocation]?.rawCount ?? 0;
  const firstLocId          = locationOptions?.[0]?.id;
  const bentoPlan           = plansByLocation[selectedLocation] ?? (firstLocId ? plansByLocation[firstLocId] : undefined);
  const isCurrentLocationOpen = openByLocation[selectedLocation] ?? true;
  const locationLabel       = (locationOptions ?? []).find(l => l.id === selectedLocation)?.label ?? selectedLocation;

  // Totals shown in footer depend on mode
  const footerTotals = (mode === 'manual' && customPlan)
    ? customPlan.totals
    : bentoPlan?.totals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };

  useEffect(() => {
    if (showRecommendations && recommendations === null) onLoadRecommendations?.();
  }, [showRecommendations]); // eslint-disable-line

  if (!bentoPlan && !Object.values(plansByLocation).some(Boolean)) return null;

  // No location is wholly kosher any more — the kosher table is one of two
  // inside Sherman — so the badge is earned by the plate itself, and only
  // matters to a student who keeps kosher.
  const allItemsKosher = bentoPlan?.items?.length > 0 && bentoPlan.items.every(i => i.tags?.includes('kosher'));
  const showKosherBadge = allItemsKosher && isKosherUser;

  const mealLabel = meal.charAt(0).toUpperCase() + meal.slice(1);
  const timeRange = `${mealTime.start > 12 ? mealTime.start - 12 : mealTime.start}${mealTime.start >= 12 ? 'pm' : 'am'} – ${mealTime.end > 12 ? mealTime.end - 12 : mealTime.end}${mealTime.end >= 12 ? 'pm' : 'am'}`;

  const switchToBento = () => {
    setMode('bento');
    onBrowserDone([]); // clear any custom selection
    setShowRecommendations(false);
  };

  const switchToManual = () => {
    setMode('manual');
    setShowRecommendations(false);
  };

  const locationAvailable = isCurrentLocationOpen && currentRawCount > 0;

  return (
    <div className={`meal-card meal-${meal} ${isPast ? 'past' : ''} ${isConfirmed ? 'confirmed' : ''} ${collapsed ? 'collapsed' : ''}`}>

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="meal-card-header" onClick={() => setCollapsed(prev => !prev)} style={{ cursor: 'pointer' }}>
        <div className="meal-header-left">
          <div className="meal-title-row">
            <h3>{mealLabel}</h3>
            <span className="meal-time">{timeRange}</span>
          </div>
          {(isPast || isConfirmed) && (
            <div className="meal-badges-row">
              {isPast && !isConfirmed && <span className="past-badge">Past</span>}
              {isConfirmed && <span className="confirmed-badge">Confirmed</span>}
              {isConfirmed && (
                <button className="undo-btn" onClick={e => { e.stopPropagation(); setCollapsed(false); onUndo(); }}>Undo</button>
              )}
            </div>
          )}
        </div>
        <div className="meal-header-right">
          <LocationPicker
            locationOptions={locationOptions ?? []}
            selectedLocation={selectedLocation}
            onLocationChange={onLocationChange}
            openByLocation={openByLocation}
            hasMenuByLocation={hasMenuByLocation}
          />
          {!isConfirmed && (
            <svg className={`collapse-chevron ${collapsed ? '' : 'open'}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </div>
      </div>

      {/* ── Closed / no menu states ──────────────────────────── */}
      {!collapsed && !isCurrentLocationOpen && (
        <div className="location-closed">
          <span className="closed-icon">🔒</span>
          <p>Closed today</p>
          <p className="closed-sub">Try another location</p>
        </div>
      )}
      {!collapsed && isCurrentLocationOpen && currentRawCount === 0 && (
        <div className="location-closed">
          <p>No {meal} menu posted at this location today.</p>
          <p className="closed-sub">Try switching to another dining hall above.</p>
        </div>
      )}

      {/* ── Mode selector ────────────────────────────────────── */}
      {!collapsed && locationAvailable && !isConfirmed && (
        <div className="meal-mode-selector">
          <button
            className={`mode-tab ${mode === 'bento' ? 'active' : ''}`}
            onClick={switchToBento}
          >
            Bento's Pick
          </button>
          <button
            className={`mode-tab ${mode === 'manual' ? 'active' : ''}`}
            onClick={switchToManual}
          >
            Build My Plate
          </button>
        </div>
      )}

      {/* ── Bento's Pick content ─────────────────────────────── */}
      {!collapsed && locationAvailable && mode === 'bento' && (
        <>
          {bentoPlan.warnings?.length > 0 && (
            <div className="meal-warnings">
              {bentoPlan.warnings.map((warning, i) => (
                <div key={i} className="warning">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  {warning}
                </div>
              ))}
            </div>
          )}

          <div className="meal-items">
            {(() => {
              const groups = groupItemsByStation(bentoPlan?.items ?? []);
              const showHeaders = groups.length > 1;
              return groups.map(([station, entries]) => (
                <div key={station} className="meal-category-group">
                  {showHeaders && <p className="meal-category-label">{STATIONS[station] || station}</p>}
                  {entries.map(({ item, index }) => (
                    <FoodItem
                      key={item.id}
                      item={item}
                      isExpanded={expandedItem === item.id}
                      onToggleExpand={() => setExpandedItem(prev => prev === item.id ? null : item.id)}
                      alternatives={itemAlternatives?.[`${selectedLocation}-${meal}-${index}`] ?? null}
                      onLoadAlternatives={() => onLoadAlternatives(meal, selectedLocation, index, item)}
                      onSwapToItem={(newItem) => onSwapToItem(index, newItem)}
                      onRemove={() => onRemoveItem?.(item.id)}
                      disabled={false}
                    />
                  ))}
                </div>
              ));
            })()}

            <div className="add-item-section">
              <button
                className={`add-item-btn ${showRecommendations ? 'active' : ''}`}
                onClick={() => setShowRecommendations(prev => !prev)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
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
                      {recommendations.map(rec => (
                        <button key={rec.id} className="rec-item" onClick={() => { onAddItem?.(rec); setShowRecommendations(false); }}>
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
          </div>
        </>
      )}

      {/* ── Build My Plate content ───────────────────────────── */}
      {!collapsed && locationAvailable && mode === 'manual' && (
        customPlan ? (
          <div className="manual-plate">
            <div className="manual-items-list">
              {customPlan.items.map(item => (
                <div key={item.id} className="manual-item-row">
                  <span className="manual-item-name">{item.name}</span>
                  <span className="manual-item-cal">{item.nutrition?.calories ?? 0} cal</span>
                </div>
              ))}
            </div>
            <button className="edit-plate-btn" onClick={() => setShowBrowser(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit selection
            </button>
          </div>
        ) : (
          <div className="manual-empty-state">
            <p className="manual-empty-text">Browse the full menu and add what you're eating</p>
            <button className="browse-menu-btn" onClick={() => setShowBrowser(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Browse Menu
            </button>
          </div>
        )
      )}

      {/* ── Footer ───────────────────────────────────────────── */}
      {!collapsed && locationAvailable && (
        <div className="meal-card-footer">
          {showKosherBadge && mode === 'bento' && (
            <div className="kosher-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Kosher certified
            </div>
          )}
          <div className="meal-totals">
            <div className="total-item">
              <span className="total-value">{footerTotals.calories || 0}</span>
              <span className="total-label">cal</span>
            </div>
            <div className="total-item">
              <span className="total-value">{footerTotals.protein || 0}g</span>
              <span className="total-label">protein</span>
            </div>
            <div className="total-item">
              <span className="total-value">{footerTotals.carbs || 0}g</span>
              <span className="total-label">carbs</span>
            </div>
            <div className="total-item">
              <span className="total-value">{footerTotals.fat || 0}g</span>
              <span className="total-label">fat</span>
            </div>
          </div>

          {!isConfirmed && (
            <button
              className="confirm-btn"
              onClick={onConfirm}
              disabled={isConfirming || (mode === 'manual' && !customPlan)}
              title={mode === 'manual' && !customPlan ? 'Browse the menu to build your plate first' : undefined}
            >
              {isConfirming ? 'Saving…' : 'Mark as Eaten!'}
            </button>
          )}
        </div>
      )}

      {/* ── MenuBrowser panel ────────────────────────────────── */}
      <MenuBrowser
        key={`${meal}-${selectedLocation}`}
        meal={meal}
        locationLabel={locationLabel}
        items={rawItemsByLocation[selectedLocation]}
        initialSelected={customPlan?.items}
        onDone={(items) => { onBrowserDone(items); setShowBrowser(false); }}
        onClose={() => setShowBrowser(false)}
        className={showBrowser ? 'open' : ''}
      />
    </div>
  );
}
