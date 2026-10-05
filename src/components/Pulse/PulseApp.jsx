import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getAdminRecord, updatePulsePassword } from '../../lib/pulseDb';
import PulseLogin from './PulseLogin';
import PulseDashboard from './PulseDashboard';
import PulseSetPassword from './PulseSetPassword';

// Demo mode. ?mock=true renders the dashboard with generated data and no login.
//
// Two reasons. A live pitch should not hinge on typing a password into a
// projector, and a beta-sized dataset ("3 active students") undersells a
// product whose value is what it does at scale.
//
// It is labelled on screen and unmistakably so, because showing invented
// numbers to a prospective customer without saying they are invented is the
// one thing that would actually cost the deal. No real data is read in this
// mode, so there is nothing to leak.
const DEMO = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('mock') === 'true';

export default function PulseApp() {
  const [session, setSession] = useState(undefined);
  // The result of the admin check, stamped with the session it was for. admin,
  // denied and checking are derived from it below, so a new or missing session
  // resets them without an effect having to say so.
  const [check, setCheck] = useState({ session: null, admin: null, denied: false });
  // Supabase fires PASSWORD_RECOVERY when someone opens a reset link. The
  // session that arrives is a recovery session: it can change the password and
  // little else, so the dashboard must not render until a new one is set.
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    getAdminRecord().then(record => {
      if (record?.is_active) {
        setCheck({ session, admin: record, denied: false });
      } else {
        setCheck({ session, admin: null, denied: true });
        supabase.auth.signOut();
      }
    });
  }, [session]);

  const checked  = Boolean(session) && check.session === session;
  const admin    = checked ? check.admin : null;
  const denied   = checked ? check.denied : false;
  const checking = Boolean(session) && !checked;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (recovering) {
    return (
      <PulseSetPassword
        onDone={async () => {
          setRecovering(false);
          // Sign out so the new password is used deliberately rather than
          // riding the recovery session straight into the dashboard.
          await supabase.auth.signOut();
        }}
        onSubmit={updatePulsePassword}
      />
    );
  }

  if (DEMO) {
    return (
      <PulseDashboard
        university="brandeis"
        isSuperAdmin={false}
        onSignOut={() => { window.location.href = '/admin'; }}
      />
    );
  }

  if (session === undefined || checking) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1e2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#f47421', borderRadius: '50%', animation: 'pulse-spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!session || !admin) {
    return (
      <PulseLogin
        onAuth={() => {}}
        denied={denied}
      />
    );
  }

  return (
    <PulseDashboard
      university={admin.university}
      isSuperAdmin={admin.is_super_admin === true}
      onSignOut={handleSignOut}
    />
  );
}
