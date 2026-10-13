import { useState } from 'react';
import { signIn, signOut, startEnroll, verifyCode } from './session.js';
import { cleanCode, codeProblem, signInProblem } from './steps.js';

/* The screens before the data: sign in, set up an authenticator app, enter its
 * code, and the one for an account that is not a researcher. Plain on purpose. */

function Card({ title, children }) {
  return (
    <main className="rs-auth">
      <div className="rs-authcard">
        <p className="rs-brand">Bento Research</p>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function Loading() { return <main className="rs-auth"><p className="rs-loading">Loading…</p></main>; }

export function NotConfigured() {
  return (
    <Card title="Not set up">
      <p>This copy of the dashboard has no database address. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to the deployment.</p>
    </Card>
  );
}

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const err = await signIn(email, password);
    setBusy(false);
    if (err) setError(signInProblem(err));
  };

  return (
    <Card title="Sign in">
      <form onSubmit={submit}>
        <label htmlFor="rs-email">Email</label>
        <input id="rs-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="rs-pass">Password</label>
        <input id="rs-pass" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="rs-error" role="alert">{error}</p>}
        <button type="submit" className="rs-btn rs-primary rs-wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="rs-hint">Accounts are by invitation. You will be asked for a code from your authenticator app.</p>
    </Card>
  );
}

function CodeForm({ onSubmit, label }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const problem = codeProblem(code);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    const err = await onSubmit(cleanCode(code));
    setBusy(false);
    if (err) setError(err);
  };
  return (
    <form onSubmit={submit}>
      <label htmlFor="rs-code">{label}</label>
      <input id="rs-code" className="rs-codeinput" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code}
             onChange={(e) => { setCode(e.target.value); setError(''); }} placeholder="123 456" />
      {error && <p className="rs-error" role="alert">{error}</p>}
      <button type="submit" className="rs-btn rs-primary rs-wide" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
    </form>
  );
}

export function MfaVerify({ factor, onDone }) {
  return (
    <Card title="Enter your code">
      <p>Open your authenticator app and enter the 6 digit code for Bento Research.</p>
      <CodeForm label="Code" onSubmit={async (code) => { const err = await verifyCode(factor.id, code); if (!err) await onDone(); return err; }} />
      <button type="button" className="rs-link" onClick={signOut}>Sign out</button>
    </Card>
  );
}

export function MfaEnroll({ onDone }) {
  const [setup, setSetup] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const begin = async () => {
    setBusy(true); setError('');
    const res = await startEnroll();
    setBusy(false);
    if (res.error) setError(res.error); else setSetup(res);
  };

  return (
    <Card title="Set up your authenticator app">
      {!setup ? (
        <>
          <p>This dashboard shows participants' data, so a password is not enough. Add an authenticator app (1Password, Google Authenticator, Authy or similar) once, and use its code each time you sign in.</p>
          {error && <p className="rs-error" role="alert">{error}</p>}
          <button type="button" className="rs-btn rs-primary rs-wide" onClick={begin} disabled={busy}>{busy ? 'Starting…' : 'Set up'}</button>
        </>
      ) : (
        <>
          <p>Scan this with your authenticator app, then enter the code it shows.</p>
          <img className="rs-qr" src={setup.qr} alt="QR code to add Bento Research to an authenticator app" width="180" height="180" />
          <details><summary>Cannot scan it?</summary><p className="rs-secret">Enter this key by hand: <code>{setup.secret}</code></p></details>
          <CodeForm label="Code from the app" onSubmit={async (code) => { const err = await verifyCode(setup.id, code); if (!err) await onDone(); return err; }} />
        </>
      )}
      <button type="button" className="rs-link" onClick={signOut}>Sign out</button>
    </Card>
  );
}

export function Denied({ email }) {
  return (
    <Card title="This account is not a researcher">
      <p>{email ? <>You are signed in as <strong>{email}</strong>, which</> : 'This account'} has no access to the research dashboard. If you should have access, ask the person who invited you to check the address they used.</p>
      <button type="button" className="rs-btn rs-wide" onClick={signOut}>Sign out</button>
    </Card>
  );
}
