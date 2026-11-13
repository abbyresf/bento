import { useEffect, useRef, useState } from 'react';
import { activateStudy } from '../../lib/research';
import { subscribeToPush, getPushEnabled } from '../../lib/push';
import { CODE_MAX, START_HELP, START_DONE, dayText, pushResultText } from '../../data/research';
import '../Friends/Friends.css';
import './Research.css';

/* Starting the week: the code from the snack pickup station. It arrives typed, or
 * from the QR code (initialCode), in which case it is sent at once. Nothing the
 * student sees says who they are in the study, and nothing is shown that the
 * research team's records already hold. After it works, the reminders step (the
 * phone's notification permission) is offered right here, because the first
 * reminder comes within hours. */
export default function StudyStart({ initialCode = '', onStarted, onLater, startedAs = null }) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // startedAs: the week already started when they joined (one code). Show the
  // started state and the reminders step straight away, with no code to enter.
  const [started, setStarted] = useState(startedAs); // { dayNumber, totalDays }
  const [pushOn, setPushOn] = useState(null);       // null until known
  useEffect(() => {
    if (!startedAs) return;
    getPushEnabled().then(setPushOn).catch(() => setPushOn(false));
  }, [startedAs]);
  const [pushNote, setPushNote] = useState('');

  const start = async (e, withCode = code) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const res = await activateStudy(withCode);
    setBusy(false);
    if (!res.ok) {
      // Already started is a good outcome as far as the student is concerned.
      if (res.status === 'already_started') { onStarted?.(); return; }
      setError(res.message);
      return;
    }
    setStarted({ dayNumber: res.dayNumber, totalDays: res.totalDays });
    getPushEnabled().then(setPushOn).catch(() => setPushOn(false));
    onStarted?.();
  };

  // A code that came from the QR code is used as soon as the form shows. Started
  // from a timer, and once, so the effect itself sets no state.
  const sentInitial = useRef(false);
  const startRef = useRef(null);
  useEffect(() => { startRef.current = start; });
  useEffect(() => {
    if (!initialCode || sentInitial.current) return undefined;
    sentInitial.current = true;
    const t = setTimeout(() => startRef.current?.(null, initialCode), 0);
    return () => clearTimeout(t);
  }, [initialCode]);

  const turnOnPush = async () => {
    setBusy(true);
    const res = await subscribeToPush();
    setBusy(false);
    setPushNote(pushResultText(res));
    if (res?.ok) setPushOn(true);
  };

  if (started) {
    return (
      <>
        <p className="fr-ok">{START_DONE}</p>
        <p className="rs-day">{dayText(started.dayNumber, started.totalDays)}</p>
        {pushOn === false && (
          <>
            <p className="fr-note">Study reminders arrive as notifications. Turn them on to get them.</p>
            <div className="fr-actions">
              <button type="button" className="fr-btn" onClick={turnOnPush} disabled={busy}>{busy ? 'Turning on…' : 'Turn on study reminders'}</button>
            </div>
          </>
        )}
        {pushNote && <p className="fr-ok">{pushNote}</p>}
      </>
    );
  }

  return (
    <form onSubmit={start}>
      <p className="step-description">{START_HELP}</p>
      <label className="fr-label" htmlFor="rs-start">Start code</label>
      <input id="rs-start" className="fr-input fr-code" value={code} maxLength={CODE_MAX + 10}
             onChange={(e) => { setCode(e.target.value); setError(''); }}
             autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false}
             placeholder="Start code" />
      {error && <p className="fr-error" role="alert">{error}</p>}
      <div className="fr-actions">
        <button type="submit" className="fr-btn" disabled={busy}>{busy ? 'Starting…' : 'Start my week'}</button>
        {onLater && <button type="button" className="fr-btn-quiet" onClick={onLater} disabled={busy}>Later</button>}
      </div>
    </form>
  );
}
