import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { isOnboardingComplete, isTermsAccepted, setTermsAccepted, signOut } from './lib/db';
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
  const [session, setSession] = useState(undefined); // undefined = loading
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(null);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showLanding, setShowLanding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
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
    setShowAuth(false);
    setShowLanding(false);
    setSession(null);
  };

  // Waiting for auth to resolve
  if (session === undefined) {
    return <div className="app-loading"><div className="spinner"></div></div>;
  }

  // Not logged in: show landing page by default, auth screen when they click Get Started
  if (!session) {
    if (showAuth) {
      return <AuthScreen onAuth={() => {}} />;
    }
    return <LandingPage onGetStarted={() => setShowAuth(true)} />;
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
