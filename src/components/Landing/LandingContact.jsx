import { useState } from 'react';
import emailjs from '@emailjs/browser';
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

export default function LandingContact() {
  const [fields, setFields] = useState({ from_name: '', reply_to: '', subject: '', message: '' });
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
      setStatus('success');
      setFields({ from_name: '', reply_to: '', subject: '', message: '' });
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="landing-contact">
      <div className="contact-inner">
        <p className="contact-eyebrow">Get in touch</p>
        <h1 className="contact-heading">We'd love to<br />hear from you.</h1>
        <p className="contact-sub">
          Question, bug report, or feature idea — send it our way.
        </p>

        {status === 'success' ? (
          <div className="contact-success">
            <span className="contact-success-icon">✓</span>
            <h2>Message sent!</h2>
            <p>We'll get back to you at <strong>{fields.reply_to || 'your email'}</strong> within 1–2 business days.</p>
            <button className="contact-btn" onClick={() => setStatus('idle')}>Send another</button>
          </div>
        ) : (
          <form className="contact-form" onSubmit={handleSubmit} noValidate>
            <div className="contact-row">
              <div className="contact-field">
                <label htmlFor="from_name">Your name</label>
                <input
                  id="from_name"
                  name="from_name"
                  type="text"
                  placeholder="Jane Smith"
                  value={fields.from_name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="contact-field">
                <label htmlFor="reply_to">Your email</label>
                <input
                  id="reply_to"
                  name="reply_to"
                  type="email"
                  placeholder="jane@example.com"
                  value={fields.reply_to}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="contact-field">
              <label htmlFor="subject">Topic</label>
              <select
                id="subject"
                name="subject"
                value={fields.subject}
                onChange={handleChange}
                required
              >
                <option value="" disabled>Select a topic…</option>
                {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="contact-field">
              <label htmlFor="message">Message</label>
              <textarea
                id="message"
                name="message"
                rows={5}
                placeholder="Tell us what's on your mind…"
                value={fields.message}
                onChange={handleChange}
                required
              />
            </div>

            {status === 'error' && (
              <p className="contact-error">Something went wrong — please try again or email us directly at <a href="mailto:bentodining@gmail.com">bentodining@gmail.com</a>.</p>
            )}

            <div className="contact-form-footer">
              <button className="contact-btn" type="submit" disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending…' : 'Send Message'}
              </button>
              <p className="contact-direct">
                Or reach us directly at{' '}
                <a href="mailto:bentodining@gmail.com" className="contact-email-link">bentodining@gmail.com</a>
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
