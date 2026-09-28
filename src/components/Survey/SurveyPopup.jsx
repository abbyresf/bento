import { useEffect, useState } from 'react';
import { submitSurveyResponse } from '../../lib/db';
import './SurveyPopup.css';

/* One question from dining services, shown once.
 *
 * Deliberately small. This interrupts a student who opened the app to decide
 * what to eat, so it asks one thing, takes one tap for every format except
 * short answer, and never appears again once answered or dismissed.
 *
 * Dismissing is recorded the same way an answer is. A popup that comes back
 * because someone closed it is the fastest way to make people stop opening the
 * app, so "no thanks" is a real answer and is stored as one.
 */

const RATINGS = [1, 2, 3, 4, 5];

export default function SurveyPopup({ survey, onDone }) {
  const [choice, setChoice] = useState(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);

  const options = Array.isArray(survey.options) ? survey.options : [];

  const canSubmit = survey.format === 'short_answer'
    ? text.trim().length > 0
    : choice !== null;

  async function finish(payload) {
    if (submitting) return;
    setSubmitting(true);
    // The popup closes either way. A student should not be trapped behind a
    // failed write to a survey they did not ask for.
    // ?preview_survey has no row behind it, so skip the write rather than
    // sending an id the database will reject.
    if (survey.id !== 'preview') await submitSurveyResponse(survey.id, payload);
    setClosing(true);
    setTimeout(onDone, 160);
  }

  const dismiss = () => finish({ status: 'dismissed' });

  const submit = () => finish({
    status: 'answered',
    choice: survey.format === 'short_answer' ? null : String(choice),
    text:   survey.format === 'short_answer' ? text.trim() : null,
  });

  // Escape dismisses, same as the close button. Registered after `dismiss`
  // exists rather than above it: the closure would resolve at call time either
  // way, but reading a const declared further down is the kind of thing that
  // breaks silently the moment someone reorders this file.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !submitting) dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

  return (
    <div
      className={`survey-overlay${closing ? ' closing' : ''}`}
      onClick={e => { if (e.target === e.currentTarget && !submitting) dismiss(); }}
    >
      <div className="survey-sheet" role="dialog" aria-modal="true" aria-labelledby="survey-q">
        <div className="survey-head">
          <span className="survey-eyebrow">Dining services asked</span>
          <button
            className="survey-close"
            onClick={dismiss}
            disabled={submitting}
            aria-label="Dismiss this question"
          >
            ✕
          </button>
        </div>

        <h2 className="survey-question" id="survey-q">{survey.question}</h2>

        {survey.format === 'multiple_choice' && (
          <div className="survey-options">
            {options.map((opt) => (
              <button
                key={opt}
                className={`survey-option${choice === opt ? ' selected' : ''}`}
                onClick={() => setChoice(opt)}
                aria-pressed={choice === opt}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {survey.format === 'yes_no' && (
          <div className="survey-options survey-options-row">
            {['Yes', 'No'].map(opt => (
              <button
                key={opt}
                className={`survey-option${choice === opt ? ' selected' : ''}`}
                onClick={() => setChoice(opt)}
                aria-pressed={choice === opt}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {survey.format === 'rating' && (
          <div className="survey-rating" role="group" aria-label="Rate from 1 to 5">
            {RATINGS.map(n => (
              <button
                key={n}
                className={`survey-star${choice !== null && n <= Number(choice) ? ' on' : ''}`}
                onClick={() => setChoice(n)}
                aria-label={`${n} out of 5`}
                aria-pressed={choice === n}
              >
                ★
              </button>
            ))}
          </div>
        )}

        {survey.format === 'short_answer' && (
          <>
            <textarea
              className="survey-text"
              value={text}
              onChange={e => setText(e.target.value.slice(0, 500))}
              placeholder="Type your answer"
              rows={3}
              maxLength={500}
              autoFocus
            />
            <p className="survey-count">{500 - text.length} characters left</p>
          </>
        )}

        <button className="survey-submit" onClick={submit} disabled={!canSubmit || submitting}>
          {submitting ? 'Sending…' : 'Submit'}
        </button>

        <p className="survey-foot">Anonymous. Your name is never attached to this.</p>
      </div>
    </div>
  );
}
