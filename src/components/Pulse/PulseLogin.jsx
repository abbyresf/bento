import { useState } from 'react';
import ServiceDown from '../common/ServiceDown';
import { supabase } from '../../lib/supabase';
import { sendPulsePasswordReset } from '../../lib/pulseDb';
import './PulseLogin.css';

export default function PulseLogin({ onAuth, denied }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [serviceDown, setServiceDown] = useState(false);
  const [loading, setLoading] = useState(false);
  // Pulse had no password recovery at all. An admin who forgot theirs had no
  // route back in, because the only thing that ever set a password was
  // redeeming an invite.
  const [mode, setMode] = useState('signin');   // 'signin' | 'reset'
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      onAuth();
    } catch (err) {
      const m = (err.message ?? '').toLowerCase();
      // "Failed to fetch" means the request never landed. If the browser is
      // online, that is our backend, not their connection.
      if (navigator.onLine && (m.includes('failed to fetch') || m.includes('load failed') || m.includes('networkerror'))) {
        setServiceDown(true);
      } else {
        setError(err.message ?? 'Sign in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await sendPulsePasswordReset(email);
      // Shown whether or not the address exists. Confirming which emails are
      // admins would hand an attacker a target list.
      setResetSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (serviceDown) return <ServiceDown onRetry={() => setServiceDown(false)} />;

  return (
    <div className="pulse-login">
      <div className="pulse-login-card">

        {/* The logo sits on the card with nothing behind it. It was previously
            wrapped in a tinted pill, which read as a white box around a
            transparent PNG. The file was always transparent; the box was CSS. */}
        <img src="/bentopulse.png" alt="Bento Pulse" className="pulse-login-logo" />

        {denied && (
          <p className="pulse-login-error">Your account doesn't have admin access.</p>
        )}

        {mode === 'reset' && (
          resetSent ? (
            <div className="pulse-login-sent">
              <p className="pulse-login-sent-title">Check your email</p>
              <p className="pulse-login-sent-body">
                If an admin account exists for {email}, a reset link is on its way.
                The link expires shortly, so use it soon.
              </p>
              <button
                type="button"
                className="pulse-login-linkbtn"
                onClick={() => { setMode('signin'); setResetSent(false); }}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="pulse-login-form">
              <div className="pulse-login-field">
                <label htmlFor="reset-email">Email</label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@university.edu"
                  required
                  autoComplete="email"
                />
              </div>
              {error && <p className="pulse-login-error">{error}</p>}
              <button type="submit" className="pulse-login-btn" disabled={loading || !email.trim()}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <button type="button" className="pulse-login-linkbtn" onClick={() => setMode('signin')}>
                Back to sign in
              </button>
            </form>
          )
        )}

        {mode === 'signin' && (
        <form onSubmit={handleSubmit} className="pulse-login-form">
          <div className="pulse-login-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@university.edu"
              required
              autoComplete="email"
            />
          </div>
          <div className="pulse-login-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="pulse-login-error">{error}</p>}
          <button type="submit" className="pulse-login-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            type="button"
            className="pulse-login-linkbtn"
            onClick={() => { setMode('reset'); setError(null); }}
          >
            Forgot your password?
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
