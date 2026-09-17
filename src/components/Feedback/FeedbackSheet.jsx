import { useState, useEffect, useRef } from 'react';
import { sendFeedback } from '../../lib/db';
import './FeedbackSheet.css';

/* Feedback from inside the app.
 *
 * Same topics as the landing page form so replies can be triaged the same way,
 * but this writes to Supabase rather than EmailJS. Reasons are in migration 030.
 *
 * Deliberately short. Asking a hungry student to fill in a name, an email and a
 * subject before they can report that the menu is wrong is how you get no
 * reports. Topic and message are the only required fields, and the email is
 * offered only because some people want a reply. */

const TOPICS = [
  'Menu or nutrition is wrong',
  'Something is broken',
  'Feature request',
  'Allergen or dietary issue',
  'Account help',
  'Something else',
];

const MAX = 4000;

export default function FeedbackSheet({ onClose }) {
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [note, setNote] = useState(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!message.trim() || status === 'sending') return;
    setStatus('sending');
    setNote(null);

    const result = await sendFeedback({ topic, message, replyEmail });

    if (result.ok) {
      setStatus('sent');
      return;
    }
    setStatus('error');
    setNote(
      result.reason === 'signed-out'
        ? 'You have been signed out. Sign back in and your message will send.'
        : result.reason === 'not-migrated'
          ? 'Feedback is not switched on yet. Email bentodining@gmail.com for now.'
          : 'That did not send. Check your connection and try again, or email bentodining@gmail.com.'
    );
  };

  return (
    <div className="fb-overlay" onClick={onClose}>
      <div
        className="fb-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Send feedback"
        onClick={(e) => e.stopPropagation()}
      >
        {status === 'sent' ? (
          <div className="fb-done">
            <div className="fb-done-mark" aria-hidden="true">✓</div>
            <h3>Got it</h3>
            <p>
              Thanks. We read every one of these.
              {replyEmail.trim() && ' We will reply if it needs one.'}
            </p>
            <button className="fb-primary" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="fb-head">
              <h3>Tell us what is wrong</h3>
              <button
                type="button"
                className="fb-close"
                onClick={onClose}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <label className="fb-label" htmlFor="fb-topic">What is this about</label>
            <select
              id="fb-topic"
              className="fb-select"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            >
              {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>

            <label className="fb-label" htmlFor="fb-message">What happened</label>
            <textarea
              id="fb-message"
              ref={textareaRef}
              className="fb-textarea"
              value={message}
              maxLength={MAX}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="The kosher filter is hiding things it should not, for example."
              rows={5}
            />

            <label className="fb-label" htmlFor="fb-email">
              Email <span className="fb-optional">optional, only if you want a reply</span>
            </label>
            <input
              id="fb-email"
              className="fb-input"
              type="email"
              value={replyEmail}
              onChange={(e) => setReplyEmail(e.target.value)}
              placeholder="you@brandeis.edu"
            />

            {note && <p className="fb-note">{note}</p>}

            <button
              type="submit"
              className="fb-primary"
              disabled={!message.trim() || status === 'sending'}
            >
              {status === 'sending' ? 'Sending…' : 'Send'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
