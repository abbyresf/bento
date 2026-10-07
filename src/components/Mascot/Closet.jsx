import { useEffect, useState } from 'react';
import Mascot from './Mascot';
import { OUTFITS, isUnlocked, unlockHint } from '../../data/mascotOutfits';
import { setOutfit, useOutfit } from '../../lib/mascotOutfit';
import { getStreak, getVoiceStats } from '../../lib/db';
import { haptics } from '../../lib/haptics';
import './Closet.css';

/* Bento's closet: a sheet with the mascot on top and a grid of pieces below.
 * Earned pieces can be tapped to wear, locked ones say what unlocks them.
 * Tapping the piece being worn takes it off. */
export default function Closet({ onClose }) {
  const worn = useOutfit();
  const [ctx, setCtx] = useState(null);

  useEffect(() => {
    let off = false;
    Promise.all([getStreak(), getVoiceStats()]).then(([streak, voice]) => {
      if (off) return;
      setCtx({
        longestStreak: streak?.longestStreak ?? 0,
        dishesRated: voice?.dishesRated ?? 0,
      });
    }).catch(() => { if (!off) setCtx({ longestStreak: 0, dishesRated: 0 }); });
    return () => { off = true; };
  }, []);

  const earned = ctx ? OUTFITS.filter((o) => isUnlocked(o, ctx)).length : 0;

  const choose = (item) => {
    if (!ctx || !isUnlocked(item, ctx)) { haptics.warning(); return; }
    haptics.selection();
    setOutfit(worn === item.id ? null : item.id);
  };

  return (
    <div className="closet-overlay" onClick={onClose}>
      <div className="closet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Bento's closet">
        <div className="closet-handle" />
        <div className="closet-stage">
          <Mascot mood="cheer" size={120} outfit={worn} key={worn ?? 'none'} />
        </div>
        <h3>Bento's closet</h3>
        <p className="closet-sub">{ctx ? `${earned} of ${OUTFITS.length} unlocked` : ' '}</p>

        <div className="closet-grid">
          {OUTFITS.map((item) => {
            const open = ctx ? isUnlocked(item, ctx) : false;
            const on = worn === item.id;
            return (
              <button
                key={item.id}
                className={`closet-item${on ? ' on' : ''}${open ? '' : ' locked'}`}
                onClick={() => choose(item)}
                aria-pressed={on}
                aria-label={open ? `${item.name}${on ? ', worn' : ''}` : `${item.name}, locked. ${unlockHint(item, ctx ?? {})}`}
              >
                <span className="closet-thumb">
                  <Mascot mood="happy" size={52} hop={false} outfit={open ? item.id : null} />
                  {!open && <span className="closet-lock" aria-hidden="true">🔒</span>}
                </span>
                <span className="closet-name">{item.name}</span>
                <span className="closet-note">{open ? (on ? 'Wearing' : 'Tap to wear') : unlockHint(item, ctx ?? {})}</span>
              </button>
            );
          })}
        </div>

        <button className="closet-done" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
