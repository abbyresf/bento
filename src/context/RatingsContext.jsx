import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { getMyRatings, rateItem as dbRateItem, getRatingAggregates, getUserProfile } from '../lib/db';

const RatingsContext = createContext(null);

export function RatingsProvider({ children }) {
  const [myRatings, setMyRatings]     = useState({});   // { [item_id]: { rating, name } }
  const [aggregates, setAggregates]   = useState({});   // { [item_id]: { avg, count, name } }
  const [loadingRatings, setLoading]  = useState(true);
  const universityRef = useRef('brandeis');

  useEffect(() => {
    Promise.all([getMyRatings(), getUserProfile()]).then(([mine, profile]) => {
      const university = profile?.university ?? 'brandeis';
      universityRef.current = university;
      getRatingAggregates(university).then(aggs => {
        setMyRatings(mine);
        setAggregates(aggs);
        setLoading(false);
      });
    });
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
