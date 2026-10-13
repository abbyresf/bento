import { useCallback, useEffect, useState } from 'react';
import { configured } from './supabase.js';
import { useAuthFlow, useIdleSignOut, signOut } from './session.js';
import { nextStep, IDLE_MINUTES } from './steps.js';
import { logAction } from './data.js';
import { Loading, NotConfigured, SignIn, MfaVerify, MfaEnroll, Denied } from './Screens.jsx';
import LivePage from './LivePage.jsx';
import DataPage from './DataPage.jsx';
import CompensationPage from './CompensationPage.jsx';
import AuditPage from './AuditPage.jsx';
import SetupPage from './SetupPage.jsx';

/* The address after the # says where we are: #/live, #/data/meals, #/compensation,
 * #/audit. */
function useRoute() {
  const read = () => { const [, page = 'live', arg = ''] = window.location.hash.split('/'); return { page, arg }; };
  const [route, setRoute] = useState(read);
  useEffect(() => { const on = () => setRoute(read()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  const go = (path) => { window.location.hash = path; };
  return [route, go];
}

function Dashboard({ who }) {
  const [route, go] = useRoute();
  const isOwner = who.role === 'owner';
  const [idled, setIdled] = useState(false);

  const leave = useCallback(async () => { setIdled(true); await signOut(); }, []);
  useIdleSignOut(true, leave);

  const pages = [['live', 'Live'], ['data', 'Data'], ['compensation', 'Compensation'], ['setup', 'Setup'], ...(isOwner ? [['audit', 'Audit']] : [])];
  const page = pages.some(([k]) => k === route.page) ? route.page : 'live';

  return (
    <div className="rs-app">
      <header className="rs-top">
        <strong className="rs-brand">Bento Research</strong>
        <nav aria-label="Pages">
          {pages.map(([k, label]) => (
            <a key={k} href={`#/${k}`} aria-current={page === k ? 'page' : undefined} className={page === k ? 'is-active' : ''}>{label}</a>
          ))}
        </nav>
        <div className="rs-spacer" />
        <span className="rs-who" title={`Signs out after ${IDLE_MINUTES} minutes without activity`}>{who.email}{isOwner ? ' (owner)' : ''}</span>
        <button type="button" className="rs-btn rs-quiet" onClick={leave}>Sign out</button>
      </header>
      {idled && <p className="rs-note">Signed out.</p>}
      <main className="rs-main">
        {page === 'live' && <LivePage />}
        {page === 'data' && <DataPage sheetId={route.arg} onPick={(id) => go(`/data/${id}`)} />}
        {page === 'compensation' && <CompensationPage />}
        {page === 'setup' && <SetupPage />}
        {page === 'audit' && isOwner && <AuditPage />}
      </main>
    </div>
  );
}

export default function App() {
  const flow = useAuthFlow();
  // The sign in is recorded once, when the authenticator code is accepted, and not
  // on every page load: a reload with a live session is not a new sign in. Only a
  // multi-factor session can write the record, which is why it waits for the code.
  const afterCode = async () => { await flow.refresh(); logAction('sign_in', {}); };
  if (!configured) return <NotConfigured />;
  const step = nextStep(flow);
  if (step === 'loading') return <Loading />;
  if (step === 'signin') return <SignIn />;
  if (step === 'denied') return <Denied email={flow.session?.user?.email} />;
  if (step === 'mfa-enroll') return <MfaEnroll onDone={afterCode} />;
  if (step === 'mfa-verify') return <MfaVerify factor={flow.factors[0]} onDone={afterCode} />;
  return <Dashboard who={flow.who} />;
}
