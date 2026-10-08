import { useState } from 'react';
import { useFriends, refreshFriends } from '../../lib/friendsStore';
import { setSocialPush, setDisplayName } from '../../lib/duo';
import { nameProblem, NAME_MAX } from '../../data/duo';
import './Friends.css';

/* Friends, inside Settings: only the two settings that belong to the person, plus
 * a way to the Friends tab. Friends themselves are managed on the tab.
 * Hidden until migration 043 is run.
 *
 * Friend alerts ride on the notification permission and device registration that
 * Meal Reminders set up, so the switch is off and explained when reminders are
 * off (SOCIAL_SPEC.md, push). */
export default function FriendsSection({ remindersOn, onOpenFriends }) {
  const { status, friends, me } = useFriends();
  const [name, setName] = useState(null);
  const [nameMsg, setNameMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  if (status === 'idle' || status === 'unavailable') return null;

  const editingName = name !== null;
  const saveName = async () => {
    const problem = nameProblem(name);
    if (problem) { setNameMsg(problem); return; }
    setBusy(true);
    const res = await setDisplayName(name);
    setBusy(false);
    if (!res.ok) { setNameMsg(res.message); return; }
    setName(null); setNameMsg(null);
    await refreshFriends();
  };
  const toggleAlerts = async (on) => { setBusy(true); await setSocialPush(on); await refreshFriends(); setBusy(false); };

  return (
    <section className="settings-section">
      <h3>Buddies</h3>
      <p className="settings-hint" style={{ marginTop: 0 }}>
        Buddies see your name, and your hall and meal only when you tap I'm here.
      </p>

      {!editingName ? (
        <p style={{ margin: '0.25rem 0 0.75rem' }}>
          {me?.name ? <>Your name: <strong>{me.name}</strong> </> : 'You have not set a name yet. '}
          <button className="fr-link" onClick={() => setName(me?.name ?? '')}>{me?.name ? 'Change' : 'Add a name'}</button>
        </p>
      ) : (
        <div style={{ margin: '0.25rem 0 0.75rem' }}>
          <div className="fr-inline">
            <input className="fr-input" value={name} maxLength={NAME_MAX + 5} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
            <button className="fr-btn" onClick={saveName} disabled={busy}>Save</button>
            <button className="fr-btn-quiet" onClick={() => { setName(null); setNameMsg(null); }}>Cancel</button>
          </div>
          {nameMsg && <p className="fr-error">{nameMsg}</p>}
        </div>
      )}

      <label className="fr-switch">
        <input type="checkbox" checked={me?.socialPush === true} disabled={busy || !remindersOn}
               onChange={(e) => toggleAlerts(e.target.checked)} />
        Tell me when a buddy taps I'm here
      </label>
      {!remindersOn && <p className="fr-note">Turn on Meal Reminders first. Buddy alerts use the same notification permission.</p>}

      <p style={{ margin: '0.9rem 0 0' }}>
        <button className="fr-link" onClick={onOpenFriends}>
          {friends.length === 0 ? 'Add a buddy' : `Manage your ${friends.length} ${friends.length === 1 ? 'buddy' : 'buddies'}`}
        </button>
      </p>
    </section>
  );
}
