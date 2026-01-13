import { useState, useEffect } from 'react';
import { isOnboardingComplete, setOnboardingComplete } from './utils/storage';
import OnboardingWizard from './components/Onboarding/OnboardingWizard';
import MealPlan from './components/MealPlan/MealPlan';
import Settings from './components/Settings/Settings';
import './App.css';

function App() {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    setHasCompletedOnboarding(isOnboardingComplete());
  }, []);

  const handleOnboardingComplete = () => {
    setHasCompletedOnboarding(true);
  };

  const handleReset = () => {
    setOnboardingComplete(false);
    setHasCompletedOnboarding(false);
    setShowSettings(false);
  };

  // Loading state
  if (hasCompletedOnboarding === null) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
      </div>
    );
  }

  // Show onboarding if not completed
  if (!hasCompletedOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} />;
  }

  // Main app
  return (
    <div className="app">
      <MealPlan onOpenSettings={() => setShowSettings(true)} />

      {showSettings && (
        <>
          <div className="settings-overlay" onClick={() => setShowSettings(false)} />
          <Settings onClose={() => setShowSettings(false)} onReset={handleReset} />
        </>
      )}
    </div>
  );
}

export default App;
