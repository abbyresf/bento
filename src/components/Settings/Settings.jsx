import { useState, useEffect } from 'react';
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
import './Settings.css';

export default function Settings({ onClose, onReset, onSave, onGoContact, tabMode = false }) {
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

  useEffect(() => {
    async function load() {
      const [loadedProfile, loadedTargets, loadedRestrictions] = await Promise.all([
        getUserProfile(),
        getNutritionTargets(),
        getDietaryRestrictions(),
      ]);
      setProfile(loadedProfile);
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
    } catch (e) {
      setActionError('Failed to clear meal history. Please try again.');
    }
  };

  const handleResetAll = async () => {
    if (confirming !== 'reset') { setConfirming('reset'); return; }
    setConfirming(null);
    setActionError(null);
    try {
      await clearAllData();
      onReset();
    } catch (e) {
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
    } catch (e) {
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
      <div className="settings-header">
        <h2>Settings</h2>
        <button className="close-btn" onClick={onClose}>&times;</button>
      </div>

      <div className="settings-content">
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
            <div className="setting-item">
              <label>Goal</label>
              <select
                value={profile.goal}
                onChange={(e) => handleProfileChange('goal', e.target.value)}
              >
                {Object.entries(GOALS).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn-secondary" onClick={handleRecalculate}>
            Recalculate Targets
          </button>
        </section>

        {/* Nutrition Targets Section */}
        <section className="settings-section">
          <h3>Daily Nutrition Targets</h3>
          <p className="section-note">Calculated values can be manually overridden.</p>
          <div className="settings-grid">
            <div className="setting-item">
              <label>Calories</label>
              <input
                type="number"
                value={customCalories}
                onChange={(e) => setCustomCalories(e.target.value)}
              />
            </div>
            <div className="setting-item">
              <label>Protein (g)</label>
              <input
                type="number"
                value={customProtein}
                onChange={(e) => setCustomProtein(e.target.value)}
              />
            </div>
            <div className="setting-item">
              <label>Carbs (g)</label>
              <input
                type="number"
                value={customCarbs}
                onChange={(e) => setCustomCarbs(e.target.value)}
              />
            </div>
            <div className="setting-item">
              <label>Fat (g)</label>
              <input
                type="number"
                value={customFat}
                onChange={(e) => setCustomFat(e.target.value)}
              />
            </div>
          </div>
        </section>

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
                ⚠ Your dining hall may not label halal items — always confirm with dining staff.
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
            <a href="#" className="allergen-contact-link" onClick={(e) => { e.preventDefault(); onGoContact?.(); }}>Contact us</a>
          </p>
        </section>

        {/* Data Management Section */}
        <section className="settings-section">
          <h3>Data Management</h3>
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
      </div>

      <div className="settings-footer">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={handleSave}>
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
