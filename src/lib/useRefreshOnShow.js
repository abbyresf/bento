import { useEffect, useRef } from 'react';

/* Run `load` again when a tab that stays mounted comes back into view.
 *
 * App.jsx keeps every visited tab mounted and only hides it, so a tab that loads its data once on mount never updates:
 * Insights showed old totals after a meal was confirmed, and Community and Buddies the same. This hands back a ref for the
 * tab's root element and calls `load` when that element becomes visible, when the app returns to the front, and (if
 * `everyMs` is set) on a timer while it is showing. Never more often than `minGapMs`, so flicking between tabs does not
 * refetch each time, and never while the tab is hidden or the app is in the background. The load that happens on mount
 * counts as the first one. `deps` re-attaches the observer when the root element is replaced. */
export function useRefreshOnShow(load, { minGapMs = 20000, everyMs = 0, deps = [] } = {}) {
  const root = useRef(null);
  const latest = useRef(load);
  useEffect(() => { latest.current = load; });
  useEffect(() => {
    let last = Date.now();
    const showing = () => Boolean(root.current) && root.current.offsetParent !== null && document.visibilityState === 'visible';
    const refresh = () => {
      if (!showing() || Date.now() - last < minGapMs) return;
      last = Date.now();
      latest.current?.();
    };
    const timer = everyMs > 0 ? setInterval(refresh, everyMs) : null;
    const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) refresh(); }) : null;
    if (io && root.current) io.observe(root.current);
    document.addEventListener('visibilitychange', refresh);
    return () => { if (timer) clearInterval(timer); io?.disconnect(); document.removeEventListener('visibilitychange', refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return root;
}
