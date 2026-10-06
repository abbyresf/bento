import { useCallback, useEffect, useState } from 'react';
import CountUp from '../common/CountUp';
import { haptics } from '../../lib/haptics';
import './StreakCelebration.css';

/* The moment a streak grows. The flame springs in over expanding rings, the day
 * count rolls up from yesterday's number, and the phone taps once. It leaves
 * the same way it arrived, with a fade and a settle, rather than vanishing. */
export default function StreakCelebration({ streak, onDismiss }) {
  const [leaving, setLeaving] = useState(false);

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(onDismiss, 260);
  }, [onDismiss]);

  useEffect(() => {
    haptics.success();
    const t = setTimeout(close, 3200);
    return () => clearTimeout(t);
  }, [close]);

  return (
    <div className={`streak-celebration${leaving ? ' leaving' : ''}`} onClick={close}>
      <div className="streak-rings" aria-hidden="true">
        <span /><span /><span />
      </div>
      <div className="streak-celebration-inner">
        <div className="flame-pop">🔥</div>
        <div className="streak-day-label">
          <CountUp value={streak} from={Math.max(0, streak - 1)} duration={900} />
        </div>
        <div className="streak-day-unit">day streak</div>
        <div className="streak-caption">Keep it up</div>
      </div>
    </div>
  );
}
