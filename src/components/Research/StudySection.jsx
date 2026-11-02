import { useEffect, useState } from 'react';
import StudyJoin from './StudyJoin';
import StudyStart from './StudyStart';
import StudySurvey from './StudySurvey';
import { leaveStudy, getPendingSurvey, getFinalSurvey, openOutsideApp } from '../../lib/research';
import { daysLeftText, dayText, LEAVE_NOTE, START_TITLE, START_PENDING_NOTE, FINAL_TITLE, FINAL_NOTE, FINAL_BUTTON } from '../../data/research';
import { peekStartCode, forgetStartCode } from '../../lib/startLink';
import '../Friends/Friends.css';
import './Research.css';

/* The research study in Settings, in the iOS app and the web app on Android. It
 * renders nothing anywhere else, or while the database side is not there yet.
 *
 * Four things can be shown: Join a study, Start your week (joined, but the code from
 * the snack pickup station has not been entered), the running study (which day it
 * is, the questions, the final survey from the last day) and what is left once it
 * is over. Nothing here names the student's place in the study.
 *
 * The status comes from Settings (one useStudyStatus for the whole screen), so
 * joining or leaving here updates the delete-account note there too. */
export default function StudySection({ state }) {
  const { status, study, refresh, setStudy } = state;
  const [sheet, setSheet] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Questions waiting for this student, so they can be answered from here as well
  // as from the sheet that opens by itself.
  const [survey, setSurvey] = useState(null);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [final, setFinal] = useState({ available: false, url: '' });
  const active = status === 'ok' && study.state === 'active';
  const over = status === 'ok' && (study.state === 'active' || study.state === 'completed');
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    getPendingSurvey().then((r) => { if (alive) setSurvey(r.survey?.state === 'pending' ? r.survey : null); });
    return () => { alive = false; };
  }, [active]);
  useEffect(() => {
    if (!over) return undefined;
    let alive = true;
    getFinalSurvey().then((f) => { if (alive) setFinal(f); });
    return () => { alive = false; };
  }, [over]);

  if (status !== 'ok') return null;

  const leave = async () => {
    if (!confirming) { setConfirming(true); return; }
    setBusy(true); setError('');
    const res = await leaveStudy();
    setBusy(false);
    setConfirming(false);
    if (!res.ok) { setError(res.message); return; }
    setStudy(res.study);
  };

  return (
    <section className="settings-section">
      <h3>Research study</h3>

      {study.state === 'none' && (
        <>
          <p className="section-note">Taking part in a study with a research team? Enter the code they gave you.</p>
          <button type="button" className="btn-secondary" onClick={() => setSheet(true)}>Join a study</button>
        </>
      )}

      {study.state === 'pending' && (
        <>
          <p className="section-note">{START_PENDING_NOTE}</p>
          <h4 className="rs-title">{START_TITLE}</h4>
          <StudyStart initialCode={peekStartCode() ?? ''} onStarted={() => { forgetStartCode(); refresh(); }} />
          {error && <p className="settings-action-error">{error}</p>}
          <div className="data-action-row">
            <button type="button" className={confirming ? 'btn-danger' : 'btn-warning'} onClick={leave} disabled={busy}>
              {confirming ? 'Tap again to leave' : 'Leave the study'}
            </button>
            {confirming && <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>Cancel</button>}
          </div>
        </>
      )}

      {study.state === 'active' && (
        <>
          <ul className="rs-facts">
            <li><strong>{dayText(study.dayNumber, study.totalDays)}</strong></li>
            <li>{daysLeftText(study.daysLeft)}</li>
          </ul>
          <p className="section-note">During the study Bento sends you only the study reminders and the daily questions.</p>
          {final.available && (
            <>
              <h4 className="rs-title">{FINAL_TITLE}</h4>
              <p className="section-note">{FINAL_NOTE}</p>
              <div className="data-action-row rs-gap">
                <button type="button" className="btn-secondary" onClick={() => openOutsideApp(final.url)}>{FINAL_BUTTON}</button>
              </div>
            </>
          )}

          {survey && (
            <div className="data-action-row rs-gap">
              <button type="button" className="btn-secondary" onClick={() => setSurveyOpen(true)}>
                {survey.late ? "Answer yesterday's questions" : "Answer today's questions"}
              </button>
            </div>
          )}
          {confirming && <p className="section-note">{LEAVE_NOTE}</p>}
          {error && <p className="settings-action-error">{error}</p>}
          <div className="data-action-row">
            <button type="button" className={confirming ? 'btn-danger' : 'btn-warning'} onClick={leave} disabled={busy}>
              {confirming ? 'Tap again to leave' : 'Leave the study'}
            </button>
            {confirming && <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>Cancel</button>}
          </div>
        </>
      )}

      {study.state === 'completed' && (
        <>
          <p className="section-note">Your study is over. Thank you for taking part. Your regular Bento reminders are back.</p>
          {final.available && (
            <>
              <h4 className="rs-title">{FINAL_TITLE}</h4>
              <p className="section-note">{FINAL_NOTE}</p>
              <div className="data-action-row rs-gap">
                <button type="button" className="btn-secondary" onClick={() => openOutsideApp(final.url)}>{FINAL_BUTTON}</button>
              </div>
            </>
          )}
        </>
      )}

      {study.state === 'withdrawn' && (
        <p className="section-note">You left the study. Your regular Bento reminders are back.</p>
      )}

      {surveyOpen && survey && (
        <StudySurvey survey={survey} onClose={() => setSurveyOpen(false)} onSent={() => setSurvey(null)} />
      )}

      {sheet && (
        <div className="fr-overlay" onClick={() => setSheet(false)}>
          <div className="fr-sheet" role="dialog" aria-modal="true" aria-label="Join a study" onClick={(e) => e.stopPropagation()}>
            <div className="fr-head">
              <h3>Join a study</h3>
              <button type="button" className="fr-close" onClick={() => setSheet(false)} aria-label="Close">×</button>
            </div>
            <StudyJoin startAt="code" onEnrolled={refresh} />
            <div className="fr-actions">
              <button type="button" className="fr-btn-quiet" onClick={() => setSheet(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
