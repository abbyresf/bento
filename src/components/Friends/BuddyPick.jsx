import { useMemo, useState } from 'react';
import Mascot from '../Mascot/Mascot';
import './Friends.css';

/* A list of your buddies to choose one from. Shows a search box once there are five or more, so a long list stays easy. */
const SEARCH_AT = 5;

export default function BuddyPick({ friends, onChoose }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? friends.filter((f) => f.display_name.toLowerCase().includes(q)) : friends;
  }, [friends, query]);
  return (
    <>
      {friends.length >= SEARCH_AT && (
        <input className="fr-input" type="search" placeholder="Search your buddies" value={query}
               onChange={(e) => setQuery(e.target.value)} aria-label="Search your buddies" autoFocus />
      )}
      <ul className="mp-list">
        {shown.map((f) => (
          <li key={f.friend_id}>
            <button className="mp-row" onClick={() => onChoose(f)}>
              <Mascot mood="happy" size={36} hop={false} outfit={f.mascot_outfit ?? null} color={f.mascot_color ?? null} />
              <span className="mp-name">{f.display_name}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="fr-note">No buddy by that name.</li>}
      </ul>
    </>
  );
}
