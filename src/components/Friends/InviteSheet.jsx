import { useState, useEffect } from 'react';
import { createInvite, redeemInvite, shareInvite, setDisplayName } from '../../lib/duo';
import { refreshFriends, useFriends } from '../../lib/friendsStore';
import { nameProblem, formatCode, isValidCode, normalizeCode, NAME_MAX } from '../../data/duo';
import './Friends.css';

/* Invite a friend, or enter a code someone sent.
 *
 * A name comes first because a friend has to recognise who is asking. The invite
 * goes out through the share sheet, where Messages is the first choice, as a link.
 * The same code can be typed in, which is also the fallback while links do not
 * open the app yet (SOCIAL_SPEC.md, B6). */
export default function InviteSheet({ onClose, initialCode = '' }) {
  const { me } = useFriends();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(null);
  const [savingName, setSavingName] = useState(false);
  const [invite, setInvite] = useState(null);     // { code }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);   // { kind: 'ok' | 'error', text }
  const [code, setCode] = useState(initialCode);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hasName = Boolean(me?.name);

  const saveName = async () => {
    const problem = nameProblem(name);
    if (problem) { setNameError(problem); return; }
    setSavingName(true); setNameError(null);
    const res = await setDisplayName(name);
    setSavingName(false);
    if (!res.ok) { setNameError(res.message); return; }
    await refreshFriends();
  };

  const sendInvite = async () => {
    setBusy(true); setMessage(null);
    const made = await createInvite();
    if (!made.ok) { setBusy(false); setMessage({ kind: 'error', text: made.message }); return; }
    setInvite({ code: made.code });
    const shared = await shareInvite(me?.name, made.code);
    setBusy(false);
    if (shared.how === 'copied') setMessage({ kind: 'ok', text: 'Copied. Paste it into a message.' });
    else if (!shared.ok && !shared.cancelled) setMessage({ kind: 'error', text: 'Could not open sharing. Send the code below instead.' });
  };

  const addByCode = async () => {
    if (!isValidCode(code)) { setMessage({ kind: 'error', text: 'Codes are 8 letters and numbers.' }); return; }
    setBusy(true); setMessage(null);
    const res = await redeemInvite(code);
    setBusy(false);
    if (!res.ok) { setMessage({ kind: 'error', text: res.message }); return; }
    setMessage({ kind: 'ok', text: `You and ${res.friend.name} are buddies.` });
    setCode('');
    await refreshFriends();
  };

  return (
    <div className="fr-overlay" onClick={onClose}>
      <div className="fr-sheet" role="dialog" aria-modal="true" aria-label="Add a buddy" onClick={(e) => e.stopPropagation()}>
        <div className="fr-head">
          <h3>Add a buddy</h3>
          <button className="fr-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {!hasName ? (
          <>
            <label className="fr-label" htmlFor="fr-name">Your name</label>
            <div className="fr-inline">
              <input id="fr-name" className="fr-input" value={name} maxLength={NAME_MAX + 5}
                     onChange={(e) => setName(e.target.value)} placeholder="What your buddies call you" autoComplete="given-name" />
              <button className="fr-btn" onClick={saveName} disabled={savingName}>Save</button>
            </div>
            {nameError && <p className="fr-error">{nameError}</p>}
            <p className="fr-note">Buddies see this name. Nothing else about you.</p>
          </>
        ) : (
          <>
            <p className="fr-note" style={{ marginTop: 0 }}>
              Send a link in Messages. Your buddy taps it and you are connected. Invites last 24 hours.
            </p>
            <div className="fr-actions">
              <button className="fr-btn" onClick={sendInvite} disabled={busy}>
                {busy && !invite ? 'Making a link…' : 'Invite a buddy'}
              </button>
            </div>
            {invite && (
              <>
                <p className="fr-bigcode" aria-label="Your invite code">{formatCode(invite.code)}</p>
                <p className="fr-note" style={{ textAlign: 'center', marginTop: 0 }}>
                  Your buddy can also type this code under Add a buddy.
                </p>
              </>
            )}

            <label className="fr-label" htmlFor="fr-code">Have a code?</label>
            <div className="fr-inline">
              <input id="fr-code" className="fr-input fr-code" value={formatCode(code)} maxLength={9}
                     onChange={(e) => setCode(normalizeCode(e.target.value).slice(0, 8))}
                     placeholder="ABCD 2345" autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text" />
              <button className="fr-btn" onClick={addByCode} disabled={busy || !isValidCode(code)}>Add</button>
            </div>
          </>
        )}

        {message && <p className={message.kind === 'ok' ? 'fr-ok' : 'fr-error'}>{message.text}</p>}
      </div>
    </div>
  );
}
