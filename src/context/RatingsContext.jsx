import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { getMyRatings, rateItem as dbRateItem, getRatingAggregates, getUserProfile, flushPendingRatings } from '../lib/db';
import { readRatingQueue } from '../lib/pendingRatings';

const RatingsContext = createContext(null);

export function RatingsProvider({ children }) {
  const [myRatings, setMyRatings]     = useState({});   // { [item_id]: { rating, name } }
  const [aggregates, setAggregates]   = useState({});   // { [item_id]: { avg, count, name } }
  const [loadingRatings, setLoading]  = useState(true);
  const universityRef = useRef('brandeis');

  useEffect(() => {
    // A failed read used to leave loadingRatings true for good, since nothing handled the rejection.
    Promise.all([getMyRatings(), getUserProfile()]).then(([mine, profile]) => {
      const university = profile?.university ?? 'brandeis';
      universityRef.current = university;
      return getRatingAggregates(university).then(aggs => {
        // A rating still waiting to be sent counts, so a student's stars are the same after a restart as before it.
        const withQueued = { ...mine };
        for (const q of readRatingQueue()) {
          if (q.rating === null) delete withQueued[q.id];
          else withQueued[q.id] = { rating: q.rating, name: q.name };
        }
        setMyRatings(withQueued);
        setAggregates(aggs);
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Ratings that could not be saved at the time are sent when the app opens, when it comes back to the front, and when the
  // connection returns.
  useEffect(() => {
    const send = () => { flushPendingRatings().catch(() => {}); };
    send();
    const onVisible = () => { if (document.visibilityState === 'visible') send(); };
    window.addEventListener('online', send);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('online', send); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const rateItem = useCallback(async (item, rating, diningHall = null) => {
    await dbRateItem(item, rating, diningHall);
    setMyRatings(prev => {
      if (rating === null) {
        const next = { ...prev };
        delete next[item.id];
        return next;
      }
      return { ...prev, [item.id]: { rating, name: item.name } };
    });
    // Refresh aggregates in background after rating changes
    getRatingAggregates(universityRef.current).then(setAggregates);
  }, []);

  // Items rated 4-5 stars feed the optimizer the same way favorites used to
  const highRatedIds = new Set(
    Object.entries(myRatings)
      .filter(([, v]) => v.rating >= 4)
      .map(([id]) => id)
  );

  // The full signal, id -> stars. The optimizer needs the low ratings too:
  // telling Bento you disliked something should stop it coming back, not just
  // fail to help.
  const ratingsById = new Map(
    Object.entries(myRatings).map(([id, v]) => [id, v.rating])
  );

  return (
    <RatingsContext.Provider value={{ myRatings, aggregates, highRatedIds, ratingsById, rateItem, loadingRatings }}>
      {children}
    </RatingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRatings() {
  return useContext(RatingsContext);
}
