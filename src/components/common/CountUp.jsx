import { useEffect, useRef, useState } from 'react';

/* A number that travels to its new value instead of jumping to it.
 *
 * Apple's fitness and wallet screens do this: the eye follows the change, so a
 * plate total that moves from 480 to 720 reads as "you added 240" rather than as
 * a number that flickered. Ease-out, so it decelerates into the final value.
 *
 * Starts from the value it last showed, so adding an item to a plate counts up
 * from the old total. On first mount it counts up from zero, which is the small
 * moment of arrival. Under reduced motion it just shows the number.
 */
const prefersReduced = () =>
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function CountUp({ value, duration = 700, suffix = '', from = 0 }) {
  const target = Number.isFinite(value) ? value : 0;
  const [shown, setShown] = useState(prefersReduced() ? target : from);
  const current = useRef(shown);

  useEffect(() => {
    if (prefersReduced()) { current.current = target; return; }
    const start = current.current;
    if (start === target) return;
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      const v = Math.round(start + (target - start) * eased);
      current.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  // While counting, digits keep equal width so the text does not shimmy.
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(prefersReduced() ? target : shown)}{suffix}</span>;
}
