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
} from '../../utils/storage';
import { calculateNutritionTargets, ACTIVITY_LEVELS, GOALS } from '../../utils/tdeeCalculator';
import './Settings.css';

export default function Settings({ onClose, onReset }) {
  const [profile, setProfile] = useState(null);
  const [targets, setTargets] = useState(null);
  const [restrictions, setRestrictions] = useState(null);
  const [customCalories, setCustomCalories] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFat, setCustomFat] = useState('');
  const [allergyInput, setAllergyInput] = useState('');
  const [avoidInput, setAvoidInput] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const loadedProfile = getUserProfile();
    const loadedTargets = getNutritionTargets();
    const loadedRestrictions = getDietaryRestrictions();

    setProfile(loadedProfile);
    setTargets(loadedTargets);
    setRestrictions(loadedRestrictions);

    if (loadedTargets) {
      setCustomCalories(loadedTargets.calories.toString());
      setCustomProtein(loadedTargets.macros.protein.toString());
      setCustomCarbs(loadedTargets.macros.carbs.toString());
      setCustomFat(loadedTargets.macros.fat.toString());
    }
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

  const addAllergy = () => {
    if (allergyInput.trim()) {
      setRestrictions((prev) => ({
        ...prev,
        allergies: [...(prev.allergies || []), allergyInput.trim()],
      }));
      setAllergyInput('');
    }
  };

  const removeAllergy = (index) => {
    setRestrictions((prev) => ({
      ...prev,
      allergies: prev.allergies.filter((_, i) => i !== index),
    }));
  };

  const addAvoid = () => {
    if (avoidInput.trim()) {
      setRestrictions((prev) => ({
        ...prev,
        avoidIngredients: [...(prev.avoidIngredients || []), avoidInput.trim()],
      }));
      setAvoidInput('');
    }
  };

  const removeAvoid = (index) => {
    setRestrictions((prev) => ({
      ...prev,
      avoidIngredients: prev.avoidIngredients.filter((_, i) => i !== index),
    }));
  };

  const handleSave = () => {
    // Update targets with custom values
    const updatedTargets = {
      ...targets,
      calories: parseInt(customCalories) || targets.calories,
      macros: {
        protein: parseInt(customProtein) || targets.macros.protein,
        carbs: parseInt(customCarbs) || targets.macros.carbs,
        fat: parseInt(customFat) || targets.macros.fat,
      },
    };

    setUserProfile(profile);
    setNutritionTargets(updatedTargets);
    setDietaryRestrictions(restrictions);

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearHistory = () => {
    if (window.confirm('Clear your meal history? This will reset variety tracking.')) {
      clearMealHistory();
      alert('Meal history cleared.');
    }
  };

  const handleResetAll = () => {
    if (window.confirm('Reset all data and start over? This cannot be undone.')) {
      clearAllData();
      onReset();
    }
  };

  if (!profile || !targets || !restrictions) {
    return (
      <div className="settings">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <h2>Settings</h2>
        <button className="close-btn" onClick={onClose}>&times;</button>
      </div>

      <div className="settings-content">
        {/* Profile Section */}
        <section className="settings-section">
          <h3>Profile</h3>
          <div className="settings-grid">
            <div className="setting-item">
              <label>Weight ({profile.weightUnit})</label>
              <input
                type="number"
                value={profile.weight}
                onChange={(e) => handleProfileChange('weight', parseFloat(e.target.value))}
              />
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
          <div className="dietary-toggles">
            {[
              { key: 'vegetarian', label: 'Vegetarian' },
              { key: 'vegan', label: 'Vegan' },
              { key: 'glutenFree', label: 'Gluten-Free' },
              { key: 'dairyFree', label: 'Dairy-Free' },
              { key: 'nutFree', label: 'Nut-Free' },
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

          <div className="custom-restrictions">
            <div className="restriction-section">
              <h4>Allergies</h4>
              <div className="tag-input">
                <input
                  type="text"
                  value={allergyInput}
                  onChange={(e) => setAllergyInput(e.target.value)}
                  placeholder="Add allergen..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAllergy())}
                />
                <button type="button" onClick={addAllergy}>Add</button>
              </div>
              <div className="tags">
                {(restrictions.allergies || []).map((allergy, i) => (
                  <span key={i} className="tag allergy">
                    {allergy}
                    <button type="button" onClick={() => removeAllergy(i)}>&times;</button>
                  </span>
                ))}
              </div>
            </div>

            <div className="restriction-section">
              <h4>Prefer to Avoid</h4>
              <div className="tag-input">
                <input
                  type="text"
                  value={avoidInput}
                  onChange={(e) => setAvoidInput(e.target.value)}
                  placeholder="Add ingredient..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAvoid())}
                />
                <button type="button" onClick={addAvoid}>Add</button>
              </div>
              <div className="tags">
                {(restrictions.avoidIngredients || []).map((item, i) => (
                  <span key={i} className="tag avoid">
                    {item}
                    <button type="button" onClick={() => removeAvoid(i)}>&times;</button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Data Management Section */}
        <section className="settings-section">
          <h3>Data Management</h3>
          <div className="data-actions">
            <button className="btn-warning" onClick={handleClearHistory}>
              Clear Meal History
            </button>
            <button className="btn-danger" onClick={handleResetAll}>
              Reset All Data
            </button>
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
