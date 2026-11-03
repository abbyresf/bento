/* Share one read between callers that ask close together.
 *
 * Opening the app asks for the same row several times in the first moments (onboarding, terms, outfit, color, meal
 * settings, athlete mode). `shared(fn)` runs `fn` once and hands every caller in the next `windowMs` the same promise.
 * It is not a cache: after the window the next caller reads again, and `forget()` drops the shared read at once, which
 * every write calls so a read after a write never sees the old row. A failed read is not shared. */
export function createCoalescer(windowMs = 1000, now = Date.now) {
  let current = null;   // { promise, at }
  return {
    shared(fn) {
      if (current && now() - current.at < windowMs) return current.promise;
      const entry = { at: now(), promise: null };
      entry.promise = Promise.resolve().then(fn).then(
        (v) => v,
        (e) => { if (current === entry) current = null; throw e; },
      );
      current = entry;
      return entry.promise;
    },
    forget() { current = null; },
  };
}
