import { useRef, useState } from 'react';
import { haptics } from '../../lib/haptics';
import './DragSlider.css';

/* A slider you drag.
 *
 * The thumb follows your finger continuously, so it feels like pushing
 * something along a rail. On release it springs to the nearest stop. Each stop
 * you cross gives a small tick. A tap anywhere on the rail also works, and so
 * do the arrow keys, for anyone not using a finger.
 *
 * This replaces <input type="range">. On iOS that control is hard to grab when
 * it sits inside a scrolling sheet, and a tap on its rail did the job a drag
 * should have: people found they could tap the answer but not slide to it.
 *
 * `value` is the index of the current stop, 0 to `stops - 1`. `answered` is
 * whether the person has chosen yet. Until they have, the thumb is drawn as an
 * outline, so it is clear that the resting position is not an answer.
 */
export default function DragSlider({ stops, value, onChange, answered = true, ariaLabel, ariaValueText }) {
  const railRef = useRef(null);
  const [drag, setDrag] = useState(null);   // 0..1 while a finger is down, else null
  const lastStop = useRef(value);

  const max = stops - 1;
  const pos = drag ?? value / max;

  const fromPointer = (clientX) => {
    const r = railRef.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const update = (p) => {
    setDrag(p);
    const stop = Math.round(p * max);
    if (stop !== lastStop.current) {
      lastStop.current = stop;
      haptics.selection();
      onChange(stop);
    } else if (!answered) {
      onChange(stop);
    }
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastStop.current = value;
    update(fromPointer(e.clientX));
  };
  const onPointerMove = (e) => {
    if (drag === null) return;
    update(fromPointer(e.clientX));
  };
  const end = () => setDrag(null);

  const onKeyDown = (e) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.min(max, Math.max(0, value + step));
    if (next !== value) { haptics.selection(); onChange(next); }
  };

  return (
    <div
      className={`dslider${answered ? ' answered' : ''}${drag !== null ? ' dragging' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={ariaValueText}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
    >
      <div className="dslider-rail" ref={railRef}>
        <div className="dslider-fill" style={{ width: `${pos * 100}%` }} />
        {Array.from({ length: stops }, (_, i) => (
          <span
            key={i}
            className={`dslider-stop${i / max <= pos + 0.001 ? ' passed' : ''}`}
            style={{ left: `${(i / max) * 100}%` }}
          />
        ))}
        <div className="dslider-thumb" style={{ left: `${pos * 100}%` }} />
      </div>
    </div>
  );
}
