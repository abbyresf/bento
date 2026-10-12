import { useState, useEffect } from 'react';
import { getCachedMenu, getDietaryRestrictions } from '../../lib/db';
import { fetchDiningMenu, getUniversityConfig } from '../../services/menuFetcher';
import { getCompatibleItemIds, pickMysteryPlate, pickSwapDish } from '../../lib/duo';
import { passesFailClosed } from '../../data/plateFilter';
import { dishesFromMenu } from '../../data/plateDishes';
import { STATIONS } from '../../data/mockMenu';
import BuddyPick from './BuddyPick';
import './Friends.css';

/* Mystery plate: choose a buddy, then a dish that works for both of you. With mode 'swap' it is Plate swap: the dish is for your buddy
 * alone, so only their settings filter it, and each of you picks one for the other.
 *
 *
 * Step 1 lists your buddies, with a search box once there are more than a few. Step 2 builds today's dish list from
 * the menu, keeps the dishes that pass YOUR settings here on the phone, then asks the server which of those also
 * pass your buddy's. The server answers with ids only, so you never see what their settings are. If either check
 * cannot be done, no dish is shown. Dishes with no allergen or tag data are left out for anyone who needs it.
 * Labels only: Bento cannot see cross-contact in the kitchen. */

export default function MysteryPlateSheet({ friends, university, onClose, onPicked, mode = 'mystery', friend0 = null }) {
  const swap = mode === 'swap';
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
      const mine = swap ? null : await getDietaryRestrictions();
      if (mine?.__unknown) throw new Error('settings');
      const menu = getCachedMenu(university) ?? await fetchDiningMenu(getUniversityConfig(university));
      // A swap dish is for your buddy, so your own settings do not narrow it. A shared dish must fit you both.
      const candidates = dishesFromMenu(menu).filter((d) => !mine || passesFailClosed(d, mine));
      if (candidates.length === 0) { setDishes([]); return; }
      const res = await getCompatibleItemIds(f.friend_id, candidates);
      if (!res.ok) throw new Error('buddy');
      setDishes(candidates.filter((d) => res.ids.has(d.id)));
    } catch (e) {
      setDishes([]);
      setError(e.message === 'settings'
        ? 'Could not read your dietary settings, so no dishes are shown. Try again.'
        : 'Could not check dishes right now. Try again.');
    }
  };

  const pick = async (dish) => {
    setBusy(true); setError(null);
    const res = await (swap ? pickSwapDish : pickMysteryPlate)(friend.friend_id, dish, dish.hall);
    setBusy(false);
    if (res.ok) { setPicked(dish); setStep('done'); onPicked?.(); return; }
    setError(res.status === 'exists'
      ? (swap ? `You already picked a dish for ${friend.display_name}.` : `You and ${friend.display_name} already have a Mystery plate going. Finish it first.`)
      : 'Could not save the pick. Try again.');
  };

  const filtered = (dishes ?? []).filter((d) => !dishQuery.trim() || d.name.toLowerCase().includes(dishQuery.trim().toLowerCase()));

  return (
    <div className="fr-overlay" onClick={onClose}>
      <div className="fr-sheet" role="dialog" aria-modal="true" aria-label={swap ? 'Plate swap' : 'Mystery plate'} onClick={(e) => e.stopPropagation()}>
        <div className="fr-head">
          <h3>{swap ? 'Plate swap' : 'Mystery plate'}</h3>
          <button className="fr-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {step === 'buddy' && (
          <>
            <p className="fr-note" style={{ marginTop: 0 }}>Who is it with? Bento finds dishes that work for you both.</p>
            <BuddyPick friends={friends} onChoose={chooseFriend} />
          </>
        )}

        {step === 'dishes' && (
          <>
            <p className="fr-note" style={{ marginTop: 0 }}>
              {swap
                ? `Dishes on today's menu that work for ${friend.display_name}. Pick one for them. They eat it today or tomorrow, and you eat the one they pick for you.`
                : `Dishes on today's menu that work for you and ${friend.display_name}. Pick one. You both eat it today or tomorrow.`}
            </p>
            {dishes === null && <p className="fr-note">Finding dishes that work for you both…</p>}
            {error && <p className="fr-error">{error}</p>}
            {dishes && dishes.length === 0 && !error && (
              <p className="fr-note">No dish on today's menu works for you both. Try again tomorrow, or pick another buddy.</p>
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
              <button className="fr-btn-quiet" onClick={() => { setStep('buddy'); setError(null); }}>Back</button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <p className="fr-ok" style={{ marginTop: 0 }}>
              Picked. {friend.display_name} will see {picked.name} in their quests.
            </p>
            <p className="fr-note">{swap ? `Now wait for ${friend.display_name} to pick one for you.` : 'Eat it today or tomorrow, both of you, then claim the quest.'}</p>
            <div className="fr-actions">
              <button className="fr-btn" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
