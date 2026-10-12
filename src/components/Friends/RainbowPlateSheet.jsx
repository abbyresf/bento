import { useState, useEffect } from 'react';
import { pickRainbowPlate } from '../../lib/duo';
import BuddyPick from './BuddyPick';
import './Friends.css';

/* Rainbow plate: choose a buddy, then a color. You both eat something that color today or tomorrow.
 * Bento has no color data, so it trusts you: each of you taps "I did it" on the quest card afterwards. */
const COLORS = [
  { id: 'red',    name: 'Red',    hex: '#E5484D' },
  { id: 'orange', name: 'Orange', hex: '#F5821F' },
  { id: 'yellow', name: 'Yellow', hex: '#F4C21F' },
  { id: 'green',  name: 'Green',  hex: '#4CAF50' },
  { id: 'purple', name: 'Purple', hex: '#8A5BD6' },
];

export default function RainbowPlateSheet({ friends, onClose, onPicked }) {
  const [step, setStep] = useState('buddy');        // 'buddy' | 'color' | 'done'
  const [friend, setFriend] = useState(null);
  const [color, setColor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = async (c) => {
    setBusy(true); setError(null);
    const res = await pickRainbowPlate(friend.friend_id, c.id);
    setBusy(false);
    if (res.ok) { setColor(c); setStep('done'); onPicked?.(); return; }
    setError(res.status === 'exists'
      ? `You and ${friend.display_name} already have a Rainbow plate going. Finish it first.`
      : 'Could not save the color. Try again.');
  };

  return (
    <div className="fr-overlay" onClick={onClose}>
      <div className="fr-sheet" role="dialog" aria-modal="true" aria-label="Rainbow plate" onClick={(e) => e.stopPropagation()}>
        <div className="fr-head">
          <h3>Rainbow plate</h3>
          <button className="fr-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {step === 'buddy' && (
          <>
            <p className="fr-note" style={{ marginTop: 0 }}>Who is it with?</p>
            <BuddyPick friends={friends} onChoose={(f) => { setFriend(f); setStep('color'); }} />
          </>
        )}

        {step === 'color' && (
          <>
            <p className="fr-note" style={{ marginTop: 0 }}>
              Pick a color. You and {friend.display_name} each eat something that color today or tomorrow.
            </p>
            {error && <p className="fr-error">{error}</p>}
            <div className="rb-colors">
              {COLORS.map((c) => (
                <button key={c.id} className="rb-color" disabled={busy} onClick={() => pick(c)} style={{ '--rb': c.hex }}>
                  <span className="rb-dot" aria-hidden="true" />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
            <div className="fr-actions">
              <button className="fr-btn-quiet" onClick={() => { setStep('buddy'); setError(null); }}>Back</button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <p className="fr-ok" style={{ marginTop: 0 }}>
              Picked {color.name.toLowerCase()}. {friend.display_name} will see it in their quests.
            </p>
            <p className="fr-note">Eat something {color.name.toLowerCase()} today or tomorrow, then tap I did it on the quest.</p>
            <div className="fr-actions">
              <button className="fr-btn" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
