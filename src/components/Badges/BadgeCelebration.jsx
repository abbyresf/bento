import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { haptics } from '../../lib/haptics';
import BentoBoxThumb from './BentoBoxThumb';

const BentoBox = lazy(() => import('./BentoBox'));
import './BadgeCelebration.css';

/* A badge unlocking. The card lifts in on a spring, the bento box appears with the new
 * piece dropping into it, a sheen crosses the card once, and the text follows in turn. */
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
        <div className="badge-celebration-box">
          <Suspense fallback={<BentoBoxThumb level={badge.fill} size={170} />}>
            <BentoBox level={badge.fill} size={170} justAdded />
          </Suspense>
        </div>
        <div className="badge-celebration-title">Badge unlocked</div>
        <div className="badge-celebration-name">{badge.name}</div>
        <div className="badge-celebration-desc">{badge.description}</div>
        <div className="badge-celebration-adds">Added: {badge.adds}</div>
        <div className="badge-celebration-hint">Tap to continue</div>
      </div>
    </div>
  );
}
