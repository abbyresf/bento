import { useEffect } from 'react';
import './StreakCelebration.css';

export default function StreakCelebration({ streak, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 2500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="streak-celebration" onClick={onDismiss}>
      <div className="streak-celebration-inner">
        <div className="flame-pop">🔥</div>
        <div className="streak-day-label">Day {streak}</div>
        <div className="streak-caption">Keep it up!</div>
      </div>
    </div>
  );
}
