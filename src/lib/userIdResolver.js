/* The signed-in user's id, asked of the server but shared.
 *
 * Every database helper used to call auth.getUser(), and getUser is a round trip to Supabase Auth, so opening the app
 * made dozens of them at once. This keeps getUser as the source (getSession can return null mid-refresh and silently
 * break writes, so it is never the first choice) and shares the answer in two ways:
 *   - callers that ask while a request is already out wait for that one request;
 *   - a good answer is reused for `ttlMs`.
 * A signed-out answer and an offline fallback are never kept, so signing in, or the network coming back, is seen at once.
 * `reset()` drops everything and is called on every auth change. A request that started before a reset cannot store its
 * answer afterwards, so a sign-out cannot leave the old id behind.
 *
 * Kept free of the Supabase client so it can be tested on its own: authId.js wires it up. */
export function createUserIdResolver({ getUser, getSession, isOffline, ttlMs = 30000, now = Date.now }) {
  let kept = null;       // { id, at }
  let inflight = null;
  let epoch = 0;

  async function fetchId(myEpoch) {
    const { data, error } = await getUser();
    const id = data?.user?.id;
    if (id) {
      if (myEpoch === epoch) kept = { id, at: now() };
      return id;
    }
    // No signal says nothing about who is signed in: fall back to the stored session, and keep nothing.
    if (error && isOffline(error)) {
      const { data: s } = await getSession();
      return s?.session?.user?.id;
    }
    return undefined;
  }

  return {
    get() {
      if (kept && now() - kept.at < ttlMs) return Promise.resolve(kept.id);
      if (inflight) return inflight;
      const myEpoch = epoch;
      const p = fetchId(myEpoch).finally(() => { if (inflight === p) inflight = null; });
      inflight = p;
      return p;
    },
    reset() { epoch += 1; kept = null; inflight = null; },
  };
}
