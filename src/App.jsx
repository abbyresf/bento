import { useState, useEffect } from 'react';
import { isOnboardingComplete, setOnboardingComplete, isTermsAccepted, setTermsAccepted, clearAllData } from './utils/storage';
import LandingPage from './components/Landing/LandingPage';
import OnboardingWizard from './components/Onboarding/OnboardingWizard';
import MealPlan from './components/MealPlan/MealPlan';
import Settings from './components/Settings/Settings';
import Favorites from './components/Favorites/Favorites';
import TermsGate from './components/Terms/TermsGate';
import { FavoritesProvider } from './context/FavoritesContext';
import './App.css';

function App() {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(null);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(null);
  const [startingOnboarding, setStartingOnboarding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showLanding, setShowLanding] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);

  useEffect(() => {
    setHasCompletedOnboarding(isOnboardingComplete());
    setHasAcceptedTerms(isTermsAccepted());
  }, []);

  const handleOnboardingComplete = () => {
    setHasCompletedOnboarding(true);
  };

  const handleAcceptTerms = () => {
    setTermsAccepted();
    setHasAcceptedTerms(true);
  };

  const handleReset = () => {
    clearAllData();
    setHasCompletedOnboarding(false);
    setHasAcceptedTerms(false);
    setStartingOnboarding(false);
    setShowSettings(false);
  };

  // Loading state — wait for both flags to be read from storage
  if (hasCompletedOnboarding === null || hasAcceptedTerms === null) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
      </div>
    );
  }

  // Step 1: Landing page (new users or returning via home button)
  if ((!hasCompletedOnboarding && !startingOnboarding) || showLanding) {
    return <LandingPage onGetStarted={() => { setStartingOnboarding(true); setShowLanding(false); }} />;
  }

  // Step 2: Onboarding wizard
  if (!hasCompletedOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} />;
  }

  // Step 2: Terms acceptance (shown once, after onboarding)
  if (!hasAcceptedTerms) {
    return <TermsGate onAccept={handleAcceptTerms} />;
  }

  // Step 3: Main app
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
