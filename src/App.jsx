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
  const [showSettings, setShowSettings] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
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
    return <LandingPage onGetStarted={() => setShowLanding(false)} />;
  }

  // Onboarding
  if (!hasCompletedOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} />;
  }

  // Terms
  if (!hasAcceptedTerms) {
    return <TermsGate onAccept={handleAcceptTerms} />;
  }

  // Main app
  return (
    <FavoritesProvider>
      <div className="app">
        <MealPlan
          onOpenSettings={() => setShowSettings(true)}
          onOpenFavorites={() => setShowFavorites(true)}
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
