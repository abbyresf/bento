import { useState } from 'react';
import { submitSurvey } from '../../lib/research';
import {
  SURVEY_TODAY, SURVEY_LATE, SURVEY_INTRO, SURVEY_LATE_INTRO, SURVEY_THANKS, SURVEY_MAX_TEXT,
  answerFor, buildAnswers, surveyReady, visibleQuestions, ratingHint,
} from '../../data/research';
import '../Friends/Friends.css';
import './Research.css';

/* The end-of-day questions, iOS app only. A sheet over whatever the student is
 * doing. The questions come from the research team, so this knows nothing about
 * what they ask, only how to show each kind: yes or no, a rating from 1 to 5, a
 * choice, or a few words.
 *
 * "Not now" closes it and the app asks again the next time it comes to the front.
 * A free-text question may be left empty. Every other kind needs an answer, and
 * Send stays off until they all have one. */
export default function StudySurvey({ survey, onClose, onSent }) {
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const set = (id, value) => { setAnswers((a) => ({ ...a, [id]: value })); setError(''); };
  // Follow-ups appear only after the answer that calls for them.
  const shown = visibleQuestions(survey.questions, answers);
  const ready = surveyReady(survey.questions, answers);

  const send = async () => {
    if (busy || !ready) return;
    setBusy(true); setError('');
    const res = await submitSurvey(survey.forDate, buildAnswers(survey.questions, answers));
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      // Already answered, or no longer open: nothing more to do here.
      if (res.status === 'not_pending') setTimeout(() => onSent?.(), 1500);
      return;
    }
    setSent(true);
    onSent?.();
  };

  return (
    <div className="fr-overlay" onClick={sent ? onClose : undefined}>
      <div className="fr-sheet" role="dialog" aria-modal="true" aria-label={survey.late ? SURVEY_LATE : SURVEY_TODAY}
           onClick={(e) => e.stopPropagation()}>
        <div className="fr-head">
          <h3>{survey.late ? SURVEY_LATE : SURVEY_TODAY}</h3>
          <button type="button" className="fr-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {sent ? (
          <>
            <p className="fr-ok">{SURVEY_THANKS}</p>
            <div className="fr-actions"><button type="button" className="fr-btn" onClick={onClose}>Done</button></div>
          </>
        ) : (
          <>
            <p className="fr-note" style={{ marginTop: 0 }}>
              {survey.late ? SURVEY_LATE_INTRO : (survey.intro ?? SURVEY_INTRO)}
            </p>

            {shown.map((q) => (
              <fieldset className="rs-q" key={q.id}>
                <legend className="rs-q-text">{q.text}</legend>

                {q.format === 'yes_no' && (
                  <div className="fr-choices">
                    {[[true, 'Yes'], [false, 'No']].map(([v, label]) => (
                      <button key={label} type="button" className="fr-choice" aria-pressed={answers[q.id] === v}
                              onClick={() => set(q.id, v)}>{label}</button>
                    ))}
                  </div>
                )}

                {q.format === 'rating' && (
                  <>
                    <div className="fr-choices">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" className="fr-choice rs-rate" aria-pressed={answers[q.id] === n}
                                onClick={() => set(q.id, n)}>{n}</button>
                      ))}
                    </div>
                    <p className="fr-note">{ratingHint(q)}</p>
                  </>
                )}

                {q.format === 'multiple_choice' && (
                  <div className="fr-choices">
                    {(q.options ?? []).map((o) => (
                      <button key={o} type="button" className="fr-choice" aria-pressed={answers[q.id] === o}
                              onClick={() => set(q.id, o)}>{o}</button>
                    ))}
                  </div>
                )}

                {q.format === 'short_answer' && (
                  <textarea className="fr-input rs-text" rows={3} maxLength={SURVEY_MAX_TEXT}
                            value={answerFor(q, answers)} aria-label={q.text}
                            onChange={(e) => set(q.id, e.target.value)} />
                )}
              </fieldset>
            ))}

            {error && <p className="fr-error" role="alert">{error}</p>}
            <div className="fr-actions">
              <button type="button" className="fr-btn" onClick={send} disabled={busy || !ready}>{busy ? 'Sending…' : 'Send answers'}</button>
              <button type="button" className="fr-btn-quiet" onClick={onClose} disabled={busy}>Not now</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
