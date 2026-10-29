import { useState } from 'react';
import MenuBrowser from './MenuBrowser';
import { setLoad, setSnack } from '../../lib/athlete';
import { LOADS, LOAD_LABELS } from '../../utils/athleteTargets';
import { sumItems } from '../../utils/servingSize.js';
import { useNutritionDisplay } from '../../context/NutritionDisplayContext';
import { haptics } from '../../lib/haptics';
import './AthleteToday.css';

/* Athlete mode on Today: the day's training load, and a snack between meals. */

export function LoadPicker({ date, load, isToday }) {
  const day = isToday ? 'today' : new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
  return (
    <div className="load-picker">
      <span className="load-picker-label" id="load-picker-label">Training {day}</span>
      <div className="load-picker-options" role="radiogroup" aria-labelledby="load-picker-label">
        {LOADS.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={load === l}
            className={`load-option${load === l ? ' active' : ''}`}
            onClick={() => { if (load !== l) { haptics.selection(); setLoad(date, l); } }}>
            {LOAD_LABELS[l]}
          </button>
        ))}
      </div>
    </div>
  );
}

/* One gap in the day. Empty, it is a small plus. With a snack, it shows what is in it. The items come from the menu of the meal
 * next to it and pass the same restriction filter as everything else. */
export function SnackSlot({ date, slot, snack, menuItems, hallLabel, restrictions, canEdit }) {
  const display = useNutritionDisplay();
  const [open, setOpen] = useState(false);

  const done = (items) => {
    setOpen(false);
    setSnack(date, slot, items.length ? { items, totals: sumItems(items), hall: hallLabel ?? null } : null);
  };

  const t = snack?.totals;
  const line = t && [
    display.calories && `${Math.round(t.calories)} cal`,
    display.protein && `${Math.round(t.protein)}g P`,
    display.carbs && `${Math.round(t.carbs)}g C`,
    display.fat && `${Math.round(t.fat)}g F`,
  ].filter(Boolean).join(' · ');

  if (!snack && !canEdit) return null;

  return (
    <div className={`snack-slot${snack ? ' has-snack' : ''}`}>
      {snack ? (
        <div className="snack-card">
          <div className="snack-card-text">
            <h4>Snack</h4>
            <p className="snack-items">{snack.items.map((i) => i.name).join(', ')}</p>
            {line && <p className="snack-totals">{line}</p>}
          </div>
          {canEdit && (
            <div className="snack-actions">
              <button type="button" className="meal-chip" onClick={() => setOpen(true)}>Edit</button>
              <button type="button" className="meal-chip" onClick={() => setSnack(date, slot, null)}>Remove</button>
            </div>
          )}
        </div>
      ) : (
        <button type="button" className="snack-add" onClick={() => setOpen(true)} aria-label="Add a snack">
          <span className="snack-add-plus" aria-hidden="true">+</span>
          <span className="snack-add-text">Add a snack</span>
        </button>
      )}
      {canEdit && (
        <MenuBrowser
          key={`${slot}-${open}`}
          meal="snack"
          title={hallLabel ? `Snack · ${hallLabel}` : 'Snack'}
          locationLabel={hallLabel}
          items={menuItems ?? []}
          restrictions={restrictions}
          initialSelected={snack?.items}
          onDone={done}
          onClose={() => setOpen(false)}
          className={open ? 'open' : ''}
        />
      )}
    </div>
  );
}
