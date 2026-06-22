import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './PulseJoin.css';

export default function PulseJoin({ token }) {
  const [invite, setInvite]     = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  useEffect(() => {
    supabase
      .from('pulse_invites')
      .select('email, university, expires_at')
      .eq('id', token)
      .single()
      .then(({ data }) => {
        if (data) setInvite(data);
        else setNotFound(true);
      });
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('redeem-invite', {
        body: { token, password },
      });
      if (fnErr || data?.error) throw new Error(data?.error ?? 'Something went wrong.');
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pulse-join">
      <div className="pulse-join-card">
        <img src="/bentopulse.png" alt="Bento Pulse" className="pulse-join-logo" />

        {!invite && !notFound && (
          <p className="pulse-join-loading">Validating invite…</p>
        )}

        {notFound && (
          <div className="pulse-join-error-state">
            <p className="pulse-join-error-title">Invite not found</p>
            <p className="pulse-join-error-body">This link is invalid, expired, or has already been used.</p>
          </div>
        )}

        {invite && !done && (
          <>
            <p className="pulse-join-sub">You've been invited to manage dining analytics for <strong>{invite.university}</strong>.</p>
            <form onSubmit={handleSubmit} className="pulse-join-form">
              <div className="pulse-join-field">
                <label>Email</label>
                <input type="email" value={invite.email} readOnly className="pulse-join-readonly" />
              </div>
              <div className="pulse-join-field">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="pulse-join-field">
                <label>Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat your password"
                  required
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="pulse-join-err">{error}</p>}
              <button type="submit" className="pulse-join-btn" disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </>
        )}

        {done && (
          <div className="pulse-join-success">
            <p className="pulse-join-success-title">Account created</p>
            <p className="pulse-join-success-body">You can now sign in to Bento Pulse.</p>
            <a href="/admin" className="pulse-join-btn pulse-join-btn-link">Go to sign in</a>
          </div>
        )}
      </div>
    </div>
  );
}
