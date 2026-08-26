import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { isOnboardingComplete, isTermsAccepted, setTermsAccepted, signOut, updatePassword } from './lib/db';
import AuthScreen from './components/Auth/AuthScreen';
import LandingPage from './components/Landing/LandingPage';
import OnboardingWizard from './components/Onboarding/OnboardingWizard';
import MealPlan from './components/MealPlan/MealPlan';
import Settings from './components/Settings/Settings';
import InsightsPanel from './components/Insights/InsightsPanel';
import BottomNav from './components/Nav/BottomNav';
import TermsGate from './components/Terms/TermsGate';
import InstallPrompt from './components/Install/InstallPrompt';
import AppTutorial from './components/Install/AppTutorial';
import PulseApp from './components/Pulse/PulseApp';
import PulseJoin from './components/Pulse/PulseJoin';
import MyRatings from './components/MyRatings/MyRatings';
import CommunityTab from './components/Community/CommunityTab';
import { RatingsProvider } from './context/RatingsContext';
import SplashScreen from './components/Splash/SplashScreen';
import './App.css';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // All hooks must be called unconditionally before any early returns
  const [session, setSession] = useState(undefined);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(null);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(null);
  const [showLanding, setShowLanding] = useState(false);
  const [landingInitialTab, setLandingInitialTab] = useState('home');
  const [activeTab, setActiveTab] = useState('today');
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showHelpBtn, setShowHelpBtn] = useState(
    () => localStorage.getItem('bento_tutorial_done') === '1'
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showSplash, setShowSplash] = useState(() => {
    const last = parseInt(localStorage.getItem('bento_splash_ts') || '0', 10);
    return Date.now() - last > 3 * 60 * 60 * 1000;
  });

  useEffect(() => {
    let settled = false;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!settled) setSession(s ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      settled = true;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setSession(s ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    const isPreview = location.search.includes('preview_install');
    if (!hasCompletedOnboarding || !hasAcceptedTerms) return;
    if (isStandalone()) return;
    if (!isPreview && localStorage.getItem('bento_install_prompted') === '1') return;
    if (!isIOS() && !deferredInstallPrompt && !isPreview) return;
    const t = setTimeout(() => setShowInstallPrompt(true), isPreview ? 500 : 2000);
    return () => clearTimeout(t);
  }, [hasCompletedOnboarding, hasAcceptedTerms, deferredInstallPrompt]);

  useEffect(() => {
    if (!hasCompletedOnboarding || !hasAcceptedTerms) return;
    if (localStorage.getItem('bento_tutorial_done') === '1') return;
    if (!isStandalone() && localStorage.getItem('bento_install_prompted') !== '1') return;
    setShowTutorial(true);
  }, [hasCompletedOnboarding, hasAcceptedTerms]);

  useEffect(() => {
    if (!session) return;
    isOnboardingComplete().then(setHasCompletedOnboarding);
    isTermsAccepted().then(setHasAcceptedTerms);
  }, [session]);

  // ── Computed values & handlers ────────────────────────────────────────────────

  const joinMatch = location.pathname.match(/^\/admin\/join\/([0-9a-f-]+)$/i);
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/signup';
  const isAppRoute  = location.pathname.startsWith('/app');

  const handleOnboardingComplete = () => setHasCompletedOnboarding(true);

  const handleAcceptTerms = async () => {
    await setTermsAccepted();
    setHasAcceptedTerms(true);
  };

  const handleReset = async () => {
    await signOut();
    setHasCompletedOnboarding(null);
    setHasAcceptedTerms(null);
    setActiveTab('today');
    setShowLanding(false);
    setSession(null);
    navigate('/');
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setResetError(null);
    setResetLoading(true);
    try {
      await updatePassword(newPassword);
      setPasswordRecovery(false);
      setNewPassword('');
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoContact = () => { setLandingInitialTab('contact'); setShowLanding(true); };
  const handleGoRequestSchool = () => { setLandingInitialTab('request'); setShowLanding(true); };

  // ── Route branching (after all hooks) ────────────────────────────────────────

  if (joinMatch) return <PulseJoin token={joinMatch[1]} />;
  if (location.pathname.startsWith('/admin')) return <PulseApp />;
  if (location.pathname === '/preview') return <LandingPage onGetStarted={() => navigate('/login')} />;

  if (isAuthRoute) {
    if (session) return <Navigate to="/app" replace />;
    return (
      <AuthScreen
        key={location.pathname}
        initialMode={location.pathname === '/signup' ? 'signup' : 'login'}
        onAuth={() => navigate('/app')}
      />
    );
  }

  if (!isAppRoute) {
    if (session === undefined) return null;
    if (session) return <Navigate to="/app" replace />;
    return <LandingPage onGetStarted={() => navigate('/login')} />;
  }

  // ── App route (/app) — requires auth ─────────────────────────────────────────

  if (showSplash) {
    return <SplashScreen onDone={() => {
      localStorage.setItem('bento_splash_ts', Date.now().toString());
      setShowSplash(false);
    }} />;
  }

  if (session === undefined || (session && hasCompletedOnboarding === null)) {
    return <div className="app-loading"><div className="spinner"></div></div>;
  }

  if (!session) return <Navigate to="/login" replace />;

  if (passwordRecovery) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <img src="/logo-cropped.png" alt="Bento" className="auth-logo" />
          <h2 className="auth-title">Set a new password</h2>
          <form onSubmit={handlePasswordReset} className="auth-form">
            <div className="auth-field">
              <label>New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                autoComplete="new-password"
                minLength={6}
              />
            </div>
            {resetError && <p className="auth-error">{resetError}</p>}
            <button type="submit" className="auth-btn" disabled={resetLoading}>
              {resetLoading ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (showLanding) {
    return <LandingPage onGetStarted={() => setShowLanding(false)} initialTab={landingInitialTab} />;
  }

  if (!hasCompletedOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} onGoContact={handleGoContact} onRequestSchool={handleGoRequestSchool} />;
  }

  if (!hasAcceptedTerms) {
    return <TermsGate onAccept={handleAcceptTerms} />;
  }

  return (
    <RatingsProvider>
      <div className="app">
        <div className="tab-content">
          {activeTab === 'today' && (
            <MealPlan settingsVersion={settingsVersion} />
          )}
          {activeTab === 'ratings' && (
            <MyRatings tabMode />
          )}
          {activeTab === 'community' && (
            <CommunityTab />
          )}
          {activeTab === 'insights' && (
            <InsightsPanel tabMode onClose={() => setActiveTab('today')} />
          )}
        </div>
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab === activeTab && tab !== 'today' ? 'today' : tab)}
        />

        {activeTab === 'today' && showHelpBtn && !showTutorial && !showInstallPrompt && (
          <button
            className="help-btn"
            onClick={() => setShowTutorial(true)}
            aria-label="Help"
          >
            ?
          </button>
        )}

        {activeTab === 'today' && <button
          className="settings-fab"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>}

        {showSettings && (
          <Settings
            onReset={handleReset}
            onGoContact={handleGoContact}
            onSave={() => {
              setSettingsVersion(v => v + 1);
              setShowSettings(false);
            }}
            onClose={() => setShowSettings(false)}
          />
        )}

        {showInstallPrompt && (
          <InstallPrompt
            deferredPrompt={deferredInstallPrompt}
            forceIOS={location.search.includes('preview_install=ios')}
            onInstall={() => {
              localStorage.setItem('bento_install_prompted', '1');
              setShowInstallPrompt(false);
              setShowTutorial(true);
            }}
            onDismiss={() => {
              localStorage.setItem('bento_install_prompted', '1');
              setShowInstallPrompt(false);
              setShowTutorial(true);
            }}
          />
        )}

        {showTutorial && (
          <AppTutorial onDone={() => {
            localStorage.setItem('bento_tutorial_done', '1');
            setShowTutorial(false);
            setShowHelpBtn(true);
          }} />
        )}

      </div>
    </RatingsProvider>
  );
}

export default App;
