import { useEffect, useState } from 'react';
import BigTitle from '../Onboarding/BigTitle';
import { researchEnabled, checkStudyCode, enrollInStudy, getAccountEmail } from '../../lib/research';
import { subscribeToPush, getPushEnabled } from '../../lib/push';
import {
  ACK_TEXT, CODE_MAX, NOT_ON_LIST_BEFORE, NOT_ON_LIST_LINK, NOT_ON_LIST_AFTER, endDateText, pushResultText,
} from '../../data/research';
import '../Friends/Friends.css';
import './Research.css';

/* Joining a research study, iOS app only (it renders nothing anywhere else).
 *
 * Four stages: ask, code, ack, done. Onboarding starts at "ask" and a student who
 * says No leaves at once with nothing recorded. Settings starts at "code".
 *
 * The consent form is the research team's, signed in their own survey, so Bento
 * shows no consent text. The student ticks one box saying they did that. A code
 * an account that is not on the research team's list gets its own message, with
 * "contact us" linking to the Contact page, and the signed-in email so a student
 * can see if it is the wrong one. The message never says the code was right. */
export default function StudyJoin({ startAt = 'ask', onDone, onEnrolled, onGoContact }) {
  const [phase, setPhase] = useState(startAt);       // ask | code | ack | done
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unlisted, setUnlisted] = useState(false);
  const [acked, setAcked] = useState(false);
  const [joined, setJoined] = useState(null);        // { participantCode, endsAt }
  const [pushOn, setPushOn] = useState(true);
  const [pushNote, setPushNote] = useState('');

  useEffect(() => { getAccountEmail().then(setEmail).catch(() => {}); }, []);
  useEffect(() => {
    if (phase === 'done') getPushEnabled().then(setPushOn).catch(() => setPushOn(false));
  }, [phase]);

  if (!researchEnabled()) return null;

  // A plain function, not a component, so BigTitle keeps its animation as the stage changes.
  const title = (text) => (startAt === 'ask' ? <BigTitle text={text} /> : <h4 className="rs-title">{text}</h4>);

  const check = async (e) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setUnlisted(false);
    const res = await checkStudyCode(code);
    setBusy(false);
    if (!res.ok) { setError(res.message); setUnlisted(res.status === 'not_on_list'); return; }
    setPhase('ack');
  };

  const join = async () => {
    if (busy) return;
    setBusy(true); setError('');
    const res = await enrollInStudy(code, acked);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      if (res.status === 'not_on_list' || res.status === 'invalid_code') { setUnlisted(res.status === 'not_on_list'); setPhase('code'); }
      return;
    }
    setJoined({ participantCode: res.participantCode, endsAt: res.endsAt });
    setPhase('done');
    onEnrolled?.();
  };

  const turnOnPush = async () => {
    setBusy(true);
    const res = await subscribeToPush();
    setBusy(false);
    setPushNote(pushResultText(res));
    if (res?.ok) setPushOn(true);
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
        <p className="step-description">The research team gave you this code.</p>
        <label className="fr-label" htmlFor="rs-code">Study code</label>
        <input id="rs-code" className="fr-input fr-code" value={code} maxLength={CODE_MAX + 10}
               onChange={(e) => { setCode(e.target.value); setError(''); setUnlisted(false); }}
               autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false}
               placeholder="Study code" />
        {error && (
          <p className="fr-error" role="alert">
            {unlisted && onGoContact ? (
              <>
                {NOT_ON_LIST_BEFORE}
                <button type="button" className="fr-link" onClick={onGoContact}>{NOT_ON_LIST_LINK}</button>
                {NOT_ON_LIST_AFTER}
              </>
            ) : error}
          </p>
        )}
        {unlisted && email && (
          <p className="fr-note">You are signed in as <strong>{email}</strong>. The research team matches you by this email.</p>
        )}
        <div className="fr-actions">
          <button type="submit" className="fr-btn" disabled={busy}>{busy ? 'Checking…' : 'Check code'}</button>
          {startAt === 'ask' && (
            <button type="button" className="fr-btn-quiet" onClick={() => { setPhase('ask'); setError(''); setUnlisted(false); }}>Back</button>
          )}
        </div>
      </form>
    );
  }

  if (phase === 'ack') {
    return (
      <>
        {title("You are on the list")}
        <p className="step-description">
          One last step. Bento does not collect your consent. The research team did that in their own survey.
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
  return (
    <>
      {title("You are in the study")}
      <ul className="rs-facts">
        <li>Your participant code is <strong>{joined?.participantCode}</strong>.</li>
        <li>
          The study runs until <strong>{endDateText(joined?.endsAt)}</strong>.
          Until then Bento sends you only study reminders.
        </li>
      </ul>
      {!pushOn && (
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
