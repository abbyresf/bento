import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { isOnboardingComplete, isTermsAccepted, setTermsAccepted, signOut, updatePassword } from './lib/db';
import AuthScreen from './components/Auth/AuthScreen';
import LandingPage from './components/Landing/LandingPage';
import OnboardingWizard from './components/Onboarding/OnboardingWizard';
import MealPlan from './components/MealPlan/MealPlan';
import Settings from './components/Settings/Settings';
import Favorites from './components/Favorites/Favorites';
import InsightsPanel from './components/Insights/InsightsPanel';
import BottomNav from './components/Nav/BottomNav';
import TermsGate from './components/Terms/TermsGate';
import InstallPrompt from './components/Install/InstallPrompt';
import AppTutorial from './components/Install/AppTutorial';
import PulseApp from './components/Pulse/PulseApp';
import { FavoritesProvider } from './context/FavoritesContext';
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

  if (location.pathname.startsWith('/admin')) {
    return <PulseApp />;
  }

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

  const isAuthRoute = location.pathname === '/login' || location.pathname === '/signup';

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setSession(s ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Capture the install prompt early — it fires before the user reaches the meal plan
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Show install prompt 2s after landing on the meal plan (once, if not already prompted/installed)
  useEffect(() => {
    const isPreview = location.search.includes('preview_install');
    if (!hasCompletedOnboarding || !hasAcceptedTerms) return;
    if (isStandalone()) return;
    if (!isPreview && localStorage.getItem('bento_install_prompted') === '1') return;
    if (!isIOS() && !deferredInstallPrompt && !isPreview) return;
    const t = setTimeout(() => setShowInstallPrompt(true), isPreview ? 500 : 2000);
    return () => clearTimeout(t);
  }, [hasCompletedOnboarding, hasAcceptedTerms, deferredInstallPrompt]);

  // Show tutorial when running as installed PWA and tutorial hasn't been completed.
  // isStandalone() is the reliable signal on iOS — the browser closes when the user
  // adds to home screen, so bento_install_prompted is never written in that flow.
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

  if (session === undefined) {
    return <div className="app-loading"><div className="spinner"></div></div>;
  }

  if (session && isAuthRoute) {
    return <Navigate to="/" replace />;
  }

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

  if (!session) {
    if (isAuthRoute) {
      return (
        <AuthScreen
          initialMode={location.pathname === '/signup' ? 'signup' : 'login'}
          onAuth={() => navigate('/')}
        />
      );
    }
    return <LandingPage onGetStarted={() => navigate('/login')} />;
  }

  if (hasCompletedOnboarding === null) {
    return <div className="app-loading"><div className="spinner"></div></div>;
  }

  if (showLanding) {
    return <LandingPage onGetStarted={() => setShowLanding(false)} initialTab={landingInitialTab} />;
  }

  const handleGoContact = () => { setLandingInitialTab('contact'); setShowLanding(true); };
  const handleGoRequestSchool = () => { setLandingInitialTab('request'); setShowLanding(true); };

  if (!hasCompletedOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} onGoContact={handleGoContact} onRequestSchool={handleGoRequestSchool} />;
  }

  if (!hasAcceptedTerms) {
    return <TermsGate onAccept={handleAcceptTerms} />;
  }

  return (
    <FavoritesProvider>
      <div className="app">
        <div className="tab-content">
          {activeTab === 'today' && (
            <MealPlan settingsVersion={settingsVersion} />
          )}
          {activeTab === 'favorites' && (
            <Favorites tabMode onClose={() => setActiveTab('today')} />
          )}
          {activeTab === 'insights' && (
            <InsightsPanel tabMode onClose={() => setActiveTab('today')} />
          )}
          {activeTab === 'settings' && (
            <Settings
              tabMode
              onReset={handleReset}
              onGoContact={handleGoContact}
              onSave={() => {
                setSettingsVersion(v => v + 1);
                setActiveTab('today');
              }}
              onClose={() => setActiveTab('today')}
            />
          )}
        </div>
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab === activeTab && tab !== 'today' ? 'today' : tab)}
        />

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

        {showHelpBtn && !showTutorial && !showInstallPrompt && (
          <button
            className="help-btn"
            onClick={() => setShowTutorial(true)}
            aria-label="Help"
          >
            ?
          </button>
        )}
      </div>
    </FavoritesProvider>
  );
}

export default App;
