import { useSyncExternalStore } from 'react';
import { getFriends, getMyDuo } from './duo';

/* The friend list, shared by every screen that shows it.
 *
 * A small store, like mascotOutfit.js, so Today and Settings agree without
 * passing anything down. It refreshes on demand, when the app comes back to the
 * front, and on a timer while a screen that needs it is mounted (see useFriends).
 *
 * status: 'idle' before the first answer, 'ok', 'offline' (showing the last
 * saved list), or 'unavailable' when the database has no Duo yet. */
let state = { status: 'idle', friends: [], me: null };
const listeners = new Set();
let inflight = null;

function emit(next) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function getFriendsState() { return state; }

export async function refreshFriends() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [res, me] = await Promise.all([getFriends(), getMyDuo()]);
      emit({ status: res.status, friends: res.friends, me });
    } catch {
      emit({ status: 'offline' });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/* Called on sign out, after local storage has been cleared. */
export function resetFriends() {
  state = { status: 'idle', friends: [], me: null };
  listeners.forEach((l) => l());
}

const REFRESH_MS = 60 * 1000;
let users = 0;
let timer = null;
let onVisible = null;

function start() {
  refreshFriends();
  timer = setInterval(() => { if (document.visibilityState === 'visible') refreshFriends(); }, REFRESH_MS);
  onVisible = () => { if (document.visibilityState === 'visible') refreshFriends(); };
  document.addEventListener('visibilitychange', onVisible);
}
function stop() {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisible);
  timer = null; onVisible = null;
}

// Defined once. useSyncExternalStore resubscribes whenever this function changes
// identity, and each resubscribe would restart the refresh and loop.
function subscribe(cb) {
  listeners.add(cb);
  if (users++ === 0) start();
  return () => {
    listeners.delete(cb);
    if (--users === 0) stop();
  };
}

export function useFriends() {
  return useSyncExternalStore(subscribe, getFriendsState, getFriendsState);
}
