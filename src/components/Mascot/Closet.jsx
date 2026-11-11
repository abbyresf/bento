import { useEffect, useRef, useState } from 'react';
import Mascot from './Mascot';
import { OUTFITS, closetOrder, isUnlocked, unlockHint, visibleOutfits } from '../../data/mascotOutfits';
import { setOutfit, useOutfit } from '../../lib/mascotOutfit';
import { setMascotColor, useMascotColor } from '../../lib/mascotColor';
import { getDuoPerks } from '../../lib/duo';
import { COLORS, canWear } from '../../data/mascotColors';
import { getStreak, getVoiceStats, getQuestsClaimed } from '../../lib/db';
import { getGiftPieces } from '../../lib/gifts';
import { haptics } from '../../lib/haptics';
import './Closet.css';

/* Bento's closet: a sheet with the mascot on top and a grid of pieces below.
 * Earned pieces can be tapped to wear, locked ones say what unlocks them.
 * Tapping the piece being worn takes it off. */
export default function Closet({ onClose }) {
  const worn = useOutfit();
  // Swipe down to close: when the sheet is scrolled to the top, dragging down moves it with the finger. Let go past
  // 90px, or with a quick flick, and it closes. Anything less springs back.
  const sheetRef = useRef(null);
  const drag = useRef(null);
  const onTouchStart = (e) => {
    const el = sheetRef.current;
    if (!el || el.scrollTop > 0) { drag.current = null; return; }
    drag.current = { y: e.touches[0].clientY, t: Date.now(), dy: 0 };
  };
  const onTouchMove = (e) => {
    const d = drag.current; const el = sheetRef.current;
    if (!d || !el) return;
    d.dy = e.touches[0].clientY - d.y;
    if (d.dy <= 0 || el.scrollTop > 0) { el.style.transform = ''; return; }
    el.style.transition = 'none';
    el.style.transform = `translateY(${d.dy}px)`;
  };
  const onTouchEnd = () => {
    const d = drag.current; const el = sheetRef.current;
    drag.current = null;
    if (!d || !el) return;
    const fast = d.dy > 40 && d.dy / Math.max(1, Date.now() - d.t) > 0.6;
    el.style.transition = 'transform .22s ease';
    if (d.dy > 90 || fast) {
      haptics.light();
      el.style.transform = 'translateY(100%)';
      setTimeout(onClose, 200);
    } else {
      el.style.transform = '';
    }
  };
  const color = useMascotColor();
  const [perks, setPerks] = useState(undefined);   // buddy quests claimed, or null when Buddies is not there
  const [ctx, setCtx] = useState(null);

  useEffect(() => {
    let off = false;
    Promise.all([getStreak(), getVoiceStats(), getQuestsClaimed(), getGiftPieces()]).then(([streak, voice, claimed, gifts]) => {
      if (off) return;
      setCtx({
        longestStreak: streak?.longestStreak ?? 0,
        dishesRated: voice?.dishesRated ?? 0,
        questsClaimed: claimed ?? 0,
        gifts,
      });
    }).catch(() => { if (!off) setCtx({ longestStreak: 0, dishesRated: 0, questsClaimed: 0, gifts: [] }); });
    return () => { off = true; };
  }, []);

  useEffect(() => { let off = false; getDuoPerks().then((n) => { if (!off) setPerks(n); }).catch(() => { if (!off) setPerks(null); }); return () => { off = true; }; }, []);

  const chooseColor = (id) => {
    if (!canWear(id, perks ?? 0)) { haptics.warning(); return; }
    haptics.selection();
    setMascotColor(id);
  };

  const shown = visibleOutfits(OUTFITS, ctx ?? {});
  const earned = ctx ? shown.filter((o) => isUnlocked(o, ctx)).length : 0;

  const choose = (item) => {
    if (!ctx || !isUnlocked(item, ctx)) { haptics.warning(); return; }
    haptics.selection();
    setOutfit(worn === item.id ? null : item.id);
  };

  return (
    <div className="closet-overlay" onClick={onClose}>
      <div className="closet" ref={sheetRef} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Bento's closet"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
        <div className="closet-handle" />
        <div className="closet-stage">
          <Mascot mood="cheer" size={120} outfit={worn} key={`${worn ?? 'none'}-${color ?? 'classic'}`} />
        </div>
        <h3>Bento's closet</h3>
        <p className="closet-sub">{ctx ? `${earned} of ${shown.length} unlocked` : ' '}</p>

        <div className="closet-grid">
          {closetOrder(shown, ctx ?? {}).map((item) => {
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

        {perks !== null && perks !== undefined && (
          <>
            <h3 className="closet-colors-title">Colors</h3>
            <p className="closet-sub">{perks >= 1 ? 'Pick a color for Bento' : 'Claim a buddy quest to unlock colors'}</p>
            <div className="closet-colors" role="radiogroup" aria-label="Bento color">
              {COLORS.map((c) => {
                const open = canWear(c.id, perks);
                const on = (color ?? 'classic') === c.id;
                return (
                  <button
                    key={c.id}
                    className={`closet-swatch${on ? ' on' : ''}${open ? '' : ' locked'}`}
                    style={{ '--swatch': c.body, '--swatch-a': c.a, '--swatch-b': c.b }}
                    role="radio"
                    aria-checked={on}
                    aria-label={open ? `${c.name}${on ? ', worn' : ''}` : `${c.name}, locked`}
                    onClick={() => chooseColor(c.id)}
                  >
                    <span className="closet-swatch-dot" />
                    <span className="closet-swatch-name">{c.name}</span>
                    {!open && <span className="closet-lock" aria-hidden="true">🔒</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button className="closet-done" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
