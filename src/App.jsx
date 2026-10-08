import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { flushPendingConfirms, isOnboardingComplete, isTermsAccepted, setTermsAccepted, signOut, updatePassword, recordInstallState, getActiveSurvey, clearAccountLocalData } from './lib/db';
import { readQueue, withTimeout } from './lib/pendingConfirms';
import AuthScreen from './components/Auth/AuthScreen';
import LandingPage from './components/Landing/LandingPage';
import LandingContact from './components/Landing/LandingContact';
import LandingRequestSchool from './components/Landing/LandingRequestSchool';
import { Capacitor } from '@capacitor/core';
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
import { NutritionDisplayProvider } from './context/NutritionDisplayContext';
import NotifPrompt from './components/Notifications/NotifPrompt';
import SurveyPopup from './components/Survey/SurveyPopup';
import SplashScreen from './components/Splash/SplashScreen';
import UpdatePrompt from './components/common/UpdatePrompt';
import { syncNativePushToken } from './lib/push';
import { loadOutfit, resetOutfit } from './lib/mascotOutfit';
import { loadMascotColor, resetMascotColor } from './lib/mascotColor';
import { initJoinLinks, peekJoinCode, forgetJoinCode } from './lib/joinLink';
import { resetFriends } from './lib/friendsStore';
import { revokeBuddyWidget } from './lib/widget';
import JoinSheet from './components/Friends/JoinSheet';
import FriendsTab from './components/Friends/FriendsTab';
import './App.css';
import BentoLogo from './components/common/BentoLogo';

function isStandalone() {
  // The native app is installed by definition. Without this it looked like a
  // browser tab and offered "Add Bento to your home screen" inside the app, and
  // reported itself as not installed.
  return Capacitor.isNativePlatform()
    || window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function devicePlatform() {
  if (isIOS()) return 'ios';
  if (/Android/i.test(navigator.userAgent)) return 'android';
  if (/Mobi/i.test(navigator.userAgent)) return 'other';
  return 'desktop';
}

/* The onboarding and terms answers last read for this account on this device,
 * used only when a later read fails (see the effect that calls these). Stored
 * under a bento_ key so sign out clears it. */
function readGates(userId) {
  try {
    const g = JSON.parse(localStorage.getItem('bento_gates_v1') || 'null');
    return g && g.userId === userId ? g : {};
  } catch { return {}; }
}
function writeGates(userId, patch) {
  try {
    localStorage.setItem('bento_gates_v1', JSON.stringify({ ...readGates(userId), ...patch, userId }));
  } catch { /* storage unavailable */ }
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // All hooks must be called unconditionally before any early returns
  const [session, setSession] = useState(undefined);
  // A friend's invite code, kept from the moment a link opened the app until the
  // person is signed in and can answer it.
  const [joinCode, setJoinCode] = useState(() => peekJoinCode());
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(null);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(null);
  const [showLanding, setShowLanding] = useState(false);

  /* The marketing site does not ship inside the app.
   *
   * bentodining.com exists to explain Bento to someone who has never heard of
   * it. Someone holding the app has already been convinced and installed it,
   * so the pitch is dead weight, and an app that opens on a marketing page is
   * also the clearest way to fail App Review guideline 4.2, which rejects apps
   * that are "simply a web site bundled as an app".
   *
   * Native therefore opens on sign-in, then onboarding, then the app. */
  const isNative = Capacitor.isNativePlatform();
  const [landingInitialTab, setLandingInitialTab] = useState('home');
  const [activeTab, setActiveTab] = useState('today');
  // Which tabs have ever been opened. A tab enters this set on first visit and
  // stays mounted afterwards, so only the first visit pays to build it.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(['today']));
  // The survey a student should be shown, or null. Fetched once per app open
  // rather than on a timer: a question that appears while someone is mid-plate
  // is an interruption, not a prompt.
  const [survey, setSurvey] = useState(null);
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
    // The app plays its opening animation on every cold launch, as a native app
    // would. On the web it stays rate-limited to once in three hours, because
    // a page reload is not an app launch.
    if (Capacitor.isNativePlatform()) return true;
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
    // A read that fails (no signal) is "unknown". Unknown falls back to what
    // this account last read successfully on this device, and with nothing
    // stored shows the app: redoing onboarding or the terms because of a dead
    // connection is worse than a student seeing the app a moment early. Left as
    // null the screen would be a spinner for as long as the network is down.
    const uidKey = session.user?.id;
    const last = readGates(uidKey);
    isOnboardingComplete().then((v) => {
      if (v !== null) writeGates(uidKey, { onboarded: v });
      setHasCompletedOnboarding(v ?? last.onboarded ?? true);
    });
    isTermsAccepted().then((v) => {
      if (v !== null) writeGates(uidKey, { terms: v });
      setHasAcceptedTerms(v ?? last.terms ?? true);
    });
    // Whether this is a home-screen install decides whether push can ever
    // reach this student, so it is recorded rather than only detected.
    recordInstallState({ installed: isStandalone(), platform: devicePlatform() })
      .catch(() => {});
  }, [session]);

  // Ask the server whether there is a question for this student. Runs once a
  // session, only for an account that has finished onboarding and accepted
  // terms, and never on the admin or landing routes. Failure is silent: a
  // survey is the least important thing on the screen and must never be the
  // reason the app looks broken.
  useEffect(() => {
    if (!session || !hasCompletedOnboarding || !hasAcceptedTerms) return;

    // ?preview_survey=<format> renders the popup without publishing anything,
    // following the same convention as preview_install above. Otherwise the
    // only way to look at the student side is to spend a university's one
    // survey for the week on a screenshot.
    const preview = new URLSearchParams(location.search).get('preview_survey');
    if (preview) {
      setSurvey({
        id: 'preview',
        question: 'How satisfied are you with dinner options this week?',
        format: preview === 'true' ? 'multiple_choice' : preview,
        options: ['Very satisfied', 'Satisfied', 'Neither', 'Unsatisfied'],
      });
      return;
    }

    let cancelled = false;
    getActiveSurvey()
      .then(s => { if (!cancelled && s) setSurvey(s); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [session, hasCompletedOnboarding, hasAcceptedTerms, location.search]);

  // Native only: refresh this device's APNs token each time a student is signed
  // in. A stale token silently stops reminders. It never prompts for permission.
  useEffect(() => {
    if (session && isNative) syncNativePushToken();
  }, [session, isNative]);

  // Invite links: /join/CODE on the web, and the https link in the app.
  useEffect(() => { initJoinLinks(setJoinCode); }, []);
  useEffect(() => {
    if (location.pathname.startsWith('/join/')) navigate('/app', { replace: true });
  }, [location.pathname, navigate]);

  // The piece Bento is wearing follows the student, so ask for it once signed in.
  useEffect(() => {
    if (session) { loadOutfit(); loadMascotColor(); }
  }, [session]);

  // ── Computed values & handlers ────────────────────────────────────────────────

  // [0-9a-f-]+ was written when the invite token was the row's UUID. Tokens are
  // now 32 random bytes in base64url, which contains upper case, underscore and
  // characters outside hex, so this matched none of them and every invite link
  // fell through to the sign-in page instead of the join page.
  const joinMatch = location.pathname.match(/^\/admin\/join\/([A-Za-z0-9_-]+)$/);
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/signup';
  const isAppRoute  = location.pathname.startsWith('/app');

  const handleOnboardingComplete = () => {
    setHasCompletedOnboarding(true);
    writeGates(session?.user?.id, { onboarded: true });
  };

  const handleAcceptTerms = async () => {
    await setTermsAccepted();
    setHasAcceptedTerms(true);
    writeGates(session?.user?.id, { terms: true });
  };

  const handleReset = async () => {
    // Signing out clears what is stored on this phone, including any meal that
    // was confirmed with no signal and has not been sent. If there is signal,
    // send them first, but never let that hold up signing out for long.
    if (readQueue().length > 0 && navigator.onLine !== false) {
      try { await withTimeout(flushPendingConfirms(), 6000); } catch { /* sign out anyway */ }
    }
    // The buddy widget's token is revoked while the session still exists.
    try { await withTimeout(revokeBuddyWidget(), 3000); } catch { /* sign out anyway */ }
    await signOut();
    clearAccountLocalData();
    resetOutfit();
    resetMascotColor();
    resetFriends();
    setJoinCode(null);
    setHasCompletedOnboarding(null);
    setHasAcceptedTerms(null);
    setActiveTab('today');
    // Signing out happens from inside Settings. Leaving this true reopened
    // Settings on top of the next account's first screen.
    setShowSettings(false);
    setVisitedTabs(new Set(['today']));
    setSurvey(null);
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
  if (location.pathname === '/preview') {
    // Web-only: a way to see the marketing page while signed in. In the app
    // there is no marketing page to preview.
    if (isNative) return <Navigate to="/login" replace />;
    return <LandingPage onGetStarted={() => navigate('/login')} />;
  }

  // Public pages with their own addresses. The App Store and Play Store each
  // require a privacy policy URL and a support URL, and both used to be tabs
  // inside the landing page, which a link cannot point at. They work signed in
  // or out. Web only: the app has no marketing site to open.
  if (location.pathname === '/privacy' || location.pathname === '/support') {
    if (isNative) return <Navigate to="/login" replace />;
    return (
      <LandingPage
        key={location.pathname}
        onGetStarted={() => navigate('/login')}
        initialTab={location.pathname === '/privacy' ? 'privacy' : 'contact'}
      />
    );
  }

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
    if (isNative) return <Navigate to="/login" replace />;
    return <LandingPage onGetStarted={() => navigate('/login')} />;
  }

  // ── App route (/app) — requires auth ─────────────────────────────────────────

  if (showSplash) {
    return <SplashScreen onDone={() => {
      localStorage.setItem('bento_splash_ts', Date.now().toString());
      setShowSplash(false);
    }} />;
  }

  // Wait for BOTH gates. Terms was missing here, so between the session
  // resolving and the terms read landing, hasAcceptedTerms was null, which the
  // check below read as "not accepted" and flashed the terms screen at someone
  // who had already signed it.
  if (session === undefined ||
      (session && (hasCompletedOnboarding === null || hasAcceptedTerms === null))) {
    return <div className="app-loading"><div className="spinner"></div></div>;
  }

  if (!session) return <Navigate to="/login" replace />;

  if (passwordRecovery) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <BentoLogo className="auth-logo" />
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
    // Support paths, not marketing: the allergen "Contact us" link in
    // onboarding and Settings, and "request your school". On the web they
    // arrive inside LandingPage, which brings its nav and footer with it. In
    // the app that would put the whole marketing site one tap from Settings,
    // so they render on their own behind a back button instead.
    if (isNative) {
      return (
        <div className="native-subpage">
          <button className="native-subpage-back" onClick={() => setShowLanding(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
          {landingInitialTab === 'request' ? <LandingRequestSchool /> : <LandingContact />}
        </div>
      );
    }
    return <LandingPage onGetStarted={() => setShowLanding(false)} initialTab={landingInitialTab} />;
  }

  // Explicitly false, never merely falsy. null means the read failed, and
  // making someone redo onboarding because of a network blip is worse than
  // showing them the app and letting the next read settle it.
  if (hasCompletedOnboarding === false) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} onGoContact={handleGoContact} onRequestSchool={handleGoRequestSchool} />;
  }

  if (hasAcceptedTerms === false) {
    return <TermsGate onAccept={handleAcceptTerms} />;
  }

  return (
    <RatingsProvider>
      <NutritionDisplayProvider>
      <div className="app">
        {/* Outside every gate on purpose: a stale build is worth flagging
            whatever screen someone is on. */}
        <UpdatePrompt />
        {joinCode && (
          <JoinSheet code={joinCode} onClose={() => { forgetJoinCode(); setJoinCode(null); }} />
        )}
        {hasCompletedOnboarding && hasAcceptedTerms && !showTutorial && !showInstallPrompt && <NotifPrompt />}

        {/* Queued behind every other prompt on purpose. A student meeting the
            tutorial, the install prompt, the notification prompt and a survey
            in one session has been asked for four things before seeing a
            menu. This is the one that waits. */}
        {survey && !showTutorial && !showInstallPrompt && (
          <SurveyPopup survey={survey} onDone={() => setSurvey(null)} />
        )}
        {/* Tabs are hidden when inactive, not unmounted.

            Switching away used to destroy the whole screen, so coming back
            re-ran everything: the profile read, the targets, the restrictions,
            the recent-items query, and a full optimizeDay over several hundred
            dishes. Every tap of the nav bar paid for that again, which is why
            moving between Today and Insights felt like a cold start.

            A tab is mounted the first time it is opened and kept from then on,
            so the first visit costs what it always did and later visits cost
            nothing. Settings changes still reach the plate through
            settingsVersion, which re-optimizes in place and never needed the
            remount to work. */}
        <div className="tab-content">
          {visitedTabs.has('today') && (
            <div hidden={activeTab !== 'today'}>
              <MealPlan settingsVersion={settingsVersion} />
            </div>
          )}
          {visitedTabs.has('friends') && (
            <div hidden={activeTab !== 'friends'}>
              <FriendsTab />
            </div>
          )}
          {visitedTabs.has('ratings') && (
            <div hidden={activeTab !== 'ratings'}>
              <MyRatings tabMode />
            </div>
          )}
          {visitedTabs.has('community') && (
            <div hidden={activeTab !== 'community'}>
              <CommunityTab />
            </div>
          )}
          {visitedTabs.has('insights') && (
            <div hidden={activeTab !== 'insights'}>
              <InsightsPanel tabMode onClose={() => setActiveTab('today')} />
            </div>
          )}
        </div>
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => {
            const next = tab === activeTab && tab !== 'today' ? 'today' : tab;
            setVisitedTabs(prev => (prev.has(next) ? prev : new Set(prev).add(next)));
            setActiveTab(next);
          }}
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
            onOpenFriends={() => {
              setShowSettings(false);
              setVisitedTabs((prev) => new Set(prev).add('friends'));
              setActiveTab('friends');
            }}
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
      </NutritionDisplayProvider>
    </RatingsProvider>
  );
}

export default App;
