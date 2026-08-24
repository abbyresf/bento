import { useState } from 'react';
import { ACTIVITY_LEVELS, GOALS, calculateNutritionTargets } from '../../utils/tdeeCalculator';
import { setUserProfile, setNutritionTargets, setDietaryRestrictions } from '../../lib/db';
import { UNIVERSITIES } from '../../data/universities';
import UniversityPicker from '../common/UniversityPicker';
import MenuRatingOnboarding from './MenuRatingOnboarding';
import './OnboardingWizard.css';

const STEPS = ['university', 'basics', 'activity', 'goals', 'dietary', 'swipe', 'review'];

const SECTIONS = [
  { label: 'About You',   steps: ['university', 'basics'] },
  { label: 'Your Goals',  steps: ['activity', 'goals'] },
  { label: 'Preferences', steps: ['dietary', 'swipe'] },
];

export default function OnboardingWizard({ onComplete, onGoContact, onRequestSchool }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [profile, setProfile] = useState({
    university: 'brandeis',
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
    halal: false,
    kosher: false,
    // Structured allergens (from Brandeis allergens_list)
    milk: false,
    eggs: false,
    wheat: false,
    soy: false,
    fish: false,
    shellfish: false,
    treeNuts: false,
    peanuts: false,
    sesame: false,
    allergies: [],
    avoidIngredients: [],
  });
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
    if (STEPS[currentStep] === 'basics' && !validateBasics()) return;
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

  const calculateTargets = () => {
    const targets = calculateNutritionTargets(profile);
    return targets;
  };

  const handleComplete = async () => {
    const targets = calculateTargets();
    await Promise.all([
      setUserProfile(profile),
      setNutritionTargets(targets),
      setDietaryRestrictions(restrictions),
    ]);
    onComplete();
  };

  const renderUniversityStep = () => (
    <div className="step-content">
      <h2>Select your university</h2>
      <p className="step-description">Bento pulls your dining hall's live menu each day.</p>
      <UniversityPicker
        value={profile.university}
        onChange={(id) => handleProfileChange('university', id)}
        onRequestSchool={onRequestSchool}
      />
    </div>
  );

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
      <p className="step-allergy-notice">
        ⚠️ Bento filters suggestions based on dining hall data, which may be incomplete. If you have a serious food allergy, always confirm ingredients with dining staff before eating.
      </p>

      <div className="restriction-section">
        <h3>Dietary Preferences</h3>
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
                onChange={() => handleRestrictionChange(key)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {restrictions.halal && !UNIVERSITIES.find(u => u.id === profile.university)?.labelHalal && (
          <p className="dietary-unlabeled-notice">
            ⚠ {UNIVERSITIES.find(u => u.id === profile.university)?.name ?? 'Your dining hall'} doesn't label halal items — always confirm with dining staff.
          </p>
        )}
      </div>

      <div className="restriction-section">
        <h3>Allergens to Avoid</h3>
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
                onChange={() => handleRestrictionChange(key)}
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
                <strong>University:</strong> {UNIVERSITIES.find((u) => u.id === profile.university)?.name}
              </li>
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

          {(restrictions.vegetarian || restrictions.vegan || restrictions.glutenFree ||
            restrictions.halal || restrictions.kosher ||
            restrictions.milk || restrictions.eggs || restrictions.wheat || restrictions.soy ||
            restrictions.fish || restrictions.shellfish || restrictions.treeNuts ||
            restrictions.peanuts || restrictions.sesame ||
            restrictions.allergies.length > 0) && (
            <div className="summary-card">
              <h3>Dietary Restrictions</h3>
              <div className="restriction-summary">
                {restrictions.vegetarian && <span className="tag">Vegetarian</span>}
                {restrictions.vegan && <span className="tag">Vegan</span>}
                {restrictions.glutenFree && <span className="tag">Gluten-Free</span>}
                {restrictions.halal && <span className="tag">Halal</span>}
                {restrictions.kosher && <span className="tag">Kosher</span>}
                {restrictions.milk      && <span className="tag allergy">Milk</span>}
                {restrictions.eggs      && <span className="tag allergy">Eggs</span>}
                {restrictions.wheat     && <span className="tag allergy">Wheat</span>}
                {restrictions.soy       && <span className="tag allergy">Soy</span>}
                {restrictions.fish      && <span className="tag allergy">Fish</span>}
                {restrictions.shellfish && <span className="tag allergy">Shellfish</span>}
                {restrictions.treeNuts  && <span className="tag allergy">Tree Nuts</span>}
                {restrictions.peanuts   && <span className="tag allergy">Peanuts</span>}
                {restrictions.sesame    && <span className="tag allergy">Sesame</span>}
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
      case 'university': return renderUniversityStep();
      case 'basics':     return renderBasicsStep();
      case 'activity':   return renderActivityStep();
      case 'goals':      return renderGoalsStep();
      case 'dietary':    return renderDietaryStep();
      case 'review':     return renderReviewStep();
      default:           return null;
    }
  };

  const isSwipeStep = STEPS[currentStep] === 'swipe';

  const sectionProgress = (
    <div className="section-progress">
      {SECTIONS.map((section, sIdx) => {
        const sectionStepIndices = section.steps.map(s => STEPS.indexOf(s));
        const firstIdx = sectionStepIndices[0];
        const lastIdx  = sectionStepIndices[sectionStepIndices.length - 1];
        const isComplete = currentStep > lastIdx;
        const isActive   = currentStep >= firstIdx && currentStep <= lastIdx;
        let fill = 0;
        if (isComplete) fill = 100;
        else if (isActive) fill = ((currentStep - firstIdx + 1) / section.steps.length) * 100;
        return (
          <div key={sIdx} className={`section-item ${isComplete ? 'complete' : ''} ${isActive ? 'active' : ''}`}>
            <div className="section-bar-track">
              <div className="section-bar-fill" style={{ width: `${fill}%` }} />
            </div>
            <span className="section-label">{section.label}</span>
          </div>
        );
      })}
    </div>
  );

  if (isSwipeStep) {
    return (
      <div className="onboarding-wizard onboarding-wizard-swipe">
        <div className="swipe-step-topbar">
          <img src="/logo-cropped.png" alt="Bento" className="swipe-step-logo" />
        </div>
        {sectionProgress}
        <MenuRatingOnboarding
          university={profile.university}
          onDone={() => {
            localStorage.setItem('bento_swipe_done', '1');
            handleNext();
          }}
        />
      </div>
    );
  }

  return (
    <div className="onboarding-wizard">
      <div className="wizard-header">
        <img src="/logo-cropped.png" alt="Bento" className="wizard-logo-img" />
        <p className="subtitle">Eat well. Every meal.</p>
      </div>

      {sectionProgress}

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
