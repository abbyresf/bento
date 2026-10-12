import { useState, useEffect } from 'react';
import { getCachedMenu } from '../../lib/db';
import { fetchDiningMenu, getUniversityConfig } from '../../services/menuFetcher';
import { getCompatibleItemIds, pickMysteryPlate } from '../../lib/duo';
import { dishesFromMenu } from '../../data/plateDishes';
import { STATIONS } from '../../data/mockMenu';
import BuddyPick from './BuddyPick';
import './Friends.css';

/* Mystery plate: you pick a mystery dish for your buddy's plate, and they pick one for yours.
 *
 * Step 1 lists your buddies, with a search box once there are five or more. Step 2 builds today's dish list from the menu and
 * asks the server which of those pass your BUDDY'S dietary settings. The server answers with ids only, so you never see what
 * their settings are. Your own settings do not narrow the list, because the dish is not for you: your buddy picks yours, and
 * the server checks it against your settings the same way. If the check cannot be done, no dish is shown. Dishes with no
 * allergen or tag data are left out for anyone who needs it.
 * Labels only: Bento cannot see cross-contact in the kitchen. */
export default function MysteryPlateSheet({ friends, university, onClose, onPicked, friend0 = null }) {
  const [step, setStep] = useState(friend0 ? 'dishes' : 'buddy');          // 'buddy' | 'dishes' | 'done'
  const [friend, setFriend] = useState(friend0);
  const [dishQuery, setDishQuery] = useState('');
  const [dishes, setDishes] = useState(null);         // null while loading
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A buddy was chosen before the sheet opened (they picked first), so go straight to the dishes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (friend0) chooseFriend(friend0); }, []);

  const chooseFriend = async (f) => {
    setFriend(f); setStep('dishes'); setDishes(null); setError(null); setDishQuery('');
    try {
      const menu = getCachedMenu(university) ?? await fetchDiningMenu(getUniversityConfig(university));
      const candidates = dishesFromMenu(menu);
      if (candidates.length === 0) { setDishes([]); return; }
      const res = await getCompatibleItemIds(f.friend_id, candidates);
      if (!res.ok) throw new Error('buddy');
      setDishes(candidates.filter((d) => res.ids.has(d.id)));
    } catch {
      setDishes([]);
      setError('Could not check dishes right now. Try again.');
    }
  };

  const pick = async (dish) => {
    setBusy(true); setError(null);
    const res = await pickMysteryPlate(friend.friend_id, dish, dish.hall);
    setBusy(false);
    if (res.ok) { setPicked(dish); setStep('done'); onPicked?.(); return; }
    setError(res.status === 'exists'
      ? `You already picked a mystery dish for ${friend.display_name}.`
      : 'Could not save the pick. Try again.');
  };

  const filtered = (dishes ?? []).filter((d) => !dishQuery.trim() || d.name.toLowerCase().includes(dishQuery.trim().toLowerCase()));

  return (
    <div className="fr-overlay" onClick={onClose}>
      <div className="fr-sheet" role="dialog" aria-modal="true" aria-label="Mystery plate" onClick={(e) => e.stopPropagation()}>
        <div className="fr-head">
          <h3>Mystery plate</h3>
          <button className="fr-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {step === 'buddy' && (
          <>
            <p className="fr-note" style={{ marginTop: 0 }}>Who is it with? You pick a mystery dish for them, and they pick one for you.</p>
            <BuddyPick friends={friends} onChoose={chooseFriend} />
          </>
        )}

        {step === 'dishes' && (
          <>
            <p className="fr-note" style={{ marginTop: 0 }}>
              Pick a mystery dish for {friend.display_name} from today's menu. These all work for them. They see it at the top of Today and eat it today or tomorrow.
            </p>
            {dishes === null && <p className="fr-note">Finding dishes that work for {friend.display_name}…</p>}
            {error && <p className="fr-error">{error}</p>}
            {dishes && dishes.length === 0 && !error && (
              <p className="fr-note">No dish on today's menu works for {friend.display_name}. Try again tomorrow, or pick another buddy.</p>
            )}
            {dishes && dishes.length > 8 && (
              <input className="fr-input" type="search" placeholder="Search dishes" value={dishQuery}
                     onChange={(e) => setDishQuery(e.target.value)} aria-label="Search dishes" />
            )}
            <ul className="mp-list">
              {filtered.map((d) => (
                <li key={d.id}>
                  <button className="mp-row mp-dish" disabled={busy} onClick={() => pick(d)}>
                    <span className="mp-name">{d.name}</span>
                    <span className="mp-sub">{d.hall}, {d.mealName}{d.station && STATIONS[d.station] ? `, ${STATIONS[d.station]}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="fr-note mp-caveat">
              Based on the labels dining publishes. Bento cannot see cross-contact in the kitchen, so check with dining staff if you have an allergy.
            </p>
            <div className="fr-actions">
              {!friend0 && <button className="fr-btn-quiet" onClick={() => { setStep('buddy'); setError(null); }}>Back</button>}
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <p className="fr-ok" style={{ marginTop: 0 }}>
              Picked. {friend.display_name} will see {picked.name} at the top of Today.
            </p>
            <p className="fr-note">Now wait for {friend.display_name} to pick one for you. Eat yours today or tomorrow, then claim the quest.</p>
            <div className="fr-actions">
              <button className="fr-btn" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
