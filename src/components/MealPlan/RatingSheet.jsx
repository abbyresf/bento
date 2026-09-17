import { useState } from 'react';
import { useRatings } from '../../context/RatingsContext';
import { setMealConsumption } from '../../lib/db';
import { formatServing, servingsOf } from '../../utils/servingSize.js';
import StarRating from '../Community/StarRating';
import './RatingSheet.css';

/* Post-confirmation sheet: how good was it, and how much of it did you eat.
 *
 * The consumption scale is deliberately quarters rather than a free 0 to 100.
 * Quarter-waste is the standard instrument in plate-waste research, and it is
 * the only resolution people can actually judge: nobody can tell 60% from 70%
 * of a bowl, so a finer scale buys precision that is not really there.
 *
 * Nothing here is required. An untouched slider records nothing at all, rather
 * than defaulting to a number the student never chose. */

const STEPS = [
  { value: 0,    label: 'None of it' },
  { value: 0.25, label: 'A quarter'  },
  { value: 0.5,  label: 'Half'       },
  { value: 0.75, label: 'Most of it' },
  { value: 1,    label: 'All of it'  },
];

export default function RatingSheet({ meal, items, diningHall, historyRowId, onClose }) {
  const { myRatings, rateItem } = useRatings();
  const [ratings, setRatings] = useState(() => {
    const init = {};
    items.forEach(item => {
      init[item.id] = myRatings[item.id]?.rating ?? 0;
    });
    return init;
  });
  // Index into STEPS. Starts at "All of it" because that is the common honest
  // answer, but only counts once the student moves or taps it.
  const [eaten, setEaten] = useState(() =>
    Object.fromEntries(items.map(item => [item.id, STEPS.length - 1]))
  );
  const [answered, setAnswered] = useState(() => new Set());
  const [submitting, setSubmitting] = useState(false);

  const mealLabel = meal.charAt(0).toUpperCase() + meal.slice(1);

  const handleRate = (item, rating) => {
    setRatings(prev => ({
      ...prev,
      [item.id]: prev[item.id] === rating ? 0 : rating,
    }));
  };

  const handleEaten = (item, index) => {
    setEaten(prev => ({ ...prev, [item.id]: index }));
    setAnswered(prev => new Set(prev).add(item.id));
  };

  const handleSubmit = async () => {
    setSubmitting(true);

    const rated = items.filter(item => ratings[item.id] > 0);
    const consumed = Object.fromEntries(
      items.filter(item => answered.has(item.id))
           .map(item => [item.id, STEPS[eaten[item.id]].value])
    );

    await Promise.all([
      ...rated.map(item => rateItem(item, ratings[item.id], diningHall ?? null)),
      Object.keys(consumed).length > 0
        ? setMealConsumption(historyRowId, consumed)
        : Promise.resolve(),
    ]);
    onClose();
  };

  const anyRated = items.some(item => ratings[item.id] > 0);
  const anythingToSave = anyRated || answered.size > 0;

  return (
    <div className="rating-sheet-overlay" onClick={onClose}>
      <div className="rating-sheet" onClick={e => e.stopPropagation()}>
        <div className="rating-sheet-handle" />

        <div className="rating-sheet-header">
          <h3>How was {mealLabel}?</h3>
          <p className="rating-sheet-sub">Rate what you ate. It improves your future plans.</p>
        </div>

        <div className="rating-sheet-items">
          {items.map(item => {
            const servings = servingsOf(item);
            // The amount taken is the denominator. Without it "half" means
            // nothing, because half of two servings is not half of one.
            const took = formatServing(item.serving, servings);
            const isAnswered = answered.has(item.id);
            const stepIndex = eaten[item.id];

            return (
              <div key={item.id} className="rating-sheet-item">
                <div className="rating-sheet-item-top">
                  <span className="rating-sheet-item-name">{item.name}</span>
                  <StarRating
                    rating={ratings[item.id]}
                    onChange={(r) => handleRate(item, r)}
                    size={22}
                    color="#f47421"
                  />
                </div>

                <div className={`eaten${isAnswered ? ' answered' : ''}`}>
                  <div className="eaten-head">
                    <span className="eaten-q">
                      How much did you eat{took ? <> of your <strong>{took}</strong></> : null}?
                    </span>
                    <span className="eaten-answer">
                      {isAnswered ? STEPS[stepIndex].label : 'Tap to answer'}
                    </span>
                  </div>
                  <input
                    type="range"
                    className="eaten-range"
                    min="0"
                    max={STEPS.length - 1}
                    step="1"
                    value={stepIndex}
                    onChange={(e) => handleEaten(item, Number(e.target.value))}
                    aria-label={`How much of ${item.name} did you eat`}
                    aria-valuetext={isAnswered ? STEPS[stepIndex].label : 'Not answered'}
                  />
                  <div className="eaten-scale" aria-hidden="true">
                    <span>None</span><span>Half</span><span>All</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rating-sheet-footer">
          <button className="rating-sheet-skip" onClick={onClose} disabled={submitting}>
            Skip
          </button>
          <button
            className="rating-sheet-submit"
            onClick={handleSubmit}
            disabled={!anythingToSave || submitting}
          >
            {submitting ? 'Saving…' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
