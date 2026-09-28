import { useCallback, useEffect, useState } from 'react';
import {
  getSurveys, createSurvey, closeSurvey,
  SURVEY_FORMATS, SURVEY_TARGETS,
} from '../../lib/pulseDb';

/* Compose a survey, and read the answers.
 *
 * One question per survey, one survey per week. Both limits are enforced in the
 * database rather than here, so this only has to explain them.
 *
 * Results are aggregates. The server never returns who answered what, which is
 * what makes the "anonymous" line under the student's popup true rather than a
 * promise the UI happens to keep. Targeting can select kosher or halal
 * students, so attributing answers would tie named students to religious
 * practice inside a dining dashboard.
 */

const MAX_OPTIONS = 6;

function targetLabel(targets) {
  if (!targets?.length) return 'Everyone';
  return targets
    .map(t => SURVEY_TARGETS.find(x => x.value === t)?.label ?? t)
    .join(', ');
}

function Compose({ university, onPublished }) {
  const [question, setQuestion] = useState('');
  const [format, setFormat]     = useState('multiple_choice');
  const [options, setOptions]   = useState(['', '']);
  const [targets, setTargets]   = useState([]);
  const [days, setDays]         = useState(7);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);

  const cleanOptions = options.map(o => o.trim()).filter(Boolean);
  const needsOptions = format === 'multiple_choice';
  const ready = question.trim().length > 0 && (!needsOptions || cleanOptions.length >= 2);

  const toggleTarget = (value) => {
    setTargets(prev => prev.includes(value) ? prev.filter(t => t !== value) : [...prev, value]);
  };

  const publish = async () => {
    setBusy(true); setError(null);
    try {
      await createSurvey(university, {
        question: question.trim(), format, options: cleanOptions, targets, days,
      });
      setQuestion(''); setOptions(['', '']); setTargets([]);
      onPublished();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pulse-survey-compose">
      <label className="pulse-survey-label" htmlFor="survey-question">Question</label>
      <input
        id="survey-question"
        className="pulse-survey-input"
        value={question}
        onChange={e => setQuestion(e.target.value.slice(0, 200))}
        placeholder="How satisfied are you with dinner options this week?"
        maxLength={200}
      />

      <label className="pulse-survey-label">Format</label>
      <div className="pulse-survey-formats">
        {SURVEY_FORMATS.map(f => (
          <button
            key={f.value}
            type="button"
            className={`pulse-survey-format${format === f.value ? ' selected' : ''}`}
            onClick={() => setFormat(f.value)}
            aria-pressed={format === f.value}
          >
            <span className="pulse-survey-format-name">{f.label}</span>
            <span className="pulse-survey-format-hint">{f.hint}</span>
          </button>
        ))}
      </div>

      {needsOptions && (
        <>
          <label className="pulse-survey-label">Options</label>
          <div className="pulse-survey-options">
            {options.map((opt, i) => (
              <div key={i} className="pulse-survey-option-row">
                <input
                  className="pulse-survey-input"
                  value={opt}
                  onChange={e => setOptions(prev => prev.map((o, j) => (j === i ? e.target.value.slice(0, 120) : o)))}
                  placeholder={`Option ${i + 1}`}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    className="pulse-survey-option-remove"
                    onClick={() => setOptions(prev => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove option ${i + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <button type="button" className="pulse-survey-add" onClick={() => setOptions(prev => [...prev, ''])}>
                + Add option
              </button>
            )}
          </div>
        </>
      )}

      <label className="pulse-survey-label">Who sees it</label>
      <div className="pulse-survey-targets">
        <button
          type="button"
          className={`pulse-survey-target${targets.length === 0 ? ' selected' : ''}`}
          onClick={() => setTargets([])}
          aria-pressed={targets.length === 0}
        >
          Everyone
        </button>
        {SURVEY_TARGETS.map(t => (
          <button
            key={t.value}
            type="button"
            className={`pulse-survey-target${targets.includes(t.value) ? ' selected' : ''}`}
            onClick={() => toggleTarget(t.value)}
            aria-pressed={targets.includes(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="pulse-survey-note">
        {targets.length === 0
          ? 'Every student at your university.'
          : `Students with any of: ${targetLabel(targets)}. A student matching more than one still sees it once.`}
      </p>

      <label className="pulse-survey-label" htmlFor="survey-days">Runs for</label>
      <select
        id="survey-days"
        className="pulse-survey-input pulse-survey-select"
        value={days}
        onChange={e => setDays(Number(e.target.value))}
      >
        {[3, 5, 7, 14].map(d => <option key={d} value={d}>{d} days</option>)}
      </select>

      {error && <p className="pulse-survey-error">{error}</p>}

      <button className="pulse-survey-publish" onClick={publish} disabled={!ready || busy}>
        {busy ? 'Publishing…' : 'Publish survey'}
      </button>
      <p className="pulse-survey-note">
        One survey per week. Students see it once and are not asked again after
        answering or dismissing.
      </p>
    </div>
  );
}

function Results({ survey, onClosed }) {
  const total = (survey.answered ?? 0) + (survey.dismissed ?? 0);
  const tally = Array.isArray(survey.tally) ? survey.tally : [];
  const texts = Array.isArray(survey.text_answers) ? survey.text_answers : [];
  const max = tally.reduce((m, t) => Math.max(m, t.count), 0) || 1;
  const live = survey.is_active && new Date(survey.closes_at) > new Date();

  return (
    <div className="pulse-survey-result">
      <div className="pulse-survey-result-head">
        <div>
          <p className="pulse-survey-result-q">{survey.question}</p>
          <p className="pulse-survey-result-meta">
            <span className={`pulse-survey-status${live ? ' live' : ''}`}>{live ? 'Live' : 'Closed'}</span>
            {targetLabel(survey.targets)} · {survey.answered ?? 0} answered
            {survey.dismissed > 0 && ` · ${survey.dismissed} dismissed`}
          </p>
        </div>
        {live && (
          <button className="pulse-survey-close-btn" onClick={() => onClosed(survey.id)}>
            Close early
          </button>
        )}
      </div>

      {total === 0 && <p className="pulse-empty">No responses yet.</p>}

      {tally.length > 0 && (
        <div className="pulse-survey-tally">
          {tally.map(t => (
            <div key={t.choice} className="pulse-survey-tally-row">
              <span className="pulse-survey-tally-label">
                {survey.format === 'rating' ? `${t.choice} ★` : t.choice}
              </span>
              <div className="pulse-survey-tally-track">
                <div className="pulse-survey-tally-bar" style={{ width: `${(t.count / max) * 100}%` }} />
              </div>
              <span className="pulse-survey-tally-count">{t.count}</span>
            </div>
          ))}
        </div>
      )}

      {texts.length > 0 && (
        <div className="pulse-survey-texts">
          {texts.slice(0, 30).map((t, i) => (
            <p key={i} className="pulse-survey-text">{t}</p>
          ))}
          {texts.length > 30 && (
            <p className="pulse-survey-note">Showing 30 of {texts.length}.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function SurveysCard({ university }) {
  const [surveys, setSurveys] = useState(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(
    () => getSurveys(university).then(setSurveys).catch(() => setSurveys([])),
    [university],
  );
  useEffect(() => { load(); }, [load]);

  const handleClose = async (id) => {
    try { await closeSurvey(id); load(); } catch { /* the list reload would show it anyway */ }
  };

  return (
    <div className="pulse-card">
      <div className="pulse-card-header">
        <h2 className="pulse-card-title">Surveys</h2>
        <button className="pulse-export-btn" onClick={() => setComposing(v => !v)}>
          {composing ? 'Cancel' : 'New survey'}
        </button>
      </div>

      {composing && (
        <Compose
          university={university}
          onPublished={() => { setComposing(false); load(); }}
        />
      )}

      {surveys === null && <p className="pulse-empty">Loading…</p>}
      {surveys?.length === 0 && !composing && (
        <p className="pulse-empty">
          No surveys yet. Ask your students one question a week and read the answers here.
        </p>
      )}
      {surveys?.map(s => <Results key={s.id} survey={s} onClosed={handleClose} />)}
    </div>
  );
}
