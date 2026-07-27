import { useState } from 'react';
import { rateItem } from '../../lib/db';
import StarRating from '../Community/StarRating';
import './MenuRatingOnboarding.css';

const STAPLES = [
  { id: 'staple-margherita-flatbread',  name: 'Margherita Flatbread' },
  { id: 'staple-cottage-cheese',         name: 'Cottage Cheese' },
  { id: 'staple-chocolate-chip-cookie',  name: 'Chocolate Chip Cookie' },
  { id: 'staple-grilled-chicken',        name: 'Grilled Chicken' },
  { id: 'staple-scrambled-eggs',         name: 'Scrambled Eggs' },
  { id: 'staple-stir-fry-rice-bowl',     name: 'Stir-Fry Rice Bowl' },
];

export default function MenuRatingOnboarding({ onDone }) {
  const [ratings, setRatings] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleRate = (item, rating) => {
    setRatings(prev => ({
      ...prev,
      [item.id]: prev[item.id] === rating ? 0 : rating,
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const rated = STAPLES.filter(item => ratings[item.id] > 0);
    await Promise.all(rated.map(item => rateItem(item, ratings[item.id])));
    onDone();
  };

  const anyRated = STAPLES.some(item => ratings[item.id] > 0);

  return (
    <div className="menu-rating-onboarding">
      <h2 className="mro-title">Rate some dining hall staples</h2>
      <p className="mro-sub">
        Seen these before? Rate them to personalize your meal plan from day one.
      </p>

      <div className="mro-list">
        {STAPLES.map(item => (
          <div key={item.id} className="mro-item">
            <span className="mro-item-name">{item.name}</span>
            <StarRating
              rating={ratings[item.id] ?? 0}
              onChange={(r) => handleRate(item, r)}
              size={26}
              color="#f47421"
            />
          </div>
        ))}
      </div>

      <div className="mro-footer">
        <button
          className="mro-skip"
          onClick={onDone}
          disabled={submitting}
        >
          Skip
        </button>
        <button
          className="mro-submit"
          onClick={handleSubmit}
          disabled={!anyRated || submitting}
        >
          {submitting ? 'Saving…' : 'Done'}
        </button>
      </div>
    </div>
  );
}
