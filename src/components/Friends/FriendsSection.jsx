import { useState } from 'react';
import { useFriends, refreshFriends } from '../../lib/friendsStore';
import { setSharing, endFriend, blockFriend, setSocialPush, setDisplayName } from '../../lib/duo';
import { nameProblem, NAME_MAX } from '../../data/duo';
import InviteSheet from './InviteSheet';
import './Friends.css';

/* Friends, inside Settings. Hidden until migration 043 is run.
 *
 * Friend alerts ride on the notification permission and device registration that
 * Meal Reminders set up, so the switch is off and explained when reminders are
 * off (SOCIAL_SPEC.md, push). */
export default function FriendsSection({ remindersOn }) {
  const { status, friends, me } = useFriends();
  const [invite, setInvite] = useState(false);
  const [confirm, setConfirm] = useState(null); // { id, kind: 'end' | 'block' }
  const [name, setName] = useState(null);
  const [nameMsg, setNameMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  if (status === 'idle' || status === 'unavailable') return null;

  const editingName = name !== null;
  const saveName = async () => {
    const problem = nameProblem(name);
    if (problem) { setNameMsg({ kind: 'error', text: problem }); return; }
    setBusy(true);
    const res = await setDisplayName(name);
    setBusy(false);
    if (!res.ok) { setNameMsg({ kind: 'error', text: res.message }); return; }
    setName(null); setNameMsg(null);
    await refreshFriends();
  };

  const act = async (fn) => { setBusy(true); await fn(); await refreshFriends(); setBusy(false); setConfirm(null); };

  return (
    <section className="settings-section">
      <h3>Friends</h3>

      <p className="settings-hint" style={{ marginTop: 0 }}>
        Friends see your name, and your hall and meal only when you tap I'm here.
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
          {nameMsg && <p className="fr-error">{nameMsg.text}</p>}
        </div>
      )}

      <button className="fr-btn" onClick={() => setInvite(true)}>Add a friend</button>

      {status === 'offline' && <p className="fr-offline">No connection. Showing the last list.</p>}

      <div className="fr-list">
        {friends.length === 0 && <p className="fr-note" style={{ margin: 0 }}>No friends yet.</p>}
        {friends.map((f) => (
          <div key={f.friend_id} className="fr-friend">
            <div className="fr-friend-top">
              <div>
                <div className="fr-friend-name">{f.display_name}</div>
                <div className="fr-friend-sub">Friends since {new Date(f.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
              </div>
            </div>
            <div className="fr-friend-tools">
              <label className="fr-switch">
                <input type="checkbox" checked={f.i_share !== false} disabled={busy || status === 'offline'}
                       onChange={(e) => act(() => setSharing(f.friend_id, e.target.checked))} />
                Share I'm here
              </label>
            </div>
            {confirm?.id === f.friend_id ? (
              <div className="fr-friend-tools">
                <span className="fr-note" style={{ margin: 0 }}>
                  {confirm.kind === 'block' ? `Block ${f.display_name}? They cannot add you again.` : `Remove ${f.display_name}? Your shared streak ends.`}
                </span>
                <button className="fr-btn-quiet fr-btn-danger" disabled={busy}
                        onClick={() => act(() => (confirm.kind === 'block' ? blockFriend(f.friend_id) : endFriend(f.friend_id)))}>
                  {confirm.kind === 'block' ? 'Block' : 'Remove'}
                </button>
                <button className="fr-btn-quiet" onClick={() => setConfirm(null)}>Cancel</button>
              </div>
            ) : (
              <div className="fr-friend-tools">
                <button className="fr-btn-quiet" disabled={status === 'offline'} onClick={() => setConfirm({ id: f.friend_id, kind: 'end' })}>Remove</button>
                <button className="fr-btn-quiet" disabled={status === 'offline'} onClick={() => setConfirm({ id: f.friend_id, kind: 'block' })}>Block</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: '1rem' }}>
        <label className="fr-switch">
          <input type="checkbox" checked={me?.socialPush === true} disabled={busy || !remindersOn}
                 onChange={(e) => act(() => setSocialPush(e.target.checked))} />
          Tell me when a friend taps I'm here
        </label>
        {!remindersOn && <p className="fr-note">Turn on Meal Reminders first. Friend alerts use the same notification permission.</p>}
      </div>

      {invite && <InviteSheet onClose={() => setInvite(false)} />}
    </section>
  );
}
