import { useCallback, useEffect, useState } from 'react';
import { getStudyStatus, researchEnabled } from './research';
import { summarizeStudy } from '../data/research';

/* Where the signed-in student stands in the research study.
 * status: 'idle' | 'ok' | 'unavailable' | 'offline'. On the web and on Android it
 * is 'unavailable' from the start and the network is never touched. */
export function useStudyStatus() {
  const enabled = researchEnabled();
  const [state, setState] = useState(() => ({
    status: enabled ? 'idle' : 'unavailable',
    study: summarizeStudy(null),
  }));

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setState(await getStudyStatus());
  }, [enabled]);

  useEffect(() => {
    let alive = true;
    if (enabled) getStudyStatus().then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, [enabled]);

  return { ...state, refresh, setStudy: (study) => setState((s) => ({ ...s, study })) };
}
