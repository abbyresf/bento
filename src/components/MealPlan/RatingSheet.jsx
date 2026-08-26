import { useState } from 'react';
import { useRatings } from '../../context/RatingsContext';
import StarRating from '../Community/StarRating';
import './RatingSheet.css';

export default function RatingSheet({ meal, items, diningHall, onClose }) {
  const { myRatings, rateItem } = useRatings();
  const [ratings, setRatings] = useState(() => {
    const init = {};
    items.forEach(item => {
      init[item.id] = myRatings[item.id]?.rating ?? 0;
    });
    return init;
  });
  const [submitting, setSubmitting] = useState(false);

  const mealLabel = meal.charAt(0).toUpperCase() + meal.slice(1);

  const handleRate = (item, rating) => {
    setRatings(prev => ({
      ...prev,
      [item.id]: prev[item.id] === rating ? 0 : rating,
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const rated = items.filter(item => ratings[item.id] > 0);
    await Promise.all(rated.map(item => rateItem(item, ratings[item.id], diningHall ?? null)));
    onClose();
  };

  const anyRated = items.some(item => ratings[item.id] > 0);

  return (
    <div className="rating-sheet-overlay" onClick={onClose}>
      <div className="rating-sheet" onClick={e => e.stopPropagation()}>
        <div className="rating-sheet-handle" />

        <div className="rating-sheet-header">
          <h3>How was {mealLabel}?</h3>
          <p className="rating-sheet-sub">Rate what you ate — it improves your future plans</p>
        </div>

        <div className="rating-sheet-items">
          {items.map(item => (
            <div key={item.id} className="rating-sheet-item">
              <span className="rating-sheet-item-name">{item.name}</span>
              <StarRating
                rating={ratings[item.id]}
                onChange={(r) => handleRate(item, r)}
                size={22}
                color="#f47421"
              />
            </div>
          ))}
        </div>

        <div className="rating-sheet-footer">
          <button className="rating-sheet-skip" onClick={onClose} disabled={submitting}>
            Skip
          </button>
          <button
            className="rating-sheet-submit"
            onClick={handleSubmit}
            disabled={!anyRated || submitting}
          >
            {submitting ? 'Saving…' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
