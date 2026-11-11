import { useState } from 'react';
import { rateItem } from '../../lib/db';
import StarRating from '../Community/StarRating';
import ThreeChoice from '../Loud/ThreeChoice';
import { loudOn } from '../Loud/loudFlag';

const LOUD = loudOn();
import './MenuRatingOnboarding.css';

const STAPLES_BY_UNIVERSITY = {
  brandeis: [
    { id: 'staple-margherita-flatbread',  name: 'Margherita Flatbread' },
    { id: 'staple-cottage-cheese',         name: 'Cottage Cheese' },
    { id: 'staple-chocolate-chip-cookie',  name: 'Chocolate Chip Cookie' },
    { id: 'staple-grilled-chicken',        name: 'Grilled Chicken' },
    { id: 'staple-scrambled-eggs',         name: 'Scrambled Eggs' },
    { id: 'staple-stir-fry-rice-bowl',     name: 'Stir-Fry Rice Bowl' },
  ],
  tufts: [
    { id: 'staple-tu-french-fries',        name: 'French Fries' },
    { id: 'staple-tu-grilled-chicken',     name: 'Grilled Chicken' },
    { id: 'staple-tu-scrambled-eggs',      name: 'Scrambled Eggs' },
    { id: 'staple-tu-cottage-cheese',      name: 'Cottage Cheese' },
    { id: 'staple-tu-choc-chip-cookie',    name: 'Chocolate Chip Cookie' },
    { id: 'staple-tu-stir-fry-rice-bowl',  name: 'Stir-Fry Rice Bowl' },
  ],
  // Dishes that appear on BU's own menus (Warren, Marciano, West, Granby).
  bu: [
    { id: 'staple-bu-scrambled-eggs',      name: 'Scrambled Eggs' },
    { id: 'staple-bu-lemon-chicken',       name: 'Lemon Grilled Chicken Breast' },
    { id: 'staple-bu-smash-burger',        name: 'Signature Smash Burger' },
    { id: 'staple-bu-white-rice',          name: 'White Rice' },
    { id: 'staple-bu-hummus',              name: 'Hummus' },
    { id: 'staple-bu-plain-yogurt',        name: 'Plain Yogurt' },
  ],
};

const DEFAULT_STAPLES = [
  { id: 'staple-grilled-chicken',    name: 'Grilled Chicken' },
  { id: 'staple-scrambled-eggs',     name: 'Scrambled Eggs' },
  { id: 'staple-cottage-cheese',     name: 'Cottage Cheese' },
  { id: 'staple-choc-chip-cookie',   name: 'Chocolate Chip Cookie' },
  { id: 'staple-stir-fry-rice-bowl', name: 'Stir-Fry Rice Bowl' },
  { id: 'staple-garden-salad',       name: 'Garden Salad' },
];

/* In the Loud pilot the wizard owns the answers (`saved`, `onSave`), so leaving this step and coming back keeps them,
 * and there is a Back button. Off the pilot it behaves as it always has. */
export default function MenuRatingOnboarding({ onDone, university, onBack, saved, onSave }) {
  const staples = STAPLES_BY_UNIVERSITY[university] ?? DEFAULT_STAPLES;
  const [ownRatings, setOwnRatings] = useState({});
  const ratings = LOUD && saved ? saved : ownRatings;
  const setRatings = LOUD && onSave ? (fn) => onSave(fn(ratings)) : setOwnRatings;
  const [submitting, setSubmitting] = useState(false);

  const handleRate = (item, rating) => {
    setRatings(prev => ({
      ...prev,
      [item.id]: prev[item.id] === rating ? 0 : rating,
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const rated = staples.filter(item => ratings[item.id] > 0);
    await Promise.all(rated.map(item => rateItem(item, ratings[item.id])));
    onDone();
  };

  const anyRated = staples.some(item => ratings[item.id] > 0);

  return (
    <div className={`menu-rating-onboarding${LOUD ? ' loud-mro' : ''}`}>
      {LOUD && onBack && (
        <button type="button" className="mro-back" onClick={onBack}>‹ Back</button>
      )}
      <h2 className="mro-title">{LOUD ? 'Rate a few staples' : 'Rate some dining hall staples'}</h2>
      <p className="mro-sub">
        {LOUD ? 'Optional. Tap your choice again to clear it.' : 'Seen these before? Rate them to personalize your meal plan from day one.'}
      </p>

      <div className="mro-list">
        {staples.map(item => (
          <div key={item.id} className="mro-item">
            <span className="mro-item-name">{item.name}</span>
            {LOUD ? (
              <ThreeChoice value={ratings[item.id] ?? 0} onChange={(r) => setRatings((prev) => ({ ...prev, [item.id]: r }))} allowClear label={`Rate ${item.name}`} />
            ) : (
              <StarRating
                rating={ratings[item.id] ?? 0}
                onChange={(r) => handleRate(item, r)}
                size={26}
                color="#f47421"
              />
            )}
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
