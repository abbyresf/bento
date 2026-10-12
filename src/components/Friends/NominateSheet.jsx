import { useState, useEffect } from 'react';
import { getMyRatings } from '../../lib/db';
import { nominatePick } from '../../lib/duo';
import BuddyPick from './BuddyPick';
import './Friends.css';

/* Pick of the week: name your favorite, from the dishes you rated 4 or 5 stars. Your buddy rates it, and you rate theirs.
 * Only the dish name goes to your buddy, never your other ratings. */
export default function NominateSheet({ friends, friend0 = null, onClose, onDone }) {
  const [friend, setFriend] = useState(friend0);
  const [favorites, setFavorites] = useState(null);       // null while loading
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let off = false;
    getMyRatings().then((mine) => {
      if (off) return;
      setFavorites(Object.entries(mine).filter(([, v]) => v.rating >= 4 && v.name)
        .map(([id, v]) => ({ id, name: v.name, rating: v.rating }))
        .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name)));
    });
    return () => { off = true; };
  }, []);

  const pick = async (dish) => {
    setBusy(true); setError(null);
    const res = await nominatePick(friend.friend_id, dish);
    setBusy(false);
    if (res.ok) { setPicked(dish); onDone?.(); return; }
    setError(res.status === 'exists' ? `You already named a favorite with ${friend.display_name} this week.`
      : res.status === 'not_rated' ? 'Rate that dish 4 or 5 stars first.' : 'Could not save the pick. Try again.');
  };

  const shown = (favorites ?? []).filter((d) => !query.trim() || d.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="fr-overlay" onClick={onClose}>
      <div className="fr-sheet" role="dialog" aria-modal="true" aria-label="Pick of the week" onClick={(e) => e.stopPropagation()}>
        <div className="fr-head">
          <h3>Pick of the week</h3>
          <button className="fr-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {!friend && (
          <>
            <p className="fr-note" style={{ marginTop: 0 }}>Who do you share a favorite with?</p>
            <BuddyPick friends={friends} onChoose={setFriend} />
          </>
        )}

        {friend && !picked && (
          <>
            <p className="fr-note" style={{ marginTop: 0 }}>
              Name your favorite dish for {friend.display_name}. They rate it, and you rate theirs.
            </p>
            {error && <p className="fr-error">{error}</p>}
            {favorites === null && <p className="fr-note">Loading your ratings…</p>}
            {favorites && favorites.length === 0 && (
              <p className="fr-note">You have no dishes rated 4 or 5 stars yet. Rate a few from My Ratings, then come back.</p>
            )}
            {favorites && favorites.length > 8 && (
              <input className="fr-input" type="search" placeholder="Search your favorites" value={query}
                     onChange={(e) => setQuery(e.target.value)} aria-label="Search your favorites" />
            )}
            <ul className="mp-list">
              {shown.map((d) => (
                <li key={d.id}>
                  <button className="mp-row mp-dish" disabled={busy} onClick={() => pick(d)}>
                    <span className="mp-name">{d.name}</span>
                    <span className="mp-sub">{'★'.repeat(d.rating)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!friend0 && (
              <div className="fr-actions">
                <button className="fr-btn-quiet" onClick={() => { setFriend(null); setError(null); }}>Back</button>
              </div>
            )}
          </>
        )}

        {picked && (
          <>
            <p className="fr-ok" style={{ marginTop: 0 }}>Named {picked.name}. {friend.display_name} will see it in their quests.</p>
            <p className="fr-note">Rate {friend.display_name}'s pick when it shows up, and it counts.</p>
            <div className="fr-actions">
              <button className="fr-btn" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
