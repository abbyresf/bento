import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './PulseJoin.css';

/* Accept a Pulse admin invite.
 *
 * This page used to read pulse_invites straight from the browser with the anon
 * key, selecting the invited email. That only worked because the table was
 * readable by anon, which also meant anyone could list every pending invite and
 * redeem one they were never sent. The table is closed now, and the page asks
 * the validate-invite function instead, which returns the university and a
 * masked email and nothing else.
 *
 * Two outcomes, decided by the server:
 *
 *   no account yet   -> choose a password, account created
 *   account exists   -> admin access granted, sign in with the existing
 *                       password. Nothing about their credentials changes.
 */

export default function PulseJoin({ token }) {
  const [invite, setInvite]   = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(null); // { accountExisted }

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke('validate-invite', { body: { token } })
      .then(({ data, error: fnErr }) => {
        if (cancelled) return;
        if (fnErr || !data?.valid) setInvalid(true);
        else setInvite(data);
      })
      .catch(() => { if (!cancelled) setInvalid(true); });
    return () => { cancelled = true; };
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
      if (fnErr) {
        // supabase-js wraps a non-2xx response as FunctionsHttpError and puts
        // the real message on the raw Response in .context.
        let msg = 'Something went wrong. Please try again.';
        try {
          const body = await fnErr.context?.json?.();
          if (body?.error) msg = body.error;
        } catch { /* non-JSON body */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      setDone({ accountExisted: data?.accountExisted === true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // An invite for an address that already has a Bento account needs no password
  // at all, so accept it in one tap rather than asking for one we will not use.
  const acceptExisting = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('redeem-invite', {
        body: { token },
      });
      if (fnErr || data?.error) throw new Error(data?.error ?? 'Could not accept the invite.');
      setDone({ accountExisted: true });
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

        {!invite && !invalid && <p className="pulse-join-loading">Checking invite…</p>}

        {invalid && (
          <div className="pulse-join-error-state">
            <p className="pulse-join-error-title">Invite not valid</p>
            <p className="pulse-join-error-body">
              This link is invalid, expired, revoked, or has already been used.
              Ask whoever invited you to send a new one.
            </p>
            <a href="/admin" className="pulse-join-btn pulse-join-btn-link">Go to sign in</a>
          </div>
        )}

        {invite && !done && (
          <>
            <p className="pulse-join-sub">
              You've been invited to manage dining analytics for{' '}
              <strong>{invite.university}</strong>.
            </p>

            <form onSubmit={handleSubmit} className="pulse-join-form">
              <div className="pulse-join-field">
                <label htmlFor="join-email">Email</label>
                {/* Masked. The invitee knows their own address, and anyone else
                    holding the link should not learn whose invite it is. */}
                <input
                  id="join-email"
                  type="text"
                  value={invite.emailMasked}
                  readOnly
                  className="pulse-join-readonly"
                />
              </div>
              <div className="pulse-join-field">
                <label htmlFor="join-pw">Password</label>
                <input
                  id="join-pw"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="pulse-join-field">
                <label htmlFor="join-pw2">Confirm password</label>
                <input
                  id="join-pw2"
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
                {loading ? 'Setting up…' : 'Create account'}
              </button>
            </form>

            <p className="pulse-join-alt">
              Already have a Bento account with this address?{' '}
              <button type="button" className="pulse-join-linkbtn" onClick={acceptExisting} disabled={loading}>
                Accept without changing your password
              </button>
            </p>
          </>
        )}

        {done && (
          <div className="pulse-join-success">
            <p className="pulse-join-success-title">
              {done.accountExisted ? 'Access granted' : 'Account created'}
            </p>
            <p className="pulse-join-success-body">
              {done.accountExisted
                ? 'Sign in with the password you already use for Bento. It has not been changed.'
                : 'You can now sign in to Bento Pulse.'}
            </p>
            <a href="/admin" className="pulse-join-btn pulse-join-btn-link">Go to sign in</a>
          </div>
        )}
      </div>
    </div>
  );
}
