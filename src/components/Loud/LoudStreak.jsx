import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import CountUp from '../common/CountUp';
import Mascot from '../Mascot/Mascot';
import { haptics } from '../../lib/haptics';
import { streakStyle, streakLine } from './streakStyle.js';
import './loud.css';
import './loud-streak.css';

/* The streak moment in the Loud pilot. Full screen, Bento pops up cheering, the day count rolls up, and the background
 * is one of four looks that take turns day to day: stripes bursting from the center, dots, confetti, or a moving
 * gradient. Tap anywhere or Done to close; it also leaves on its own after a few seconds. */
export default function LoudStreak({ streak, onDismiss }) {
  const [leaving, setLeaving] = useState(false);
  const style = streakStyle(streak);
  const line = streakLine(streak);
  const pieces = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    left: (i * 37) % 100, delay: (i % 7) * 0.12, dur: 1.6 + (i % 5) * 0.25, rot: (i * 47) % 360,
    color: ['var(--or)', 'var(--pk)', 'var(--sk)', 'var(--lc)', 'var(--bu)', 'var(--li)'][i % 6],
  })), []);

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(onDismiss, 260);
  }, [onDismiss]);

  useEffect(() => {
    haptics.success();
    const t = setTimeout(close, 5200);
    return () => clearTimeout(t);
  }, [close]);

  return createPortal(
    <div className={`loud ls-screen ls-${style}${leaving ? ' is-leaving' : ''}`} onClick={close} role="dialog" aria-label={`${streak} day streak`}>
      <div className="ls-bg" aria-hidden="true" />
      {style === 'confetti' && (
        <div className="ls-pieces" aria-hidden="true">
          {pieces.map((p, i) => (
            <i key={i} style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, '--r': `${p.rot}deg` }} />
          ))}
        </div>
      )}
      <div className="ls-content">
        <div className="ls-num"><CountUp value={streak} from={Math.max(0, streak - 1)} duration={900} /></div>
        <div className="ls-unit">Day streak</div>
        <p className="ls-line">{line}</p>
        <div className="ls-bento"><Mascot mood="cheer" size={150} /></div>
      </div>
      <button type="button" className="ls-done" onClick={(e) => { e.stopPropagation(); close(); }}>Done</button>
    </div>,
    document.body,
  );
}
