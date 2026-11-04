import { useState } from 'react';
import MenuBrowser from './MenuBrowser';
import { setLoad, setSnack, setWater } from '../../lib/athlete';
import { LOADS, LOAD_LABELS } from '../../utils/athleteTargets';
import { sumItems } from '../../utils/servingSize.js';
import { useNutritionDisplay } from '../../context/NutritionDisplayContext';
import { haptics } from '../../lib/haptics';
import './AthleteToday.css';

/* Athlete mode on Today: what kind of training day it is, the day's load, water, and a snack between meals. */

const DAY_LINE = {
  rest: 'Rest day',
  light: 'Light training day',
  heavy: 'Heavy training day. Your plates carry more carbs.',
  double: 'Two-a-day. Your plates carry more carbs. Add a snack between sessions.',
};

/* The line at the top of Today. `source` says where the load came from: the weekly plan, a change made on Today, or neither. */
export function TrainingDayBanner({ date, load, source, isToday, weekAvailable }) {
  const when = isToday ? 'today' : `on ${new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}`;
  const [head, ...rest] = DAY_LINE[load].split('. ');
  const from = source === 'week' ? 'From your training week.'
    : source === 'day' ? 'You set this below.'
    : weekAvailable ? 'Set your usual week in Settings.' : null;
  return (
    <div className={`training-banner training-${load}`} role="status">
      <p className="training-banner-head">{head.replace(/\.$/, '')} {when}.</p>
      {(rest.length > 0 || from) && <p className="training-banner-sub">{[rest.join('. '), from].filter(Boolean).join(' ')}</p>}
    </div>
  );
}

/* Cups of water for the day, with a plus and a minus. The quest rewards days at the goal, never cups past it. */
export function WaterRow({ date, cups, goal, isToday }) {
  const done = cups >= goal;
  // Past 2pm with under half the goal, one plain nudge. Nothing else nags.
  const behind = isToday && !done && new Date().getHours() >= 14 && cups < goal / 2;
  const dots = Math.max(goal, cups);
  return (
    <div className={`water-row${done ? ' done' : ''}`}>
      <div className="water-head">
        <span className="water-title">Water</span>
        <span className="water-count" aria-live="polite">{cups} of {goal} cups{done ? '. Goal reached.' : ''}</span>
      </div>
      <div className="water-controls">
        <button type="button" className="water-step" aria-label="One cup less" disabled={cups === 0}
          onClick={() => setWater(date, cups - 1)}>−</button>
        <div className="water-dots" aria-hidden="true">
          {Array.from({ length: Math.min(dots, 24) }, (_, i) => <span key={i} className={`water-dot${i < cups ? ' full' : ''}`} />)}
        </div>
        <button type="button" className="water-step water-plus" aria-label="One cup more"
          onClick={() => { haptics.selection(); setWater(date, cups + 1); }}>+</button>
      </div>
      {behind && <p className="water-nudge">Grab a glass with your next meal.</p>}
    </div>
  );
}

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
