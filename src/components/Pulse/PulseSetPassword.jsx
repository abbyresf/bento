import { useState } from 'react';
import './PulseLogin.css';

/* Set a new password after opening a reset link.
 *
 * Reached only through PASSWORD_RECOVERY, so the session in hand is a recovery
 * session. It exists to change the password and nothing else, which is why the
 * dashboard is not rendered underneath and why the user is signed out
 * afterwards rather than being let straight in.
 */
export default function PulseSetPassword({ onSubmit, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState(null);
  const [busy, setBusy]         = useState(false);
  const [done, setDone]         = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      await onSubmit(password);
      setDone(true);
      await onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pulse-login">
      <div className="pulse-login-card">
        <img src="/bentopulse.png" alt="Bento Pulse" className="pulse-login-logo" />

        {done ? (
          <div className="pulse-login-sent">
            <p className="pulse-login-sent-title">Password updated</p>
            <p className="pulse-login-sent-body">Sign in with your new password.</p>
            <a href="/admin" className="pulse-login-btn pulse-login-btn-link">Go to sign in</a>
          </div>
        ) : (
          <form onSubmit={submit} className="pulse-login-form">
            <div className="pulse-login-field">
              <label htmlFor="new-pw">New password</label>
              <input
                id="new-pw"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                autoComplete="new-password"
                autoFocus
              />
            </div>
            <div className="pulse-login-field">
              <label htmlFor="new-pw2">Confirm password</label>
              <input
                id="new-pw2"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                required
                autoComplete="new-password"
              />
            </div>
            {error && <p className="pulse-login-error">{error}</p>}
            <button type="submit" className="pulse-login-btn" disabled={busy}>
              {busy ? 'Saving…' : 'Set password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
