import { useCallback, useEffect, useState } from 'react';
import { haptics } from '../../lib/haptics';
import './BadgeCelebration.css';

/* A badge unlocking. The card lifts in on a spring, the badge drops in over it
 * with a glow, a sheen crosses the card once, and the text follows in turn. */
export default function BadgeCelebration({ badge, onDismiss }) {
  const [leaving, setLeaving] = useState(false);

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(onDismiss, 240);
  }, [onDismiss]);

  useEffect(() => {
    haptics.success();
    const t = setTimeout(close, 4200);
    return () => clearTimeout(t);
  }, [close]);

  return (
    <div className={`badge-celebration${leaving ? ' leaving' : ''}`} onClick={close}>
      <div className="badge-celebration-inner">
        <div className="badge-celebration-sheen" aria-hidden="true" />
        <div className="badge-celebration-glow" aria-hidden="true" />
        <div className="badge-celebration-emoji">{badge.emoji}</div>
        <div className="badge-celebration-title">Badge unlocked</div>
        <div className="badge-celebration-name">{badge.name}</div>
        <div className="badge-celebration-desc">{badge.description}</div>
        <div className="badge-celebration-hint">Tap to continue</div>
      </div>
    </div>
  );
}
