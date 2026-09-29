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
  const [email, setEmail] = useState('');
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
    if (!email.trim()) { setError('Enter the email this invite was sent to.'); return; }
    // Required when creating an account. Optional for an existing one, but
    // validated the moment anything is typed.
    if (!invite.accountExists || password || confirm) {
      if (password !== confirm) { setError('Passwords do not match.'); return; }
      if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    }

    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('redeem-invite', {
        body: {
          token,
          email: email.trim(),
          // Omitted entirely when an existing user leaves it blank, which the
          // server reads as "keep my current password".
          ...(password ? { password } : {}),
        },
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
      setDone({
        accountExisted: data?.accountExisted === true,
        passwordSet: data?.passwordSet === true,
      });
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
            <p className="pulse-join-eyebrow">
              {invite.accountExists ? 'Accept invitation' : 'Set up your account'}
            </p>
            <p className="pulse-join-sub">
              You've been invited to manage dining analytics for{' '}
              <strong>{invite.university}</strong>.{' '}
              {invite.accountExists
                ? 'You already have a Bento account with this address. Set a password below and use it from now on, or keep the one you have.'
                : 'Choose a password to finish creating your Bento Pulse account.'}
            </p>

            <form onSubmit={handleSubmit} className="pulse-join-form">
              <div className="pulse-join-field">
                <label htmlFor="join-email">Your email</label>
                {/* Typed rather than pre-filled. The server checks it against
                    the invite, so holding the link is not enough on its own:
                    you also have to know who it was for. The masked hint below
                    is there so a legitimate invitee is never left guessing. */}
                <input
                  id="join-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  required
                  autoComplete="email"
                  autoFocus
                />
                <p className="pulse-join-hint">
                  This invite was sent to <strong>{invite.emailMasked}</strong>
                </p>
              </div>
              {(<>
              <div className="pulse-join-field">
                <label htmlFor="join-pw">{invite.accountExists ? 'New password' : 'Password'}</label>
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
              </>)}

              {error && <p className="pulse-join-err">{error}</p>}
              <button type="submit" className="pulse-join-btn" disabled={loading}>
                {loading
                  ? 'Working…'
                  : invite.accountExists ? 'Set password and accept' : 'Create account'}
              </button>

              {invite.accountExists && (
                <button
                  type="button"
                  className="pulse-join-linkbtn"
                  disabled={loading}
                  onClick={() => { setPassword(''); setConfirm(''); setTimeout(() => document.querySelector('.pulse-join-form')?.requestSubmit(), 0); }}
                >
                  Keep my current password
                </button>
              )}
            </form>

          </>
        )}

        {done && (
          <div className="pulse-join-success">
            <p className="pulse-join-success-title">
              {done.accountExisted ? 'Access granted' : 'Account created'}
            </p>
            <p className="pulse-join-success-body">
              {done.passwordSet
                ? 'Sign in with the password you just set.'
                : 'Admin access added. Sign in with the password you already use for Bento, which has not been changed.'}
            </p>
            <a href="/admin" className="pulse-join-btn pulse-join-btn-link">Go to sign in</a>
          </div>
        )}
      </div>
    </div>
  );
}
