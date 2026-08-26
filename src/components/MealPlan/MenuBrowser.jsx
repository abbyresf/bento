import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { STATIONS } from '../../data/mockMenu';
import './MenuBrowser.css';

const CATEGORY_ORDER = ['breakfast', 'entree', 'grill', 'deli', 'pizza', 'allgood', 'sides', 'soup', 'salad', 'bakery', 'beverage'];

export default function MenuBrowser({ meal, locationLabel, items, initialSelected, onDone, onClose, className = '' }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set(initialSelected?.map(i => i.id) ?? []));

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(item => item.name.toLowerCase().includes(q));
  }, [items, search]);

  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(item => {
      const station = item.station || 'entree';
      if (!groups[station]) groups[station] = [];
      groups[station].push(item);
    });
    return Object.entries(groups).sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [filtered]);

  const selectedItems = items.filter(item => selected.has(item.id));
  const totals = selectedItems.reduce((acc, item) => ({
    calories: acc.calories + (item.nutrition?.calories || 0),
    protein:  acc.protein  + (item.nutrition?.protein  || 0),
    carbs:    acc.carbs    + (item.nutrition?.carbs    || 0),
    fat:      acc.fat      + (item.nutrition?.fat      || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const mealLabel = meal.charAt(0).toUpperCase() + meal.slice(1);

  return createPortal(
    <div className={`menu-browser ${className}`}>
      <div className="browser-header">
        <button className="browser-back" onClick={onClose} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="browser-title">
          <span className="browser-meal">{mealLabel} · Browse Menu</span>
          <span className="browser-location">{locationLabel}</span>
        </div>
      </div>

      <div className="browser-search-wrap">
        <svg className="browser-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="browser-search"
          type="text"
          placeholder="Search menu…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="browser-search-clear" onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      <div className="browser-list">
        {grouped.length === 0 && (
          <p className="browser-empty">No items match "{search}"</p>
        )}
        {grouped.map(([station, stationItems]) => (
          <div key={station} className="browser-station">
            <p className="browser-station-label">{STATIONS[station] || station}</p>
            {stationItems.map(item => {
              const isSelected = selected.has(item.id);
              return (
                <div key={item.id} className={`browser-item ${isSelected ? 'selected' : ''}`}>
                  <div className="browser-item-info">
                    <span className="browser-item-name">
                      {item.name}
                      {item.source && <span className="browser-item-source">{item.source}</span>}
                    </span>
                    <span className="browser-item-macros">
                      {item.nutrition?.calories || 0} cal · {item.nutrition?.protein || 0}g P · {item.nutrition?.carbs || 0}g C · {item.nutrition?.fat || 0}g F
                    </span>
                  </div>
                  <button
                    className={`browser-add-btn ${isSelected ? 'added' : ''}`}
                    onClick={() => toggle(item.id)}
                    aria-label={isSelected ? 'Remove' : 'Add'}
                  >
                    {isSelected ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="browser-footer">
        {selected.size > 0 ? (
          <div className="browser-totals">
            <span className="browser-total-item"><strong>{totals.calories}</strong> cal</span>
            <span className="browser-total-sep">·</span>
            <span className="browser-total-item"><strong>{totals.protein}g</strong> protein</span>
            <span className="browser-total-sep">·</span>
            <span className="browser-total-item"><strong>{totals.carbs}g</strong> carbs</span>
            <span className="browser-total-sep">·</span>
            <span className="browser-total-item"><strong>{totals.fat}g</strong> fat</span>
          </div>
        ) : (
          <p className="browser-hint">Tap + to add what you're eating</p>
        )}
        <button className="browser-done" onClick={() => onDone(selectedItems)}>
          {selected.size > 0
            ? `Save My Plate · ${selected.size} item${selected.size !== 1 ? 's' : ''}`
            : 'Close'}
        </button>
      </div>
    </div>,
    document.body
  );
}
