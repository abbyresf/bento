import { useCallback, useEffect, useState } from 'react';
import Mascot from './Mascot';
import { supabase } from '../../lib/supabase';
import { getGiftStatus, claimGift } from '../../lib/gifts';
import { isOnboardingComplete } from '../../lib/db';
import { setOutfit } from '../../lib/mascotOutfit';
import { haptics } from '../../lib/haptics';
import './HalloweenGift.css';

/* The Halloween 2026 launch gift: one free piece for the closet, chosen once.
 *
 * Mounted once above the app. It asks the server whether this signed-in student may still choose (migration 065,
 * decided from the account's own sign-up time), and offers the choice only after setup is done, so it never lands on
 * onboarding. "Not now" closes it for this session and it comes back next launch until a piece is chosen. A failed
 * call counts as not eligible and shows nothing. */
const PIECES = [
  { id: 'batwings', name: 'Bat wings' },
  { id: 'pumpkin',  name: 'Pumpkin hat' },
];

export default function HalloweenGift() {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setOpen(false); return; }
    if ((await isOnboardingComplete()) !== true) return;
    const s = await getGiftStatus();
    setOpen(s.eligible && !s.piece);
  }, []);

  useEffect(() => {
    const first = setTimeout(check, 0);
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setOpen(false); setPick(null); setDismissed(false); }
      else if (event === 'SIGNED_IN') check();
    });
    const onShow = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearTimeout(first); sub?.subscription?.unsubscribe(); document.removeEventListener('visibilitychange', onShow); };
  }, [check]);

  if (!open || dismissed) return null;

  const choose = async () => {
    if (!pick || busy) return;
    setBusy(true); setError('');
    const r = await claimGift(pick);
    setBusy(false);
    if (r === 'ok' || r === 'already') {
      haptics.success();
      if (r === 'ok') setOutfit(pick);
      setOpen(false);
    } else {
      setError(r === 'not_eligible' ? 'This gift is only for accounts made in launch week.' : 'Could not save that. Check your connection and try again.');
    }
  };

  return (
    <div className="hg-overlay" role="dialog" aria-modal="true" aria-label="Launch week gift">
      <div className="hg-card">
        <p className="hg-kicker">Launch week gift</p>
        <h2 className="hg-title">Pick a Halloween piece for Bento</h2>
        <p className="hg-sub">Thanks for joining in launch week. One piece, yours for good.</p>
        <div className="hg-choices">
          {PIECES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`hg-choice${pick === p.id ? ' on' : ''}`}
              aria-pressed={pick === p.id}
              onClick={() => { haptics.selection(); setPick(p.id); }}
            >
              <Mascot mood="cheer" size={104} hop={false} outfit={p.id} />
              <span className="hg-name">{p.name}</span>
            </button>
          ))}
        </div>
        <p className="hg-note">You can pick one, and the choice is final.</p>
        {error && <p className="hg-error" role="alert">{error}</p>}
        <button type="button" className="hg-go" disabled={!pick || busy} onClick={choose}>
          {busy ? 'Saving' : pick ? `Choose ${PIECES.find((p) => p.id === pick).name.toLowerCase()}` : 'Pick one'}
        </button>
        <button type="button" className="hg-later" onClick={() => setDismissed(true)}>Not now</button>
      </div>
    </div>
  );
}
