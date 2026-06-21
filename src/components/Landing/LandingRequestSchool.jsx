import { useState } from 'react';
import { submitUniversityRequest } from '../../lib/db';
import ALL_UNIVERSITIES from '../../data/usUniversities.json';
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
    .replace(/[,.()\-]/g, ' ')
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
      <div className="lrs-page">
        <div className="lrs-inner">
          <div className="lrs-success">
            <div className="lrs-success-icon">🍱</div>
            <h2>You're on the list.</h2>
            <p>
              We see you — and we're moving fast. The more people who rep their school,
              the faster it happens. Send this to your friends and let's get {fields.university || 'your campus'} added.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lrs-page">
      <div className="lrs-inner">
        <h1 className="lrs-heading">Don't see your school? <br></br>Let's change that.</h1>
        <p className="lrs-sub">
          Bento is expanding and your campus could be next! Add your school to the waitlist and help us get there faster.
        </p>

        <form className="lrs-form" onSubmit={handleSubmit} noValidate>
          <div className="lrs-field">
            <label htmlFor="university">Which university do you attend? <span className="lrs-required">*</span></label>
            <div className="lrs-autocomplete-wrap">
              <input
                id="university"
                name="university"
                type="text"
                placeholder="Search your school…"
                value={fields.university}
                onChange={handleUniversityChange}
                required
                autoComplete="off"
              />
            </div>
            {suggestions.length > 0 && (
              <ul className="lrs-suggestions">
                {suggestions.map(s => (
                  <li key={s}>
                    <button type="button" className="lrs-suggestion" onClick={() => pickSuggestion(s)}>
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lrs-row">
            <div className="lrs-field">
              <label htmlFor="email">Your email <span className="lrs-required">*</span></label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@university.edu"
                value={fields.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="lrs-field">
              <label htmlFor="name">Your name <span className="lrs-optional">(optional)</span></label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="Jane Smith"
                value={fields.name}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="lrs-field">
            <label htmlFor="referral">How'd you find out about Bento? <span className="lrs-optional">(optional)</span></label>
            <select
              id="referral"
              name="referral"
              value={fields.referral}
              onChange={handleChange}
            >
              <option value="">Select one…</option>
              {REFERRAL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <label className="lrs-notify-label">
            <input
              type="checkbox"
              name="notify"
              checked={fields.notify}
              onChange={handleChange}
              className="lrs-notify-hidden"
            />
            <span className={`lrs-toggle ${fields.notify ? 'on' : ''}`}>
              <span className="lrs-toggle-thumb" />
            </span>
            <span className="lrs-notify-text">Notify me when Bento comes to my school</span>
          </label>

          {status === 'error' && (
            <p className="lrs-error">
              Something went wrong — please try again or email us at{' '}
              <a href="mailto:bentodining@gmail.com">bentodining@gmail.com</a>.
            </p>
          )}

          <button className="lrs-btn" type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Add my school →'}
          </button>
        </form>
      </div>
    </div>
  );
}
