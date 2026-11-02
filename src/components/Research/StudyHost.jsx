import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import StudySurvey from './StudySurvey';
import StudyStart from './StudyStart';
import { getPendingSurvey, getStudyStatus, getFinalSurvey, openOutsideApp, logAppOpen, researchEnabled } from '../../lib/research';
import { peekStartCode, forgetStartCode } from '../../lib/startLink';
import { msUntil, START_TITLE, FINAL_TITLE, FINAL_NOTE, FINAL_BUTTON } from '../../data/research';
import '../Friends/Friends.css';
import './Research.css';

/* The study's part of the running app, in the iOS app and the web app on Android.
 * It renders nothing unless something is waiting, and nothing at all anywhere
 * else or for anyone who is not in a study (the database simply says nothing is
 * waiting).
 *
 * Three things can open by themselves:
 *   - the end-of-day questions, when they are due,
 *   - the start-code screen, when the QR code at the snack pickup station was
 *     scanned and the student has joined but not started,
 *   - the final survey, from the last day.
 *
 * It asks what is waiting in four situations, so these appear without the student
 * having to tap a notification:
 *   1. when the app starts,
 *   2. whenever the app comes back to the front,
 *   3. when a notification arrives or is tapped (the apps),
 *   4. at the moment today's questions come due, if the app is open then.
 * A phone cannot launch a closed app on a timer, so a closed app waits for 1, 2 or 3.
 *
 * Opening the app is also reported to the research team (at most one every 20
 * minutes, decided by the database). */
export default function StudyHost() {
  const enabled = researchEnabled();
  const [survey, setSurvey] = useState(null);
  const [start, setStart] = useState('');          // a start code waiting to be used
  const [final, setFinal] = useState(null);        // { url }
  const dismissed = useRef(new Set());   // days the student closed this session
  const finalSeen = useRef(false);
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

    if (!finalSeen.current) {
      const f = await getFinalSurvey();
      if (f.available) { finalSeen.current = true; setFinal({ url: f.url }); }
    }
  }, []);

  // A start code waiting, used only by someone who has joined and not started.
  const checkStart = useCallback(async () => {
    const code = peekStartCode();
    if (!code) return;
    const res = await getStudyStatus();
    if (res.status !== 'ok') return;
    if (res.study.state === 'pending') setStart(code);
    else if (res.study.state === 'active') forgetStartCode();   // already started: the code is spent
    // Not joined yet: keep it, the join screen offers it once they have.
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    check();
    checkStart();
    logAppOpen();

    const onVisible = () => {
      if (document.visibilityState === 'visible') { check(); checkStart(); logAppOpen(); }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('bento-start-code', checkStart);

    // A study push, arriving or tapped, means ask now. The payload is not trusted
    // or even read: the database says what is waiting. The web app has no such
    // listener: tapping a notification brings it to the front, which is case 2.
    const handles = Capacitor.isNativePlatform() ? [
      PushNotifications.addListener('pushNotificationReceived', () => setTimeout(check, 800)),
      PushNotifications.addListener('pushNotificationActionPerformed', () => setTimeout(check, 300)),
    ] : [];

    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('bento-start-code', checkStart);
      handles.forEach((h) => Promise.resolve(h).then((x) => x?.remove?.()).catch(() => {}));
    };
  }, [enabled, check, checkStart]);

  if (!enabled) return null;

  if (start) {
    const done = () => { forgetStartCode(); setStart(''); };
    return (
      <div className="fr-overlay" onClick={done}>
        <div className="fr-sheet" role="dialog" aria-modal="true" aria-label={START_TITLE} onClick={(e) => e.stopPropagation()}>
          <div className="fr-head">
            <h3>{START_TITLE}</h3>
            <button type="button" className="fr-close" onClick={() => setStart('')} aria-label="Close">×</button>
          </div>
          <StudyStart initialCode={start} onStarted={() => { forgetStartCode(); check(); }} onLater={() => setStart('')} />
        </div>
      </div>
    );
  }

  if (survey) {
    const close = () => {
      dismissed.current.add(survey.forDate);
      open.current = null;
      setSurvey(null);
    };
    const sent = () => { dismissed.current.add(survey.forDate); };
    return <StudySurvey survey={survey} onClose={close} onSent={sent} />;
  }

  if (final) {
    return (
      <div className="fr-overlay" onClick={() => setFinal(null)}>
        <div className="fr-sheet" role="dialog" aria-modal="true" aria-label={FINAL_TITLE} onClick={(e) => e.stopPropagation()}>
          <div className="fr-head">
            <h3>{FINAL_TITLE}</h3>
            <button type="button" className="fr-close" onClick={() => setFinal(null)} aria-label="Close">×</button>
          </div>
          <p className="fr-note" style={{ marginTop: 0 }}>{FINAL_NOTE}</p>
          <div className="fr-actions">
            <button type="button" className="fr-btn" onClick={() => openOutsideApp(final.url)}>{FINAL_BUTTON}</button>
            <button type="button" className="fr-btn-quiet" onClick={() => setFinal(null)}>Not now</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
