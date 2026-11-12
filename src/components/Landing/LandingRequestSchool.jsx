import { useState } from 'react';
import { submitUniversityRequest } from '../../lib/db';
import ALL_UNIVERSITIES from '../../data/usUniversities.json';
import './landingLoud.css';
import './LandingRequestSchool.css';

const REFERRAL_OPTIONS = [
  'A friend',
  'Social media',
  'My school',
  'Just exploring',
  'Other',
];

// Build acronym → [full names] map at module load time
const SKIP = new Set(['of', 'the', 'and', 'at', 'in', 'for', 'a', 'an', 'by', 'to', 'on']);
function toAcronym(name) {
  return name
    .replace(/[,.()-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !SKIP.has(w.toLowerCase()))
    .map(w => w[0].toUpperCase())
    .join('');
}
const ACRONYM_MAP = {};
for (const uni of ALL_UNIVERSITIES) {
  const acr = toAcronym(uni);
  if (acr.length >= 2) {
    if (!ACRONYM_MAP[acr]) ACRONYM_MAP[acr] = [];
    ACRONYM_MAP[acr].push(uni);
  }
}

export default function LandingRequestSchool() {
  const [fields, setFields] = useState({ university: '', email: '', name: '', referral: '', notify: true });
  const [suggestions, setSuggestions] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | sending | success | error

  const handleUniversityChange = (e) => {
    const q = e.target.value;
    setFields(prev => ({ ...prev, university: q }));
    const trimmed = q.trim();
    if (trimmed.length < 2) { setSuggestions([]); return; }
    const lower = trimmed.toLowerCase();
    const upper = trimmed.toUpperCase();
    const acronymHits = ACRONYM_MAP[upper] || [];
    const nameHits = ALL_UNIVERSITIES.filter(
      u => u.toLowerCase().includes(lower) && !acronymHits.includes(u)
    );
    setSuggestions([...acronymHits, ...nameHits].slice(0, 7));
  };

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    setFields(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const pickSuggestion = (name) => {
    setFields(prev => ({ ...prev, university: name }));
    setSuggestions([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    try {
      await submitUniversityRequest(fields);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="ld ld-page ld-request">
        <div className="ld-page-inner">
          <div className="ld-done">
            <span className="ld-done-check ld-done-check--box" aria-hidden="true">🍱</span>
            <h2>You’re on the list.</h2>
            <p>
              Every request counts. Send this page to friends at {fields.university || 'your school'} to move up faster.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ld ld-page ld-request">
      <div className="ld-glow" style={{ width: 400, height: 400, background: 'var(--ld-li)', left: '-8%', top: -40, opacity: .22 }} />
      <div className="ld-page-inner">
        <h1 className="ld-page-h1 ld-enter">Don’t see your school?<br /><span className="o">Let’s change that.</span></h1>
        <p className="ld-page-sub ld-enter">Add your school. Every request moves your campus up the list.</p>

        <form className="ld-form ld-enter" onSubmit={handleSubmit} noValidate>
          <div className="ld-field ld-ac">
            <label htmlFor="university">Which university do you attend? <span className="ld-req">*</span></label>
            <input
              className="ld-input"
              id="university"
              name="university"
              type="text"
              placeholder="Search your school…"
              value={fields.university}
              onChange={handleUniversityChange}
              required
              autoComplete="off"
            />
            {suggestions.length > 0 && (
              <ul className="ld-suggest">
                {suggestions.map(s => (
                  <li key={s}>
                    <button type="button" onClick={() => pickSuggestion(s)}>{s}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ld-row">
            <div className="ld-field">
              <label htmlFor="email">Your email <span className="ld-req">*</span></label>
              <input className="ld-input" id="email" name="email" type="email" placeholder="you@university.edu"
                value={fields.email} onChange={handleChange} required />
            </div>
            <div className="ld-field">
              <label htmlFor="name">Your name <span className="ld-opt">optional</span></label>
              <input className="ld-input" id="name" name="name" type="text" placeholder="Jane Smith"
                value={fields.name} onChange={handleChange} />
            </div>
          </div>

          <div className="ld-field">
            <label htmlFor="referral">How’d you find Bento? <span className="ld-opt">optional</span></label>
            <select className="ld-input" id="referral" name="referral" value={fields.referral} onChange={handleChange}>
              <option value="">Select one…</option>
              {REFERRAL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <label className="ld-switch">
            <input type="checkbox" name="notify" checked={fields.notify} onChange={handleChange} />
            <span className="ld-switch-track" aria-hidden="true"><span /></span>
            <span>Email me when Bento comes to my school</span>
          </label>

          {status === 'error' && (
            <p className="ld-error">
              Something went wrong. Try again, or email us at{' '}
              <a href="mailto:bentodining@gmail.com">bentodining@gmail.com</a>.
            </p>
          )}

          <div className="ld-form-foot">
            <button className="ld-btn ld-btn--li" type="submit" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Add my school →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
