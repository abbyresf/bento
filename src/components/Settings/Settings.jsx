import { useState, useEffect, useRef } from 'react';
import {
  getUserProfile,
  setUserProfile,
  getNutritionTargets,
  setNutritionTargets,
  getDietaryRestrictions,
  setDietaryRestrictions,
  clearMealHistory,
  clearAllData,
  deleteAccount,
} from '../../lib/db';
import { calculateNutritionTargets, ACTIVITY_LEVELS, GOALS } from '../../utils/tdeeCalculator';
import UniversityPicker from '../common/UniversityPicker';
import { useNutritionDisplay } from '../../context/NutritionDisplayContext';
import { Capacitor } from '@capacitor/core';
import { pushSupport, subscribeToPush, unsubscribeFromPush, getPushEnabled, detachPushFromThisDevice } from '../../lib/push';

const isNative = Capacitor.isNativePlatform();
import ThemePreview from './ThemePreview';
import FriendsSection from '../Friends/FriendsSection';
import StudySection from '../Research/StudySection';
import { useStudyStatus } from '../../lib/useStudyStatus';
import { DELETE_NOTE } from '../../data/research';
import { useSkipBreakfast, setSkipBreakfast } from '../../lib/mealPrefs';
import { useAthlete, useAthleteAvailable, loadAthlete } from '../../lib/athlete';
import AthleteSection from './AthleteSection';
import './Settings.css';

/* Settings opens on a menu of sections. Tap one to open it, and Back returns to the
 * menu. Profile and Food are the two with a Save button, because they edit a form.
 * Everything else saves the moment you change it. Research is iOS only and is
 * listed only once the study is available (see StudySection). */
const SETTINGS_PAGES = [
  { id: 'profile',   label: 'Profile',   hint: 'Body stats, goals and daily targets' },
  { id: 'food',      label: 'Food',      hint: 'Dietary restrictions and meals' },
  { id: 'athlete',   label: 'Athlete',   hint: 'Targets that follow your training' },
  { id: 'reminders', label: 'Reminders', hint: 'Meal reminders and buddy alerts' },
  { id: 'study',     label: 'Research',  hint: 'Join or leave a study' },
  { id: 'display',   label: 'Display',   hint: 'Appearance and nutrition numbers' },
  { id: 'account',   label: 'Account',   hint: 'Sign out and your data' },
];
const FORM_PAGES = ['profile', 'food'];
const PAGE_KEY = 'bento_settings_page';

// Settings always opens on the menu. The one exception is coming back from the
// Contact page, which closes Settings on the way out: the page is saved just
// before leaving and read once, here, so Back lands where the student was.
function takeSavedPage() {
  try {
    const id = sessionStorage.getItem(PAGE_KEY);
    sessionStorage.removeItem(PAGE_KEY);
    return id || null;
  } catch { return null; }
}
function savePage(id) {
  try { if (id) sessionStorage.setItem(PAGE_KEY, id); } catch { /* the page just is not remembered */ }
}

export default function Settings({ onClose, onReset, onSave, onGoContact, onOpenFriends, tabMode = false }) {
  const display = useNutritionDisplay();
  const skipBreakfast = useSkipBreakfast();
  // One status for the whole screen. On the web and Android the study does not
  // exist: status is 'unavailable' and no request is made.
  const studyState = useStudyStatus();
  const { study, status: studyStatus } = studyState;
  // Athlete is listed only once migration 064 exists.
  const athleteAvailable = useAthleteAvailable();
  const { athleteMode } = useAthlete();
  const pages = SETTINGS_PAGES.filter((p) => (p.id !== 'study' || studyStatus === 'ok') && (p.id !== 'athlete' || athleteAvailable));
  // null is the menu. A saved page that is not available (yet) shows the menu.
  const [pageId, setPageId] = useState(takeSavedPage);
  const current = pages.find((p) => p.id === pageId) ?? null;
  const page = current?.id ?? null;
  const contentRef = useRef(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState(null);
  const [profile, setProfile] = useState(null);
  const [targets, setTargets] = useState(null);
  const [restrictions, setRestrictions] = useState(null);
  const [customCalories, setCustomCalories] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFat, setCustomFat] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(null); // 'history' | 'reset' | 'delete'
  const [actionError, setActionError] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    async function load() {
      const [loadedProfile, loadedTargets, loadedRestrictions] = await Promise.all([
        getUserProfile(),
        getNutritionTargets(),
        getDietaryRestrictions(),
      ]);
      setProfile(loadedProfile);
      getPushEnabled().then(setPushOn).catch(() => {});
      setTargets(loadedTargets);
      setRestrictions(loadedRestrictions);
      if (loadedTargets) {
        setCustomCalories(loadedTargets.calories.toString());
        setCustomProtein(loadedTargets.macros?.protein?.toString() ?? loadedTargets.protein?.toString() ?? '');
        setCustomCarbs(loadedTargets.macros?.carbs?.toString() ?? loadedTargets.carbs?.toString() ?? '');
        setCustomFat(loadedTargets.macros?.fat?.toString() ?? loadedTargets.fat?.toString() ?? '');
      }
    }
    load();
  }, []);

  const openPage = (id) => {
    setPageId(id);
    contentRef.current?.scrollTo?.(0, 0);
  };

  // The Contact page replaces this screen, so remember where we were.
  const goContact = () => { savePage(page); onGoContact?.(); };

  const handleProfileChange = (field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleRecalculate = () => {
    const newTargets = calculateNutritionTargets(profile);
    setTargets(newTargets);
    setCustomCalories(newTargets.calories.toString());
    setCustomProtein(newTargets.macros.protein.toString());
    setCustomCarbs(newTargets.macros.carbs.toString());
    setCustomFat(newTargets.macros.fat.toString());
  };

  const handleRestrictionToggle = (field) => {
    setRestrictions((prev) => {
      const newRestrictions = { ...prev, [field]: !prev[field] };
      if (field === 'vegan' && !prev.vegan) {
        newRestrictions.vegetarian = true;
      }
      return newRestrictions;
    });
  };

  const handleSave = async () => {
    const updatedTargets = {
      calories: parseInt(customCalories) || targets.calories,
      macros: {
        protein: parseInt(customProtein) || targets.macros?.protein,
        carbs:   parseInt(customCarbs)   || targets.macros?.carbs,
        fat:     parseInt(customFat)     || targets.macros?.fat,
      },
    };
    await Promise.all([
      setUserProfile(profile),
      setNutritionTargets(updatedTargets),
      setDietaryRestrictions(restrictions),
    ]);
    loadAthlete();   // athlete targets are per kg, so a new weight changes them
    if (onSave) {
      onSave();
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleClearHistory = async () => {
    if (confirming !== 'history') { setConfirming('history'); return; }
    setConfirming(null);
    setActionError(null);
    try {
      await clearMealHistory();
    } catch {
      setActionError('Failed to clear meal history. Please try again.');
    }
  };

  // Plain sign out. Nothing is deleted: the account, plate history and settings
  // stay saved and come back at the next sign in. onReset (App's handleReset)
  // ends the session, clears the in-memory state and returns to sign in.
  const handleSignOut = async () => {
    setSigningOut(true);
    setActionError(null);
    try {
      await detachPushFromThisDevice();
      await onReset();
    } catch {
      setActionError('Could not sign out. Please try again.');
      setSigningOut(false);
    }
  };

  const handleResetAll = async () => {
    if (confirming !== 'reset') { setConfirming('reset'); return; }
    setConfirming(null);
    setActionError(null);
    try {
      await detachPushFromThisDevice();
      await clearAllData();
      onReset();
    } catch {
      setActionError('Failed to reset data. Please try again.');
    }
  };

  const handleDeleteAccount = async () => {
    if (confirming !== 'delete') { setConfirming('delete'); return; }
    setConfirming(null);
    setActionError(null);
    try {
      await deleteAccount();
      onReset();
    } catch {
      setActionError('Failed to delete account. Please try again.');
    }
  };

  if (!profile || !targets || !restrictions) {
    return (
      <div className={`settings${tabMode ? ' settings-page' : ''}`}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className={`settings${tabMode ? ' settings-page' : ''}`}>
      <div className={`settings-header${current ? ' is-detail' : ''}`}>
        {current && (
          <button type="button" className="settings-back" onClick={() => openPage(null)} aria-label="Back to Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span>Settings</span>
          </button>
        )}
        <h2>{current ? current.label : 'Settings'}</h2>
        <button className="close-btn" onClick={onClose} aria-label="Close settings">&times;</button>
      </div>

      <div className="settings-content" ref={contentRef}>
        {page === null && (
          <nav aria-label="Settings sections">
            <ul className="settings-menu">
              {pages.map((p) => (
                <li key={p.id}>
                  <button type="button" className="settings-menu-row" onClick={() => openPage(p.id)}>
                    <span className="settings-menu-text">
                      <span className="settings-menu-label">{p.label}</span>
                      <span className="settings-menu-hint">{p.hint}</span>
                    </span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {page === 'profile' && (<>
        {/* Profile Section */}
        <section className="settings-section">
          <h3>Profile</h3>
          <div className="settings-grid">
            <div className="setting-item setting-item-full">
              <label>University</label>
              <UniversityPicker
                value={profile.university ?? 'brandeis'}
                onChange={(id) => handleProfileChange('university', id)}
                searchOnly
              />
            </div>
            <div className="setting-item">
              <label>Weight ({profile.weightUnit})</label>
              <input
                type="number"
                value={profile.weight}
                onChange={(e) => handleProfileChange('weight', parseFloat(e.target.value))}
              />
            </div>
            <div className="setting-item setting-item-full">
              <label>Height</label>
              <div className="setting-height-row">
                <input
                  type="number"
                  value={profile.heightFeet ?? ''}
                  onChange={(e) => handleProfileChange('heightFeet', parseInt(e.target.value))}
                  min="3" max="8"
                  placeholder="ft"
                />
                <input
                  type="number"
                  value={profile.heightInches ?? ''}
                  onChange={(e) => handleProfileChange('heightInches', parseInt(e.target.value) || 0)}
                  min="0" max="11"
                  placeholder="in"
                />
              </div>
            </div>
            <div className="setting-item">
              <label>Age</label>
              <input
                type="number"
                value={profile.age}
                onChange={(e) => handleProfileChange('age', parseInt(e.target.value))}
              />
            </div>
            <div className="setting-item">
              <label>Activity Level</label>
              <select
                value={profile.activityLevel}
                onChange={(e) => handleProfileChange('activityLevel', e.target.value)}
              >
                {Object.entries(ACTIVITY_LEVELS).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </div>
            {!athleteMode && <div className="setting-item">
              <label>Goal</label>
              <select
                value={profile.goal}
                onChange={(e) => handleProfileChange('goal', e.target.value)}
              >
                {Object.entries(GOALS).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </div>}
          </div>
          <button className="btn-secondary" onClick={handleRecalculate}>
            Recalculate Targets
          </button>
        </section>

        {/* Nutrition Targets Section */}
        {/* A targets panel is a calorie counter by another name, so it follows
            the same preference. Hidden metrics keep their stored values; they
            are simply not shown or edited here. */}
        {display.anyVisible && (
        <section className="settings-section">
          <h3>Daily Nutrition Targets</h3>
          <p className="section-note">
            {athleteMode
              ? 'Athlete mode is on, so your plan uses your Athlete targets. These come back when you turn it off.'
              : 'Calculated values can be manually overridden.'}
          </p>
          <div className="settings-grid">
            {display.calories && (
              <div className="setting-item">
                <label>Calories</label>
                <input
                  type="number"
                  value={customCalories}
                  onChange={(e) => setCustomCalories(e.target.value)}
                />
              </div>
            )}
            {display.protein && (
              <div className="setting-item">
                <label>Protein (g)</label>
                <input
                  type="number"
                  value={customProtein}
                  onChange={(e) => setCustomProtein(e.target.value)}
                />
              </div>
            )}
            {display.carbs && (
              <div className="setting-item">
                <label>Carbs (g)</label>
                <input
                  type="number"
                  value={customCarbs}
                  onChange={(e) => setCustomCarbs(e.target.value)}
                />
              </div>
            )}
            {display.fat && (
              <div className="setting-item">
                <label>Fat (g)</label>
                <input
                  type="number"
                  value={customFat}
                  onChange={(e) => setCustomFat(e.target.value)}
                />
              </div>
            )}
          </div>
        </section>
        )}
        </>)}

        {page === 'athlete' && <AthleteSection onGoProfile={() => openPage('profile')} />}

        {page === 'food' && (<>
        {/* Dietary Restrictions Section */}
        <section className="settings-section">
          <h3>Dietary Restrictions</h3>
          <div className="restriction-section">
            <h4>Dietary Preferences</h4>
            <div className="dietary-toggles">
              {[
                { key: 'vegetarian', label: 'Vegetarian' },
                { key: 'vegan', label: 'Vegan' },
                { key: 'glutenFree', label: 'Gluten-Free' },
                { key: 'halal', label: 'Halal' },
                { key: 'kosher', label: 'Kosher' },
              ].map(({ key, label }) => (
                <label key={key} className={`dietary-toggle ${restrictions[key] ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={restrictions[key]}
                    onChange={() => handleRestrictionToggle(key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {restrictions.halal && (
              <p className="dietary-unlabeled-notice">
                ⚠ Your dining hall may not label halal items. Always confirm with dining staff.
              </p>
            )}
          </div>

          <div className="restriction-section">
            <h4>Allergens to Avoid</h4>
            <p className="allergen-section-desc">Items containing these allergens will never be recommended.</p>
            <div className="allergen-grid">
              {[
                { key: 'milk',      label: 'Milk' },
                { key: 'eggs',      label: 'Eggs' },
                { key: 'wheat',     label: 'Wheat' },
                { key: 'soy',       label: 'Soy' },
                { key: 'fish',      label: 'Fish' },
                { key: 'shellfish', label: 'Shellfish' },
                { key: 'treeNuts',  label: 'Tree Nuts' },
                { key: 'peanuts',   label: 'Peanuts' },
                { key: 'sesame',    label: 'Sesame' },
              ].map(({ key, label }) => (
                <label key={key} className={`allergen-toggle ${restrictions[key] ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={restrictions[key]}
                    onChange={() => handleRestrictionToggle(key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <p className="allergen-contact-note">
            Is your allergen not listed?{' '}
            <a href="#" className="allergen-contact-link" onClick={(e) => { e.preventDefault(); goContact(); }}>Contact us</a>
          </p>
        </section>

        {/* Data Management Section */}
        <section className="settings-section">
          <h3>Meals</h3>
          <p className="section-note">
            Bento plans breakfast, lunch and dinner. If you never eat breakfast at the dining hall, turn it off and Bento plans
            two larger meals instead. A day you eat dinner somewhere else, switch it off on that day's dinner card.
          </p>
          <div className="dietary-toggles">
            <label className={`dietary-toggle ${skipBreakfast ? 'active' : ''}`}>
              <input type="checkbox" checked={skipBreakfast} onChange={() => setSkipBreakfast(!skipBreakfast)} />
              <span>I skip breakfast at the dining hall</span>
            </label>
          </div>
        </section>

        </>)}

        {page === 'reminders' && (<>
        <section className="settings-section">
          <h3>Meal Reminders</h3>
          <p className="section-note">
            Two a day, at lunch and at dinner. Your plate is already sorted,
            you just have to show up. Turn them off whenever.
          </p>
          {(() => {
            const support = pushSupport();
            if (!support.ok && !pushOn) {
              // Each reason needs a different response from the student, so
              // they are spelled out rather than collapsed into one error.
              const messages = {
                'needs-install': 'Add Bento to your home screen first. iPhone only delivers notifications to installed apps, not Safari tabs.',
                'blocked': 'Notifications are blocked for Bento in your browser settings. You\'ll need to re-allow them there before turning this on.',
                'unsupported': 'This browser doesn\'t support notifications.',
                // Reached only when the app is running a build made before the
                // VAPID key was configured, because that key is baked in at
                // build time. The old copy ("not available yet") described it as
                // a feature still to come, so students waited for something that
                // had already shipped instead of updating. Say what to do.
                'not-configured': 'This copy of Bento is out of date. Close it completely and reopen it, or remove it from your home screen and add it again.',
              };
              return <p className="section-note push-unavailable">{messages[support.reason]}</p>;
            }
            return (
              <>
                <label className={`dietary-toggle ${pushOn ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={pushOn}
                    disabled={pushBusy}
                    onChange={async () => {
                      setPushBusy(true);
                      setPushNote(null);
                      if (pushOn) {
                        await unsubscribeFromPush();
                        setPushOn(false);
                      } else {
                        const r = await subscribeToPush();
                        if (r.ok) setPushOn(true);
                        else setPushNote(
                          r.reason === 'blocked'
                            ? (isNative
                                ? 'Notifications are off for Bento. Turn them on in Settings, then Notifications, then Bento.'
                                : 'Your browser blocked the request. Re-allow notifications for Bento in its settings.')
                            : r.reason === 'dismissed'
                              ? 'No problem. You can turn this on any time.'
                              : 'Something went wrong. Try again in a moment.'
                        );
                      }
                      setPushBusy(false);
                    }}
                  />
                  <span>{pushBusy ? 'Just a moment…' : 'Turn on notifications'}</span>
                </label>
                {pushNote && <p className="section-note push-note">{pushNote}</p>}
              </>
            );
          })()}
        </section>

        <FriendsSection remindersOn={pushOn} onOpenFriends={onOpenFriends} />
        </>)}

        {page === 'study' && (
          <StudySection state={studyState} onGoContact={goContact} />
        )}

        {page === 'display' && (<>
        <section className="settings-section">
          <h3>Appearance</h3>
          <p className="section-note">
            System follows your phone, so Bento turns dark when everything else
            does. Pick Light or Dark to override it.
          </p>
          <ThemePreview />
        </section>

        <section className="settings-section">
          <h3>Nutrition Numbers</h3>
          <p className="section-note">
            Choose what Bento shows you. Anything turned off is hidden from your
            daily progress and from every menu item. Your meals are still built
            the same way, so this only changes what you see.
          </p>
          <div className="dietary-toggles">
            {[['calories', 'Calories'], ['protein', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fat']].map(([key, label]) => (
              <label key={key} className={`dietary-toggle ${display[key] ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={display[key]}
                  onChange={() => display.updateDisplay({
                    calories: display.calories, protein: display.protein,
                    carbs: display.carbs, fat: display.fat,
                    [key]: !display[key],
                  })}
                />
                <span>Show {label.toLowerCase()}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="hide-all-numbers-btn"
            onClick={() => display.updateDisplay(
              display.anyVisible
                ? { calories: false, protein: false, carbs: false, fat: false }
                : { calories: true, protein: true, carbs: true, fat: true }
            )}
          >
            {display.anyVisible ? 'Hide all numbers' : 'Show all numbers'}
          </button>
        </section>

        </>)}

        {page === 'account' && (<>
        <section className="settings-section">
          <h3>Account</h3>
          <p className="section-note">
            Signing out keeps your plate history and settings. They are here
            when you sign back in.
          </p>
          <button
            className="btn-secondary"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </section>

        <section className="settings-section">
          <h3>Data Management</h3>
          {study.enrolled && <p className="section-note">{DELETE_NOTE}</p>}
          {actionError && <p className="settings-action-error">{actionError}</p>}
          <div className="data-actions">

            <div className="data-action-row">
              <button
                className={confirming === 'history' ? 'btn-danger' : 'btn-warning'}
                onClick={handleClearHistory}
              >
                {confirming === 'history' ? 'Tap again to confirm' : 'Clear Meal History'}
              </button>
              {confirming === 'history' && (
                <button className="btn-secondary" onClick={() => setConfirming(null)}>Cancel</button>
              )}
            </div>

            <div className="data-action-row">
              <button
                className="btn-danger"
                onClick={handleResetAll}
              >
                {confirming === 'reset' ? 'Tap again to confirm' : 'Reset All Data'}
              </button>
              {confirming === 'reset' && (
                <button className="btn-secondary" onClick={() => setConfirming(null)}>Cancel</button>
              )}
            </div>

            <div className="data-action-row">
              <button
                className="btn-danger"
                onClick={handleDeleteAccount}
              >
                {confirming === 'delete' ? 'Tap again to confirm' : 'Delete Account'}
              </button>
              {confirming === 'delete' && (
                <button className="btn-secondary" onClick={() => setConfirming(null)}>Cancel</button>
              )}
            </div>

          </div>
        </section>
        </>)}
      </div>

      {FORM_PAGES.includes(page) && (
        <div className="settings-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}
