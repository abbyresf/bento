import { useState, useEffect } from 'react';
import { isOnboardingComplete, setOnboardingComplete, isTermsAccepted, setTermsAccepted, clearAllData } from './utils/storage';
import LandingPage from './components/Landing/LandingPage';
import OnboardingWizard from './components/Onboarding/OnboardingWizard';
import MealPlan from './components/MealPlan/MealPlan';
import Settings from './components/Settings/Settings';
import Favorites from './components/Favorites/Favorites';
import TermsGate from './components/Terms/TermsGate';
import TermsPage from './components/Terms/TermsPage';
import TabBar from './components/TabBar/TabBar';
import { FavoritesProvider } from './context/FavoritesContext';
import './App.css';

function App() {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(null);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(null);
  const [startingOnboarding, setStartingOnboarding] = useState(false);
  const [activeTab, setActiveTab] = useState('today');
  const [showSettings, setShowSettings] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
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

  // Step 1: Landing page (new users who haven't started onboarding)
  if (!hasCompletedOnboarding && !startingOnboarding) {
    return <LandingPage onGetStarted={() => setStartingOnboarding(true)} />;
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
        {activeTab === 'today' && (
          <MealPlan
            onOpenSettings={() => setShowSettings(true)}
            onOpenFavorites={() => setShowFavorites(true)}
            settingsVersion={settingsVersion}
          />
        )}

        {activeTab === 'terms' && <TermsPage />}

        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

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
