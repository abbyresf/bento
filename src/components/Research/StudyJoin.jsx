import { useState } from 'react';
import BigTitle from '../Onboarding/BigTitle';
import StudyStart from './StudyStart';
import { peekStartCode, forgetStartCode } from '../../lib/startLink';
import { researchEnabled, checkStudyCode, enrollInStudy, getStudyStatus } from '../../lib/research';
import { ACK_TEXT, CODE_MAX, CODE_HELP, START_PENDING_NOTE, START_LATER } from '../../data/research';
import '../Friends/Friends.css';
import './Research.css';

/* Joining a research study, in the iOS app and the web app on Android (it renders
 * nothing anywhere else).
 *
 * Four stages: ask, code, ack, done. Onboarding starts at "ask" and a student who
 * says No leaves at once with nothing recorded. Settings starts at "code".
 *
 * The join code comes from the research team's first survey, where the consent form
 * is signed, so Bento shows no consent text. The student ticks one box saying they
 * did that. Anyone with the code can join. The research team compares the list of
 * names afterwards. The code is handed out at the snack pickup station with the
 * snack box, and joining starts the week at once (studies.start_on_join, 080).
 * The last stage then says so and offers the reminders. A study with that turned
 * off still waits for a second start code, which the last stage asks for (and
 * Settings asks for later). */
export default function StudyJoin({ startAt = 'ask', onDone, onEnrolled }) {
  const [phase, setPhase] = useState(startAt);       // ask | code | ack | done
  // A code from the QR link at the pickup station fills the field.
  const [code, setCode] = useState(() => peekStartCode() ?? '');
  const [started, setStarted] = useState(null);     // { dayNumber, totalDays } when joining started the week
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [acked, setAcked] = useState(false);

  if (!researchEnabled()) return null;

  // A plain function, not a component, so BigTitle keeps its animation as the stage changes.
  const title = (text) => (startAt === 'ask' ? <BigTitle text={text} /> : <h4 className="rs-title">{text}</h4>);

  const check = async (e) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const res = await checkStudyCode(code);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setPhase('ack');
  };

  const join = async () => {
    if (busy) return;
    setBusy(true); setError('');
    const res = await enrollInStudy(code, acked);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      if (res.status === 'invalid_code') setPhase('code');
      return;
    }
    if (res.started) {
      forgetStartCode();
      const st = await getStudyStatus();
      setStarted({ dayNumber: st.study?.dayNumber ?? 1, totalDays: st.study?.totalDays ?? null });
    }
    setPhase('done');
    onEnrolled?.();
  };

  if (phase === 'ask') {
    return (
      <>
        {title("Are you part of a research study?")}
        <p className="step-description">
          Say yes if a research team gave you a study code. Most students say no, and that is fine.
        </p>
        <div className="fr-actions rs-ask">
          <button type="button" className="fr-btn" onClick={() => setPhase('code')}>Yes, I have a code</button>
          <button type="button" className="fr-btn-quiet" onClick={() => onDone?.('skip')}>No</button>
        </div>
      </>
    );
  }

  if (phase === 'code') {
    return (
      <form onSubmit={check}>
        {title("Enter your study code")}
        <p className="step-description">{CODE_HELP}</p>
        <label className="fr-label" htmlFor="rs-code">Study code</label>
        <input id="rs-code" className="fr-input fr-code" value={code} maxLength={CODE_MAX + 10}
               onChange={(e) => { setCode(e.target.value); setError(''); }}
               autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false}
               placeholder="Study code" />
        {error && <p className="fr-error" role="alert">{error}</p>}
        <div className="fr-actions">
          <button type="submit" className="fr-btn" disabled={busy}>{busy ? 'Checking…' : 'Check code'}</button>
          {startAt === 'ask' && (
            <button type="button" className="fr-btn-quiet" onClick={() => { setPhase('ask'); setError(''); }}>Back</button>
          )}
        </div>
      </form>
    );
  }

  if (phase === 'ack') {
    return (
      <>
        {title("One last step")}
        <p className="step-description">
          Bento does not collect your consent. The research team did that in their own survey.
        </p>
        <label className="rs-ack">
          <input type="checkbox" checked={acked} onChange={(e) => { setAcked(e.target.checked); setError(''); }} />
          <span>{ACK_TEXT}</span>
        </label>
        {error && <p className="fr-error" role="alert">{error}</p>}
        <div className="fr-actions">
          <button type="button" className="fr-btn" onClick={join} disabled={busy || !acked}>{busy ? 'Joining…' : 'Join the study'}</button>
          <button type="button" className="fr-btn-quiet" onClick={() => setPhase('code')} disabled={busy}>Back</button>
        </div>
      </>
    );
  }

  // done
  if (started) {
    return (
      <>
        {title("You joined the study")}
        <StudyStart startedAs={started} />
      </>
    );
  }
  return (
    <>
      {title("You joined the study")}
      <p className="step-description">{START_PENDING_NOTE}</p>
      <StudyStart initialCode={peekStartCode() ?? ''} onStarted={() => { forgetStartCode(); onEnrolled?.(); }} />
      <p className="fr-note">{START_LATER}</p>
    </>
  );
}
