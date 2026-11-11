import { useEffect, useMemo, useState } from 'react';
import { useRatings } from '../../context/RatingsContext';
import { getMealHistory } from '../../lib/db';
import ThreeChoice from '../Loud/ThreeChoice';
import './MyRatings.css';

/* My Ratings in the Loud pilot.
 * - Tapping the answer a food already has does nothing. Removing a rating takes the Remove button, so a food never
 *   disappears from the list by accident.
 * - Foods eaten in the last two weeks that have no rating yet sit under "Not rated yet", each with the same three
 *   choices, so there is a way to rate them from here. */
export default function LoudMyRatings({ tabMode = false }) {
  const { myRatings, rateItem } = useRatings();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let live = true;
    getMealHistory().then((rows) => { if (live) setHistory(rows); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const rated = Object.entries(myRatings)
    .map(([id, { rating, name }]) => ({ id, name, rating }))
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));

  const unrated = useMemo(() => {
    const seen = new Map();
    for (const row of history) {
      for (const item of row.items ?? []) {
        if (!item?.id || !item?.name || myRatings[item.id] || seen.has(item.id)) continue;
        seen.set(item.id, { id: item.id, name: item.name });
      }
    }
    return [...seen.values()].slice(0, 20);
  }, [history, myRatings]);

  return (
    <div className={`my-ratings loud-ratings${tabMode ? ' my-ratings-page' : ''}`}>
      <div className="my-ratings-header"><h2>Your ratings</h2></div>
      <p className="my-ratings-note">Ratings sharpen your picks. Foods you love show up more often.</p>

      {unrated.length > 0 && (
        <section>
          <h3 className="loud-ratings-sec">Not rated yet</h3>
          {unrated.map((item) => (
            <div key={item.id} className="loud-rated">
              <span className="loud-rated-name">{item.name}</span>
              <ThreeChoice value={0} onChange={(r) => rateItem({ id: item.id, name: item.name }, r)} label={`Rate ${item.name}`} />
            </div>
          ))}
        </section>
      )}

      <section>
        <h3 className="loud-ratings-sec">Rated · {rated.length}</h3>
        {rated.length === 0 && <p className="my-ratings-note">Nothing rated yet. Rate a meal after you eat it.</p>}
        {rated.map((item) => (
          <div key={item.id} className="loud-rated">
            <div className="loud-rated-top">
              <span className="loud-rated-name">{item.name}</span>
              <button type="button" className="loud-rated-remove" onClick={() => rateItem({ id: item.id, name: item.name }, null)}>
                Remove
              </button>
            </div>
            <ThreeChoice value={item.rating} onChange={(r) => rateItem({ id: item.id, name: item.name }, r)} label={`Rate ${item.name}`} />
          </div>
        ))}
      </section>
    </div>
  );
}
