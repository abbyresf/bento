import { useState, useEffect, useMemo } from 'react';
import { useFriends } from '../../lib/friendsStore';
import { clearHere } from '../../lib/duo';
import { presenceLine, minutesLeft } from '../../data/duo';
import InviteSheet from './InviteSheet';
import HereSheet from './HereSheet';
import './Friends.css';

/* The friends card on Today.
 *
 * Shows nothing until the database has Duo (migration 043). With no friends it
 * is a small invitation, and with friends it lists who is at a hall and offers
 * the "I'm here" button. The list refreshes every minute while this is mounted
 * and when the app returns to the front (friendsStore). */
const HERE_KEY = 'bento_duo_here';

function readHere() {
  try {
    const h = JSON.parse(localStorage.getItem(HERE_KEY) || 'null');
    return h && minutesLeft(h.at) > 0 ? h : null;
  } catch { return null; }
}

export default function FriendsRow({ halls = [] }) {
  const { status, friends } = useFriends();
  const [sheet, setSheet] = useState(null); // 'invite' | 'here'
  const [here, setHere] = useState(readHere);
  const [now, setNow] = useState(() => Date.now());

  // Keeps "12:42" rows and the 90 minute window honest without a refresh.
  useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); setHere(readHere()); }, 30000);
    return () => clearInterval(t);
  }, []);

  const lines = useMemo(() => friends.map((f) => ({ f, line: presenceLine(f, now) })), [friends, now]);

  if (status === 'idle' || status === 'unavailable') return null;

  const sent = ({ hall, meal, reached }) => {
    const h = { hall, meal, at: Date.now(), reached };
    try { localStorage.setItem(HERE_KEY, JSON.stringify(h)); } catch { /* ignore */ }
    setHere(h);
    setSheet(null);
  };

  const left = async () => {
    await clearHere();
    try { localStorage.removeItem(HERE_KEY); } catch { /* ignore */ }
    setHere(null);
  };

  return (
    <section className="fr-row" aria-label="Friends">
      {friends.length === 0 ? (
        <div className="fr-empty">
          <p>Share meals with a friend.</p>
          <button className="fr-btn-quiet" onClick={() => setSheet('invite')}>Add a friend</button>
        </div>
      ) : (
        <>
          <div className="fr-row-head">
            <h3 className="fr-row-title">Friends</h3>
            <button className="fr-btn" onClick={() => setSheet('here')} disabled={halls.length === 0}>I'm here</button>
          </div>
          <div className="fr-chips">
            {lines.map(({ f, line }) => (
              <div key={f.friend_id} className={`fr-chip${line ? ' is-here' : ''}`}>
                <span className="fr-chip-name">{f.display_name}</span>
                {line ? <span className="fr-chip-line">{line}</span> : null}
              </div>
            ))}
            <button className="fr-btn-quiet" onClick={() => setSheet('invite')} aria-label="Add a friend">+</button>
          </div>
          {here && (
            <p className="fr-you">
              You are at {here.hall}. {here.reached === 0 ? 'No one was told.' : `${here.reached} ${here.reached === 1 ? 'friend knows' : 'friends know'}.`}
              <button className="fr-link" onClick={left}>I've left</button>
            </p>
          )}
          {status === 'offline' && <p className="fr-offline">No connection. Showing the last list.</p>}
        </>
      )}

      {sheet === 'invite' && <InviteSheet onClose={() => setSheet(null)} />}
      {sheet === 'here' && <HereSheet halls={halls} friends={friends} onClose={() => setSheet(null)} onSent={sent} />}
    </section>
  );
}
