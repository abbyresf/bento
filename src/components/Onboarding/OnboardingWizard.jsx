import { useState } from 'react';
import BentoLogo from '../BentoLogo';
import { ACTIVITY_LEVELS, GOALS, calculateNutritionTargets } from '../../utils/tdeeCalculator';
import { setUserProfile, setNutritionTargets, setDietaryRestrictions, setOnboardingComplete } from '../../utils/storage';
import './OnboardingWizard.css';

const STEPS = ['basics', 'activity', 'goals', 'dietary', 'review'];

export default function OnboardingWizard({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [profile, setProfile] = useState({
    weight: '',
    weightUnit: 'lbs',
    heightFeet: '',
    heightInches: '',
    age: '',
    sex: 'male',
    activityLevel: 'moderate',
    goal: 'maintain',
  });
  const [restrictions, setRestrictions] = useState({
    vegetarian: false,
    vegan: false,
    glutenFree: false,
    dairyFree: false,
    nutFree: false,
    halal: false,
    kosher: false,
    allergies: [],
    avoidIngredients: [],
  });
  const [allergyInput, setAllergyInput] = useState('');
  const [avoidInput, setAvoidInput] = useState('');
  const [errors, setErrors] = useState({});

  const validateBasics = () => {
    const newErrors = {};
    if (!profile.weight || profile.weight <= 0) newErrors.weight = 'Enter a valid weight';
    if (!profile.heightFeet || profile.heightFeet < 3 || profile.heightFeet > 8) newErrors.height = 'Enter a valid height';
    if (!profile.age || profile.age < 13 || profile.age > 100) newErrors.age = 'Enter a valid age (13-100)';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (currentStep === 0 && !validateBasics()) return;
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleProfileChange = (field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const handleRestrictionChange = (field) => {
    setRestrictions((prev) => {
      const newRestrictions = { ...prev, [field]: !prev[field] };
      // If vegan, also set vegetarian
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
        allergies: [...prev.allergies, allergyInput.trim()],
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
        avoidIngredients: [...prev.avoidIngredients, avoidInput.trim()],
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

  const calculateTargets = () => {
    const targets = calculateNutritionTargets(profile);
    return targets;
  };

  const handleComplete = () => {
    const targets = calculateTargets();
    setUserProfile(profile);
    setNutritionTargets(targets);
    setDietaryRestrictions(restrictions);
    setOnboardingComplete(true);
    onComplete();
  };

  const renderBasicsStep = () => (
    <div className="step-content">
      <h2>Let's get to know you</h2>
      <p className="step-description">We'll use this to calculate your daily nutrition needs.</p>

      <div className="form-row">
        <div className="form-group">
          <label>Weight</label>
          <div className="input-with-unit">
            <input
              type="number"
              value={profile.weight}
              onChange={(e) => handleProfileChange('weight', parseFloat(e.target.value))}
              placeholder="150"
              className={errors.weight ? 'error' : ''}
            />
            <select
              value={profile.weightUnit}
              onChange={(e) => handleProfileChange('weightUnit', e.target.value)}
            >
              <option value="lbs">lbs</option>
              <option value="kg">kg</option>
            </select>
          </div>
          {errors.weight && <span className="error-text">{errors.weight}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Height</label>
          <div className="height-inputs">
            <div className="input-with-unit">
              <input
                type="number"
                value={profile.heightFeet}
                onChange={(e) => handleProfileChange('heightFeet', parseInt(e.target.value))}
                placeholder="5"
                className={errors.height ? 'error' : ''}
              />
              <span className="unit-label">ft</span>
            </div>
            <div className="input-with-unit">
              <input
                type="number"
                value={profile.heightInches}
                onChange={(e) => handleProfileChange('heightInches', parseInt(e.target.value) || 0)}
                placeholder="8"
              />
              <span className="unit-label">in</span>
            </div>
          </div>
          {errors.height && <span className="error-text">{errors.height}</span>}
        </div>
      </div>

      <div className="form-row two-col">
        <div className="form-group">
          <label>Age</label>
          <input
            type="number"
            value={profile.age}
            onChange={(e) => handleProfileChange('age', parseInt(e.target.value))}
            placeholder="20"
            className={errors.age ? 'error' : ''}
          />
          {errors.age && <span className="error-text">{errors.age}</span>}
        </div>
        <div className="form-group">
          <label>Biological Sex</label>
          <select
            value={profile.sex}
            onChange={(e) => handleProfileChange('sex', e.target.value)}
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderActivityStep = () => (
    <div className="step-content">
      <h2>How active are you?</h2>
      <p className="step-description">This helps us estimate how many calories you burn daily.</p>

      <div className="activity-options">
        {Object.entries(ACTIVITY_LEVELS).map(([key, value]) => (
          <label
            key={key}
            className={`activity-option ${profile.activityLevel === key ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="activity"
              value={key}
              checked={profile.activityLevel === key}
              onChange={(e) => handleProfileChange('activityLevel', e.target.value)}
            />
            <div className="activity-content">
              <span className="activity-label">{value.label}</span>
              <span className="activity-description">{value.description}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );

  const renderGoalsStep = () => (
    <div className="step-content">
      <h2>What's your goal?</h2>
      <p className="step-description">We'll adjust your calorie target accordingly.</p>

      <div className="goal-options">
        {Object.entries(GOALS).map(([key, value]) => (
          <label
            key={key}
            className={`goal-option ${profile.goal === key ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="goal"
              value={key}
              checked={profile.goal === key}
              onChange={(e) => handleProfileChange('goal', e.target.value)}
            />
            <div className="goal-content">
              <span className="goal-label">{value.label}</span>
              <span className="goal-description">{value.description}</span>
              <span className="goal-adjustment">
                {value.adjustment > 0 ? '+' : ''}{value.adjustment} cal/day
              </span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );

  const renderDietaryStep = () => (
    <div className="step-content">
      <h2>Dietary Preferences</h2>
      <p className="step-description">Select any dietary restrictions or preferences.</p>

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
              onChange={() => handleRestrictionChange(key)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <div className="custom-restrictions">
        <div className="restriction-section">
          <h3>Allergies (will never recommend)</h3>
          <div className="tag-input">
            <input
              type="text"
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              placeholder="e.g., shellfish, soy"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAllergy())}
            />
            <button type="button" onClick={addAllergy}>Add</button>
          </div>
          <div className="tags">
            {restrictions.allergies.map((allergy, i) => (
              <span key={i} className="tag allergy">
                {allergy}
                <button type="button" onClick={() => removeAllergy(i)}>&times;</button>
              </span>
            ))}
          </div>
        </div>

        <div className="restriction-section">
          <h3>Prefer to Avoid (will deprioritize)</h3>
          <div className="tag-input">
            <input
              type="text"
              value={avoidInput}
              onChange={(e) => setAvoidInput(e.target.value)}
              placeholder="e.g., red meat, sugar"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAvoid())}
            />
            <button type="button" onClick={addAvoid}>Add</button>
          </div>
          <div className="tags">
            {restrictions.avoidIngredients.map((item, i) => (
              <span key={i} className="tag avoid">
                {item}
                <button type="button" onClick={() => removeAvoid(i)}>&times;</button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderReviewStep = () => {
    const targets = calculateTargets();

    return (
      <div className="step-content">
        <h2>Your Personalized Plan</h2>
        <p className="step-description">Here's what we calculated based on your inputs.</p>

        <div className="review-summary">
          <div className="summary-card">
            <h3>Daily Targets</h3>
            <div className="target-grid">
              <div className="target-item">
                <span className="target-value">{targets.calories}</span>
                <span className="target-label">Calories</span>
              </div>
              <div className="target-item">
                <span className="target-value">{targets.macros.protein}g</span>
                <span className="target-label">Protein</span>
              </div>
              <div className="target-item">
                <span className="target-value">{targets.macros.carbs}g</span>
                <span className="target-label">Carbs</span>
              </div>
              <div className="target-item">
                <span className="target-value">{targets.macros.fat}g</span>
                <span className="target-label">Fat</span>
              </div>
            </div>
          </div>

          <div className="summary-card">
            <h3>Your Profile</h3>
            <ul className="profile-list">
              <li>
                <strong>TDEE:</strong> {targets.tdee} cal/day
              </li>
              <li>
                <strong>Goal:</strong> {GOALS[profile.goal].label}
              </li>
              <li>
                <strong>Activity:</strong> {ACTIVITY_LEVELS[profile.activityLevel].label}
              </li>
            </ul>
          </div>

          {(restrictions.vegetarian ||
            restrictions.vegan ||
            restrictions.glutenFree ||
            restrictions.allergies.length > 0) && (
            <div className="summary-card">
              <h3>Dietary Restrictions</h3>
              <div className="restriction-summary">
                {restrictions.vegetarian && <span className="tag">Vegetarian</span>}
                {restrictions.vegan && <span className="tag">Vegan</span>}
                {restrictions.glutenFree && <span className="tag">Gluten-Free</span>}
                {restrictions.dairyFree && <span className="tag">Dairy-Free</span>}
                {restrictions.nutFree && <span className="tag">Nut-Free</span>}
                {restrictions.halal && <span className="tag">Halal</span>}
                {restrictions.kosher && <span className="tag">Kosher</span>}
                {restrictions.allergies.map((a, i) => (
                  <span key={i} className="tag allergy">{a}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="review-note">
          You can adjust these settings anytime in the Settings menu.
        </p>
      </div>
    );
  };

  const renderStep = () => {
    switch (STEPS[currentStep]) {
      case 'basics':
        return renderBasicsStep();
      case 'activity':
        return renderActivityStep();
      case 'goals':
        return renderGoalsStep();
      case 'dietary':
        return renderDietaryStep();
      case 'review':
        return renderReviewStep();
      default:
        return null;
    }
  };

  return (
    <div className="onboarding-wizard">
      <div className="wizard-header">
        <div className="wizard-logo">
          <BentoLogo size={64} />
        </div>
        <h1>Bento</h1>
        <p className="subtitle">Eat well. Every meal.</p>
      </div>

      <div className="progress-bar">
        {STEPS.map((step, index) => (
          <div
            key={step}
            className={`progress-step ${index <= currentStep ? 'active' : ''} ${
              index < currentStep ? 'completed' : ''
            }`}
          />
        ))}
      </div>

      <form onSubmit={(e) => e.preventDefault()}>
        {renderStep()}

        <div className="wizard-actions">
          {currentStep > 0 && (
            <button type="button" className="btn-secondary" onClick={handleBack}>
              Back
            </button>
          )}
          {currentStep < STEPS.length - 1 ? (
            <button type="button" className="btn-primary" onClick={handleNext}>
              Continue
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={handleComplete}>
              Get Started
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
