import { useState, useEffect, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { useFriends, refreshFriends } from '../../lib/friendsStore';
import { clearHere, setSharing, endFriend, blockFriend, getDuoStreak } from '../../lib/duo';
import { hereNow, presenceLine, minutesLeft } from '../../data/duo';
import { getUniversityConfig, getSelectableLocations } from '../../services/menuFetcher';
import InviteSheet from './InviteSheet';
import HereSheet from './HereSheet';
import './Friends.css';

/* The Friends tab.
 *
 * Top to bottom: who is out now, the I'm here button, then everyone you are
 * friends with, each with the streak you share. With no friends it is a single
 * invitation. Managing a friend (sharing, remove, block) lives on their row.
 *
 * Hidden entirely until migration 043 has been run (BottomNav drops the tab). */
const HERE_KEY = 'bento_duo_here';

function readHere() {
  try {
    const h = JSON.parse(localStorage.getItem(HERE_KEY) || 'null');
    return h && minutesLeft(h.at) > 0 ? h : null;
  } catch { return null; }
}

/* The dining halls of this person's school, for the I'm here sheet. */
function hallsFor(university) {
  try {
    return Object.values(getSelectableLocations(getUniversityConfig(university)))
      .map((l) => ({ id: l.id, name: l.shortName ?? l.name }))
      .filter((h) => h.name);
  } catch { return []; }
}

export default function FriendsTab() {
  const { status, friends, me } = useFriends();
  const [sheet, setSheet] = useState(null);       // 'invite' | 'here'
  const [here, setHere] = useState(readHere);
  const [now, setNow] = useState(() => Date.now());
  const [streaks, setStreaks] = useState({});     // friend id -> number
  const [open, setOpen] = useState(null);         // friend id with tools showing
  const [confirm, setConfirm] = useState(null);   // { id, kind }
  const [busy, setBusy] = useState(false);

  // Keeps "12:42" rows and the 90 minute window honest without a refresh.
  useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); setHere(readHere()); }, 30000);
    return () => clearInterval(t);
  }, []);

  // The shared streak for each friend. One small call each, only when the list
  // changes, and never offline.
  const ids = friends.map((f) => f.friend_id).join(',');
  useEffect(() => {
    if (!ids || status !== 'ok') return undefined;
    let stopped = false;
    Promise.all(ids.split(',').map((id) => getDuoStreak(id).then((s) => [id, s?.streak ?? 0])))
      .then((pairs) => { if (!stopped) setStreaks(Object.fromEntries(pairs)); });
    return () => { stopped = true; };
  }, [ids, status]);

  const halls = useMemo(() => hallsFor(me?.university), [me?.university]);
  const out = useMemo(() => hereNow(friends, now), [friends, now]);

  if (status === 'idle') return <div className="ft-page"><p className="fr-note">Loading…</p></div>;

  const sent = ({ hall, meal, reached }) => {
    const h = { hall, meal, at: Date.now(), reached };
    try { localStorage.setItem(HERE_KEY, JSON.stringify(h)); } catch { /* ignore */ }
    setHere(h); setSheet(null);
  };
  const left = async () => {
    await clearHere();
    try { localStorage.removeItem(HERE_KEY); } catch { /* ignore */ }
    setHere(null);
  };
  const act = async (fn) => { setBusy(true); await fn(); await refreshFriends(); setBusy(false); setConfirm(null); setOpen(null); };

  const offline = status === 'offline';
  const isNative = Capacitor.isNativePlatform();

  return (
    <div className="ft-page">
      <h2 className="ft-title">Friends</h2>

      {offline && <p className="fr-offline">No connection. Showing the last list.</p>}

      {friends.length === 0 ? (
        <section className="ft-card ft-first">
          <h3>Eat together</h3>
          <p>
            Add a friend to see when they are at a dining hall, and keep a streak together.
            You choose when to share where you are.
          </p>
          <div className="fr-actions">
            <button className="fr-btn" onClick={() => setSheet('invite')} disabled={offline}>Invite a friend</button>
            <button className="fr-link" onClick={() => setSheet('invite')}>Have a code?</button>
          </div>
          {!isNative && <p className="fr-note">Invites are sent from the iPhone app.</p>}
        </section>
      ) : (
        <>
          <section className="ft-card">
            <h3 className="ft-section">Out now</h3>
            {out.length === 0 ? (
              <p className="fr-note" style={{ margin: 0 }}>No one is at a dining hall right now.</p>
            ) : (
              <ul className="ft-out">
                {out.map((f) => (
                  <li key={f.friend_id}>
                    <span className="fr-chip-name">{f.display_name}</span>
                    <span className="fr-chip-line">{presenceLine(f, now)}</span>
                  </li>
                ))}
              </ul>
            )}
            <button className="fr-btn ft-here" onClick={() => setSheet('here')} disabled={halls.length === 0 || offline}>
              I'm here
            </button>
            {here && (
              <p className="fr-you">
                You are at {here.hall}. {here.reached === 0 ? 'No one was told.' : `${here.reached} ${here.reached === 1 ? 'friend knows' : 'friends know'}.`}
                <button className="fr-link" onClick={left}>I've left</button>
              </p>
            )}
          </section>

          <section className="ft-card">
            <h3 className="ft-section">Your friends</h3>
            <div className="fr-list" style={{ marginTop: 0 }}>
              {friends.map((f) => {
                const n = streaks[f.friend_id];
                const isOpen = open === f.friend_id;
                return (
                  <div key={f.friend_id} className="fr-friend">
                    <div className="fr-friend-top">
                      <div>
                        <div className="fr-friend-name">{f.display_name}</div>
                        <div className="fr-friend-sub">
                          {n === undefined ? ' ' : n > 0 ? `${n}-day streak together` : 'No shared streak yet'}
                        </div>
                      </div>
                      <button className="fr-btn-quiet" aria-expanded={isOpen}
                              onClick={() => { setOpen(isOpen ? null : f.friend_id); setConfirm(null); }}>
                        {isOpen ? 'Done' : 'Manage'}
                      </button>
                    </div>
                    {isOpen && (
                      <>
                        <div className="fr-friend-tools">
                          <label className="fr-switch">
                            <input type="checkbox" checked={f.i_share !== false} disabled={busy || offline}
                                   onChange={(e) => act(() => setSharing(f.friend_id, e.target.checked))} />
                            Share I'm here with {f.display_name}
                          </label>
                        </div>
                        {confirm?.id === f.friend_id ? (
                          <div className="fr-friend-tools">
                            <span className="fr-note" style={{ margin: 0 }}>
                              {confirm.kind === 'block'
                                ? `Block ${f.display_name}? They cannot add you again.`
                                : `Remove ${f.display_name}? Your shared streak ends.`}
                            </span>
                            <button className="fr-btn-quiet fr-btn-danger" disabled={busy}
                                    onClick={() => act(() => (confirm.kind === 'block' ? blockFriend(f.friend_id) : endFriend(f.friend_id)))}>
                              {confirm.kind === 'block' ? 'Block' : 'Remove'}
                            </button>
                            <button className="fr-btn-quiet" onClick={() => setConfirm(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div className="fr-friend-tools">
                            <button className="fr-btn-quiet" disabled={offline} onClick={() => setConfirm({ id: f.friend_id, kind: 'end' })}>Remove</button>
                            <button className="fr-btn-quiet" disabled={offline} onClick={() => setConfirm({ id: f.friend_id, kind: 'block' })}>Block</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="fr-actions">
              <button className="fr-btn-quiet" onClick={() => setSheet('invite')} disabled={offline}>Add a friend</button>
            </div>
          </section>
        </>
      )}

      {sheet === 'invite' && <InviteSheet onClose={() => setSheet(null)} />}
      {sheet === 'here' && <HereSheet halls={halls} friends={friends} onClose={() => setSheet(null)} onSent={sent} />}
    </div>
  );
}
