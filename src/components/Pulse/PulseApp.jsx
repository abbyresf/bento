import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getAdminRecord } from '../../lib/pulseDb';
import PulseLogin from './PulseLogin';
import PulseDashboard from './PulseDashboard';

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
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setAdmin(null); setDenied(false); return; }
    setChecking(true);
    getAdminRecord().then(record => {
      if (record?.is_active) {
        setAdmin(record);
        setDenied(false);
      } else {
        setAdmin(null);
        setDenied(true);
        supabase.auth.signOut();
      }
      setChecking(false);
    });
  }, [session]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setAdmin(null);
    setDenied(false);
  };

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
