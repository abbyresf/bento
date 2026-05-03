import { useEffect } from 'react';
import './BadgeCelebration.css';

export default function BadgeCelebration({ badge, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="badge-celebration" onClick={onDismiss}>
      <div className="badge-celebration-inner">
        <div className="badge-celebration-shine" />
        <div className="badge-celebration-emoji">{badge.emoji}</div>
        <div className="badge-celebration-title">Badge Unlocked!</div>
        <div className="badge-celebration-name">{badge.name}</div>
        <div className="badge-celebration-desc">{badge.description}</div>
        <div className="badge-celebration-hint">Tap to continue</div>
      </div>
    </div>
  );
}
