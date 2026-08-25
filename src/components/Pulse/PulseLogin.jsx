import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import './PulseLogin.css';

export default function PulseLogin({ onAuth, denied }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      onAuth();
    } catch (err) {
      setError(err.message ?? 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pulse-login">
      <div className="pulse-login-card">

        <div className="pulse-login-pill">
          <img src="/bentopulse.png" alt="Bento Pulse" className="pulse-login-pill-logo" />
        </div>

        <h1 className="pulse-login-headline">
          Your system knows what's served.{' '}
          <span className="pulse-login-accent">Bento knows what's eaten.</span>
        </h1>

        <p className="pulse-login-sub">
          Real-time dining intelligence for your university.
        </p>

        {denied && (
          <p className="pulse-login-error">Your account doesn't have admin access.</p>
        )}

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
        </form>
      </div>
    </div>
  );
}
