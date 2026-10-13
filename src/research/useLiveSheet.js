import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { fetchSheet } from './data.js';

/* Rows for one sheet, kept current. Reads the sheet, then listens for changes to
 * the tables it depends on and reads it again a moment after the last one, so a
 * burst of changes is one read. Realtime only says that something changed. The
 * rows always come from the sheet's own view, so what is shown is exactly what the
 * policies allow.
 *
 * status: 'connecting' | 'live' | 'offline'. Without a live connection the sheet
 * still works. It just does not move until it is read again. */
export function useLiveSheet(sheet, { debounceMs = 900 } = {}) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [status, setStatus] = useState('connecting');
  const timer = useRef(null);
  const seq = useRef(0);

  const load = useCallback(async (first) => {
    const mine = ++seq.current;
    try {
      const next = await fetchSheet(sheet, { onProgress: first ? setLoaded : undefined });
      if (mine !== seq.current) return;      // a newer read has started
      setRows(next); setError(''); setUpdatedAt(new Date());
    } catch (e) {
      if (mine === seq.current) setError(e.message);
    }
  }, [sheet]);

  // A sheet never changes under a mounted hook: the page that shows another sheet
  // mounts a new one (it keys on the sheet), so there is nothing to reset here.
  useEffect(() => {
    // Started from a timer, not from the effect itself, because the read reports
    // progress through state and an effect should not set state while it runs.
    const first = setTimeout(() => load(true), 0);

    const tables = sheet.watch ?? [];
    const channel = supabase.channel(`research-${sheet.id}-${Math.random().toString(36).slice(2, 8)}`);
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'research', table }, () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => load(false), debounceMs);
      });
    }
    channel.subscribe((s) => setStatus(s === 'SUBSCRIBED' ? 'live' : s === 'CONNECTING' ? 'connecting' : 'offline'));

    return () => {
      clearTimeout(first);
      clearTimeout(timer.current);
      seq.current += 1;
      supabase.removeChannel(channel);
    };
  }, [sheet, load, debounceMs]);

  return { rows, error, loaded, updatedAt, status, reload: () => load(false) };
}
