import { useEffect, useState } from 'react';
import { submitUniversityRequest } from '../../lib/db';
import './RutgersWaitlist.css';

// Public waitlist page for Rutgers, shared by the campus ambassador.
// Signups go to university_requests, the same table the "Request your school" form uses.

const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,700;12..96,75..100,800&family=Geist:wght@400;500;600;700&display=swap';
const UNIVERSITY = 'Rutgers University–New Brunswick';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RutgersWaitlist() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Bento is coming to Rutgers';
    if (!document.querySelector(`link[href="${FONTS_HREF}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONTS_HREF;
      document.head.appendChild(link);
    }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const n = name.trim();
    const em = email.trim().toLowerCase();
    if (!n) { setError('Add your name.'); return; }
    if (!EMAIL_RE.test(em)) { setError('That email looks off.'); return; }
    setError('');
    setStatus('sending');
    try {
      await submitUniversityRequest({ university: UNIVERSITY, email: em, name: n.slice(0, 120), notify: true });
      setStatus('done');
    } catch (err) {
      // Same email twice in one day hits a unique index. They are already on the list.
      if (err?.code === '23505') { setStatus('done'); return; }
      setStatus('error');
      setError('Something broke. Try again in a minute.');
    }
  };

  return (
    <div className="loud rw">
      <div className="rw-glow rw-glow-a" />
      <div className="rw-glow rw-glow-b" />

      <main className="rw-main">
        <a className="rw-logo" href="/" aria-label="Bento home">
          <picture>
            <source srcSet="/logo-cropped-beige.png" media="(prefers-color-scheme: dark)" />
            <img src="/logo-cropped.png" alt="Bento" width="717" height="241" />
          </picture>
        </a>

        {status === 'done' ? (
          <section className="rw-card rw-done">
            <div className="rw-label">Rutgers waitlist</div>
            <h1 className="rw-big">You're in.</h1>
            <p className="rw-sub">We'll email you the day Bento opens at Rutgers. Send this page to your friends so they get in too.</p>
            <button
              type="button"
              className="rw-btn is-ink"
              onClick={() => {
                const url = window.location.href;
                if (navigator.share) navigator.share({ title: 'Bento at Rutgers', url }).catch(() => {});
                else navigator.clipboard?.writeText(url);
              }}
            >
              Share with friends
            </button>
          </section>
        ) : (
          <section className="rw-card">
            <div className="rw-label">Rutgers, New Brunswick</div>
            <h1 className="rw-big">Bento is coming to Rutgers.</h1>
            <p className="rw-sub">Bento reads your dining hall menus and builds your meals around your goals. Join the waitlist and get in first.</p>

            <form className="rw-form" onSubmit={submit} noValidate>
              <label className="rw-field">
                <span>Name</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  maxLength={120}
                  onChange={e => setName(e.target.value)}
                  placeholder="Scarlet Knight"
                />
              </label>
              <label className="rw-field">
                <span>Email</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@rutgers.edu"
                />
              </label>
              {error && <p className="rw-error" role="alert">{error}</p>}
              <button type="submit" className="rw-btn is-li" disabled={status === 'sending'}>
                {status === 'sending' ? 'Joining…' : 'Join the waitlist'}
              </button>
            </form>
          </section>
        )}

        <p className="rw-fine">We only use your email to tell you when Bento launches. <a href="/privacy">Privacy</a></p>
      </main>
    </div>
  );
}
