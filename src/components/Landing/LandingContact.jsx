import { useState } from 'react';
import emailjs from '@emailjs/browser';
import './landingLoud.css';
import './LandingContact.css';

const TOPICS = [
  'Allergen / Dietary Request',
  'Bug Report',
  'Feature Request',
  'Menu / Nutrition Issue',
  'Account Help',
  'General Question',
  'Other',
];

const EMPTY = { from_name: '', reply_to: '', subject: '', message: '' };

export default function LandingContact() {
  const [fields, setFields] = useState(EMPTY);
  const [sentTo, setSentTo] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | success | error

  const handleChange = (e) => setFields((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    try {
      await emailjs.send(
        'service_0fhib6k',
        'template_4r7zn6c',
        {
          from_name: fields.from_name,
          reply_to:  fields.reply_to,
          subject:   fields.subject,
          message:   fields.message,
        },
        { publicKey: 'urTn8G5d8khZF0NfZ' },
      );
      // Kept apart from the fields, which reset, so the confirmation still names the address.
      setSentTo(fields.reply_to);
      setStatus('success');
      setFields(EMPTY);
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="ld ld-page ld-contact">
      <div className="ld-glow" style={{ width: 380, height: 380, background: 'var(--ld-sk)', right: '-6%', top: -60, opacity: .3 }} />
      <div className="ld-page-inner">
        <h1 className="ld-page-h1 ld-enter">Talk<br /><span className="l">to us.</span></h1>
        <p className="ld-page-sub ld-enter">Bug, idea, menu mistake, allergen question. Send it.</p>

        {status === 'success' ? (
          <div className="ld-done">
            <span className="ld-done-check" aria-hidden="true">✓</span>
            <h2>Sent.</h2>
            <p>We’ll reply to <strong>{sentTo || 'your email'}</strong> within 1 to 2 business days.</p>
            <button className="ld-btn" onClick={() => setStatus('idle')}>Send another</button>
          </div>
        ) : (
          <form className="ld-form ld-enter" onSubmit={handleSubmit} noValidate>
            <div className="ld-row">
              <div className="ld-field">
                <label htmlFor="from_name">Your name</label>
                <input className="ld-input" id="from_name" name="from_name" type="text" placeholder="Jane Smith"
                  value={fields.from_name} onChange={handleChange} required />
              </div>
              <div className="ld-field">
                <label htmlFor="reply_to">Your email</label>
                <input className="ld-input" id="reply_to" name="reply_to" type="email" placeholder="jane@example.com"
                  value={fields.reply_to} onChange={handleChange} required />
              </div>
            </div>

            <fieldset className="ld-field ld-topics">
              <legend className="ld-fieldlabel">Topic</legend>
              <div className="ld-topic-list">
                {TOPICS.map((t) => (
                  <label key={t} className={`ld-topic${fields.subject === t ? ' on' : ''}`}>
                    <input type="radio" name="subject" value={t} checked={fields.subject === t} onChange={handleChange} required />
                    {t}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="ld-field">
              <label htmlFor="message">Message</label>
              <textarea className="ld-input" id="message" name="message" rows={5} placeholder="What’s up?"
                value={fields.message} onChange={handleChange} required />
            </div>

            {status === 'error' && (
              <p className="ld-error">Something went wrong. Try again, or email us at <a href="mailto:bentodining@gmail.com">bentodining@gmail.com</a>.</p>
            )}

            <div className="ld-form-foot">
              <button className="ld-btn ld-btn--or" type="submit" disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending…' : 'Send'}
              </button>
              <p>Or email <a href="mailto:bentodining@gmail.com">bentodining@gmail.com</a></p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
