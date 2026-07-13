import { useState } from 'react';
import { useRatings } from '../../context/RatingsContext';
import StarRating from '../Community/StarRating';
import './MyRatings.css';

const STATION_ORDER = ['breakfast', 'entree', 'grill', 'deli', 'pizza', 'allgood', 'sides', 'soup', 'salad', 'bakery', 'beverage'];

export default function MyRatings({ tabMode = false }) {
  const { myRatings, rateItem } = useRatings();
  const [pendingDelete, setPendingDelete] = useState(null);

  const items = Object.entries(myRatings)
    .map(([id, { rating, name }]) => ({ id, name, rating }))
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));

  const handleRate = async (item, newRating) => {
    const next = newRating === item.rating ? null : newRating;
    await rateItem({ id: item.id, name: item.name }, next);
    if (next === null) setPendingDelete(null);
  };

  return (
    <div className={`my-ratings${tabMode ? ' my-ratings-page' : ''}`}>
      <div className="my-ratings-header">
        <h2>My Ratings</h2>
      </div>

      <p className="my-ratings-note">
        Your ratings improve your meal plan suggestions. Items you rate highly get a boost next time Bento builds your plan.
      </p>

      {items.length === 0 ? (
        <div className="my-ratings-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <p className="my-ratings-empty-title">No ratings yet</p>
          <p className="my-ratings-empty-sub">Tap the star on any food item to rate it</p>
        </div>
      ) : (
        <div className="my-ratings-list">
          {items.map(item => (
            <div key={item.id} className="rated-item">
              <span className="rated-item-name">{item.name}</span>
              <div className="rated-item-right">
                <StarRating
                  rating={item.rating}
                  onChange={(r) => handleRate(item, r)}
                  size={18}
                />
                <button
                  className="rated-item-remove"
                  onClick={() => handleRate(item, item.rating)}
                  aria-label="Remove rating"
                  title="Remove rating"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
