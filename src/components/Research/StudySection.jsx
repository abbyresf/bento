import { useEffect, useState } from 'react';
import StudyJoin from './StudyJoin';
import StudySurvey from './StudySurvey';
import { leaveStudy, getPendingSurvey } from '../../lib/research';
import { daysLeftText, endDateText, LEAVE_NOTE } from '../../data/research';
import '../Friends/Friends.css';
import './Research.css';

/* The research study in Settings, iOS app only. It renders nothing on the web, on
 * Android, or while the database side is not there yet, so a build that ships
 * before migration 054 shows no trace of it.
 *
 * The status comes from Settings (one useStudyStatus for the whole screen), so
 * joining or leaving here updates the delete-account note there too. */
export default function StudySection({ state, onGoContact }) {
  const { status, study, refresh, setStudy } = state;
  const [sheet, setSheet] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Questions waiting for this student, so they can be answered from here as well
  // as from the sheet that opens by itself.
  const [survey, setSurvey] = useState(null);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const active = status === 'ok' && study.state === 'active';
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    getPendingSurvey().then((r) => { if (alive) setSurvey(r.survey?.state === 'pending' ? r.survey : null); });
    return () => { alive = false; };
  }, [active]);

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

      {study.state === 'active' && (
        <>
          <ul className="rs-facts">
            <li>{daysLeftText(study.daysLeft)}{study.endsAt ? `, until ${endDateText(study.endsAt)}` : ''}</li>
          </ul>
          <p className="section-note">During the study Bento sends you only the study reminders and the daily questions.</p>
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
        <p className="section-note">Your study is over. Thank you for taking part. Your regular Bento reminders are back.</p>
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
            <StudyJoin startAt="code" onEnrolled={refresh} onGoContact={onGoContact} />
            <div className="fr-actions">
              <button type="button" className="fr-btn-quiet" onClick={() => setSheet(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
