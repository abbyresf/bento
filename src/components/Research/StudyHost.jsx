import { useCallback, useEffect, useRef, useState } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import StudySurvey from './StudySurvey';
import { getPendingSurvey, logAppOpen, researchEnabled } from '../../lib/research';
import { msUntil } from '../../data/research';

/* The study's part of the running app, iOS only. It renders nothing unless the
 * end-of-day questions are waiting, and it does nothing at all on the web, on
 * Android, or for anyone who is not in a study (the database simply says nothing
 * is waiting).
 *
 * It asks what is waiting in four situations, so the questions appear without the
 * student having to tap a notification:
 *   1. when the app starts,
 *   2. whenever the app comes back to the front,
 *   3. when a notification arrives or is tapped,
 *   4. at the moment today's questions come due, if the app is open then.
 * iOS cannot launch a closed app on a timer, so a closed app waits for 1, 2 or 3.
 *
 * Opening the app is also reported to the research team (at most one every 20
 * minutes, decided by the database). */
export default function StudyHost() {
  const enabled = researchEnabled();
  const [survey, setSurvey] = useState(null);
  const dismissed = useRef(new Set());   // days the student closed this session
  const timer = useRef(null);
  const open = useRef(null);             // the survey on screen, to avoid replacing it mid-answer

  // Named inside, so the timer at the end can call it again.
  const check = useCallback(async function run() {
    clearTimeout(timer.current);
    const res = await getPendingSurvey();
    if (res.status !== 'ok') return;
    const s = res.survey;
    if (s.state === 'pending' && !dismissed.current.has(s.forDate) && open.current?.forDate !== s.forDate) {
      open.current = s;
      setSurvey(s);
    }
    const wait = s.state === 'unavailable' ? null : msUntil(s.nextDueAt);
    if (wait) timer.current = setTimeout(run, wait);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    check();
    logAppOpen();

    const onVisible = () => {
      if (document.visibilityState === 'visible') { check(); logAppOpen(); }
    };
    document.addEventListener('visibilitychange', onVisible);

    // A study push, arriving or tapped, means ask now. The payload is not trusted
    // or even read: the database says what is waiting.
    const handles = [
      PushNotifications.addListener('pushNotificationReceived', () => setTimeout(check, 800)),
      PushNotifications.addListener('pushNotificationActionPerformed', () => setTimeout(check, 300)),
    ];

    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
      handles.forEach((h) => Promise.resolve(h).then((x) => x?.remove?.()).catch(() => {}));
    };
  }, [enabled, check]);

  if (!enabled || !survey) return null;

  const close = () => {
    dismissed.current.add(survey.forDate);
    open.current = null;
    setSurvey(null);
  };
  const sent = () => { dismissed.current.add(survey.forDate); };

  return <StudySurvey survey={survey} onClose={close} onSent={sent} />;
}
