import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { isOnboardingComplete, isTermsAccepted, setTermsAccepted, signOut, updatePassword } from './lib/db';
import AuthScreen from './components/Auth/AuthScreen';
import LandingPage from './components/Landing/LandingPage';
import OnboardingWizard from './components/Onboarding/OnboardingWizard';
import SwipeOnboarding from './components/Onboarding/SwipeOnboarding';
import MealPlan from './components/MealPlan/MealPlan';
import Settings from './components/Settings/Settings';
import Favorites from './components/Favorites/Favorites';
import TermsGate from './components/Terms/TermsGate';
import { FavoritesProvider } from './context/FavoritesContext';
import './App.css';

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const [session, setSession] = useState(undefined); // undefined = loading
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(null);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(null);
  const [showLanding, setShowLanding] = useState(false);
  const [showSwipeOnboarding, setShowSwipeOnboarding] = useState(false);
  const [landingInitialTab, setLandingInitialTab] = useState('home');
  const [showSettings, setShowSettings] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState(null);
  const [resetLoading, setResetLoading] = useState(false);

  const isAuthRoute = location.pathname === '/login' || location.pathname === '/signup';

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setSession(s ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    isOnboardingComplete().then(setHasCompletedOnboarding);
    isTermsAccepted().then(setHasAcceptedTerms);
  }, [session]);

  // Show swipe onboarding once after profile + terms are done
  useEffect(() => {
    if (!session || !hasCompletedOnboarding || !hasAcceptedTerms) return;
    if (localStorage.getItem('bento_swipe_done') !== '1') {
      setShowSwipeOnboarding(true);
    }
  }, [session, hasCompletedOnboarding, hasAcceptedTerms]);

  const handleOnboardingComplete = () => setHasCompletedOnboarding(true);

  const handleAcceptTerms = async () => {
    await setTermsAccepted();
    setHasAcceptedTerms(true);
  };

  const handleReset = async () => {
    await signOut();
    setHasCompletedOnboarding(null);
    setHasAcceptedTerms(null);
    setShowSettings(false);
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

  // Waiting for auth to resolve
  if (session === undefined) {
    return <div className="app-loading"><div className="spinner"></div></div>;
  }

  // Logged-in user hitting /login or /signup — bounce to app
  if (session && isAuthRoute) {
    return <Navigate to="/" replace />;
  }

  // Password recovery — user clicked reset link in email
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

  // Not logged in: /login and /signup show auth, everything else shows landing
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

  // Logged in but user data still loading
  if (hasCompletedOnboarding === null) {
    return <div className="app-loading"><div className="spinner"></div></div>;
  }

  // Logged-in user viewing landing page (via home button)
  if (showLanding) {
    return <LandingPage onGetStarted={() => setShowLanding(false)} initialTab={landingInitialTab} />;
  }

  const handleGoContact = () => { setLandingInitialTab('contact'); setShowLanding(true); };

  // Onboarding
  if (!hasCompletedOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} onGoContact={handleGoContact} />;
  }

  // Terms
  if (!hasAcceptedTerms) {
    return <TermsGate onAccept={handleAcceptTerms} />;
  }

  // Swipe onboarding (shown once after profile + terms)
  if (showSwipeOnboarding) {
    return (
      <SwipeOnboarding onDone={() => {
        localStorage.setItem('bento_swipe_done', '1');
        setShowSwipeOnboarding(false);
      }} />
    );
  }

  // Main app
  return (
    <FavoritesProvider>
      <div className="app">
        <MealPlan
          onOpenSettings={() => { setShowSettings(true); setShowFavorites(false); setShowInsights(false); }}
          onOpenFavorites={() => { setShowFavorites(true); setShowSettings(false); setShowInsights(false); }}
          onOpenInsights={() => { setShowInsights(true); setShowSettings(false); setShowFavorites(false); }}
          showInsights={showInsights}
          onCloseInsights={() => setShowInsights(false)}
          onGoHome={() => setShowLanding(true)}
          settingsVersion={settingsVersion}
        />

        {showFavorites && (
          <>
            <div className="settings-overlay" onClick={() => setShowFavorites(false)} />
            <Favorites onClose={() => setShowFavorites(false)} />
          </>
        )}

        {showSettings && (
          <>
            <div className="settings-overlay" onClick={() => setShowSettings(false)} />
            <Settings
              onClose={() => setShowSettings(false)}
              onReset={handleReset}
              onGoContact={handleGoContact}
              onSave={() => {
                setSettingsVersion((v) => v + 1);
                setShowSettings(false);
              }}
            />
          </>
        )}
      </div>
    </FavoritesProvider>
  );
}

export default App;
