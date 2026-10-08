import { useState } from 'react';
import { redeemInvite, setDisplayName } from '../../lib/duo';
import { refreshFriends, useFriends } from '../../lib/friendsStore';
import { nameProblem, formatCode, NAME_MAX } from '../../data/duo';
import './Friends.css';

/* Opened by an invite link. Asks before it does anything, and says which account
 * is signed in, so a person on the wrong account sees it before accepting
 * (SOCIAL_SPEC.md, B13). The link itself never redeems: only this button does. */
export default function JoinSheet({ code, onClose }) {
  const { me, status } = useFriends();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);   // { kind, text }

  // Wait for the first answer, so a name already saved is not asked for again.
  if (status === 'idle' || status === 'unavailable') return null;
  const hasName = Boolean(me?.name);

  const accept = async () => {
    setBusy(true); setResult(null);
    if (!hasName) {
      const problem = nameProblem(name);
      if (problem) { setBusy(false); setResult({ kind: 'error', text: problem }); return; }
      const saved = await setDisplayName(name);
      if (!saved.ok) { setBusy(false); setResult({ kind: 'error', text: saved.message }); return; }
    }
    const res = await redeemInvite(code);
    setBusy(false);
    if (!res.ok) { setResult({ kind: 'error', text: res.message }); return; }
    setResult({ kind: 'ok', text: `You and ${res.friend.name} are buddies.` });
    await refreshFriends();
  };

  const done = result?.kind === 'ok';
  return (
    <div className="fr-overlay" onClick={onClose}>
      <div className="fr-sheet" role="dialog" aria-modal="true" aria-label="Buddy invite" onClick={(e) => e.stopPropagation()}>
        <div className="fr-head">
          <h3>{done ? 'Buddies' : 'Add a buddy?'}</h3>
          <button className="fr-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {!done && (
          <>
            <p className="fr-note" style={{ marginTop: 0 }}>
              Someone invited you to share meals on Bento with the code {formatCode(code)}.
            </p>
            <p className="fr-note">You are signed in as <strong>{me?.email || 'this account'}</strong>. Buddies belong to this account.</p>
            {!hasName && (
              <>
                <label className="fr-label" htmlFor="fr-join-name">Your name</label>
                <input id="fr-join-name" className="fr-input" value={name} maxLength={NAME_MAX + 5}
                       onChange={(e) => setName(e.target.value)} placeholder="What your buddies call you" />
              </>
            )}
            <div className="fr-actions">
              <button className="fr-btn" onClick={accept} disabled={busy}>{busy ? 'Adding…' : 'Add buddy'}</button>
              <button className="fr-btn-quiet" onClick={onClose}>Not now</button>
            </div>
          </>
        )}
        {result && <p className={result.kind === 'ok' ? 'fr-ok' : 'fr-error'}>{result.text}</p>}
        {done && <div className="fr-actions"><button className="fr-btn" onClick={onClose}>Done</button></div>}
      </div>
    </div>
  );
}
