import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, signUp, signInWithGoogle, resetPasswordForEmail } from '../../lib/db';
import './AuthScreen.css';

function passwordStrength(pw) {
  if (!pw) return null;
  if (pw.length < 6) return { level: 'weak', label: 'Too short — minimum 6 characters' };
  const has_upper = /[A-Z]/.test(pw);
  const has_lower = /[a-z]/.test(pw);
  const has_digit = /[0-9]/.test(pw);
  const has_symbol = /[^A-Za-z0-9]/.test(pw);
  const score = [has_upper, has_lower, has_digit, has_symbol].filter(Boolean).length;
  if (pw.length >= 12 && score >= 3) return { level: 'strong', label: 'Strong password' };
  if (pw.length >= 8 && score >= 2) return { level: 'fair', label: 'Fair — add numbers or symbols to strengthen' };
  return { level: 'weak', label: 'Weak — use a mix of letters, numbers, and symbols' };
}

function friendlyAuthError(msg) {
  if (!msg) return 'Something went wrong. Please try again.';
  const m = msg.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Incorrect email or password.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox.';
  if (m.includes('user already registered') || m.includes('already been registered')) return 'An account with this email already exists. Try logging in.';
  if (m.includes('password should be')) return 'Password must be at least 6 characters.';
  if (m.includes('unable to validate') || m.includes('provider')) return 'Google sign-in failed. Please try again or use email instead.';
  if (m.includes('network') || m.includes('fetch')) return 'Network error. Check your connection and try again.';
  return 'Something went wrong. Please try again.';
}

export default function AuthScreen({ onAuth, initialMode = 'login' }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode); // 'login' | 'signup' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const strength = mode === 'signup' ? passwordStrength(password) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && strength?.level === 'weak') {
      setError(strength.label);
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password);
        setConfirmSent(true);
      } else {
        await signIn(email, password);
        onAuth();
      }
    } catch (err) {
      setError(friendlyAuthError(err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await resetPasswordForEmail(email);
      setResetSent(true);
    } catch (err) {
      setError(friendlyAuthError(err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // OAuth redirects away — no further action needed here
    } catch (err) {
      setError(friendlyAuthError(err.message));
      setGoogleLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <img src="/logo-cropped.png" alt="Bento" className="auth-logo" />

        {confirmSent ? (
          <div className="auth-confirm">
            <h2>Check your email</h2>
            <p>We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back and log in.</p>
            <button className="auth-link" onClick={() => { setMode('login'); setConfirmSent(false); }}>
              Back to log in
            </button>
          </div>
        ) : resetSent ? (
          <div className="auth-confirm">
            <h2>Check your email</h2>
            <p>We sent a password reset link to <strong>{email}</strong>. Click it to choose a new password.</p>
            <button className="auth-link" onClick={() => { setMode('login'); setResetSent(false); }}>
              Back to log in
            </button>
          </div>
        ) : mode === 'forgot' ? (
          <>
            <h2 className="auth-title">Reset your password</h2>
            <p className="auth-subtitle">Enter your email and we'll send you a reset link.</p>
            <form onSubmit={handleForgotPassword} className="auth-form">
              <div className="auth-field">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  required
                  autoComplete="email"
                />
              </div>
              {error && <p className="auth-error">{error}</p>}
              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <p className="auth-switch">
              <button className="auth-link" onClick={() => { setMode('login'); setError(null); }}>
                Back to log in
              </button>
            </p>
          </>
        ) : (
          <>
            <h2 className="auth-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>

            <button
              className="google-btn"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              {googleLoading ? 'Redirecting…' : 'Continue with Google'}
            </button>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="auth-field">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="auth-field">
                <label>Password</label>
                <div className="auth-password-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    className="auth-show-pw"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {mode === 'signup' && !strength && (
                  <p className="auth-pw-hint">At least 8 characters recommended</p>
                )}
                {mode === 'signup' && strength && (
                  <div className={`auth-strength auth-strength--${strength.level}`}>
                    <div className="auth-strength-bar">
                      <div className="auth-strength-fill" />
                    </div>
                    <span>{strength.label}</span>
                  </div>
                )}
              </div>

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" className="auth-btn" disabled={loading || googleLoading}>
                {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
              </button>

              {mode === 'login' && (
                <button
                  type="button"
                  className="auth-link auth-forgot"
                  onClick={() => { setMode('forgot'); setError(null); }}
                >
                  Forgot password?
                </button>
              )}
            </form>

            <p className="auth-switch">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button className="auth-link" onClick={() => { setError(null); navigate(mode === 'login' ? '/signup' : '/login'); }}>
                {mode === 'login' ? 'Sign up' : 'Log in'}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
