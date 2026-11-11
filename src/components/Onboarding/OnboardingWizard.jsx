import { useState } from 'react';
import { ACTIVITY_LEVELS, GOALS, calculateNutritionTargets, calculateMacros, DEFAULT_MACRO_RATIOS } from '../../utils/tdeeCalculator';
import { setUserProfile, setNutritionTargets, setDietaryRestrictions, setNutritionDisplay as saveNutritionDisplay, saveSetupState } from '../../lib/db';
import { cleanLike } from '../Loud/likes';
import { setupSteps, DETAIL_STEPS } from '../Loud/setupSteps';
import { UNIVERSITIES } from '../../data/universities';
import UniversityPicker from '../common/UniversityPicker';
import CountUp from '../common/CountUp';
import BigTitle from './BigTitle';
import StepArt from './StepArt';
import { haptics } from '../../lib/haptics';
import MenuRatingOnboarding from './MenuRatingOnboarding';
import StudyJoin from '../Research/StudyJoin';
import { researchEnabled } from '../../lib/research';
import './OnboardingWizard.css';
import { loudOn } from '../Loud/loudFlag';

const LOUD = loudOn();

/* The shorter setup (Loud pilot). "What brings you here?" decides which steps follow. */
const WHY = [
  { id: 'goals',   label: 'Hit my goals',      tone: '#FF6A13' },
  { id: 'safe',    label: 'Eat safely',        tone: '#7FD8FF' },
  { id: 'friends', label: 'Eat with friends',  tone: '#FF7AC8' },
  { id: 'sport',   label: 'Train for a sport', tone: '#A99CFF' },
  { id: 'good',    label: "Find what's good",  tone: '#FFD84D' },
];
/* Drawn icons for the "What brings you here?" tiles, ink on the tile color. */
const WHY_ICON = {
  goals: <><rect x="6" y="15" width="5" height="10" rx="2" /><rect x="29" y="15" width="5" height="10" rx="2" /><rect x="11" y="11" width="5" height="18" rx="2" /><rect x="24" y="11" width="5" height="18" rx="2" /><rect x="16" y="18.5" width="8" height="3" /></>,
  safe: <><path d="M20 5l12 5v9c0 8-5 13-12 16C13 32 8 27 8 19v-9z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /><path d="M14 19l4 4 8-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></>,
  friends: <><circle cx="14" cy="13" r="5.5" /><path d="M4 31c0-5.5 4.5-9.5 10-9.5s10 4 10 9.5z" /><circle cx="27.5" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2.6" /><path d="M24.5 20.8c.9-.3 1.9-.4 3-.4 4.7 0 8.5 3.7 8.5 8.6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></>,
  sport: <><circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M20 13l6 4-2 7h-8l-2-7z" /></>,
  good: <path d="M20 5l4.5 9.5 10.5 1.3-7.7 7.2 2 10.4L20 28.3l-9.3 5.1 2-10.4L5 15.8l10.5-1.3z" />,
};

/* A student with no details gets a general starter target until they add them. 2,000 calories is the reference amount
 * on US nutrition labels. Macros use the same split as "maintain". */
const STARTER_TARGETS = { calories: 2000, macros: calculateMacros(2000, DEFAULT_MACRO_RATIOS.maintain) };

/* The study question is part of the iOS app only. On the web (the PWA) and on
 * Android the step is not in the list at all. */
const STEPS = researchEnabled()
  ? ['university', 'basics', 'activity', 'goals', 'dietary', 'numbers', 'swipe', 'study', 'review']
  : ['university', 'basics', 'activity', 'goals', 'dietary', 'numbers', 'swipe', 'review'];

const SECTIONS = [
  { label: 'About You',   steps: ['university', 'basics'] },
  { label: 'Your Goals',  steps: ['activity', 'goals'] },
  { label: 'Preferences', steps: ['dietary', 'numbers', 'swipe'] },
];

export default function OnboardingWizard({ onComplete, onGoContact, onRequestSchool, onSignOut }) {
  const [currentStep, setCurrentStep] = useState(0);
  // Staple ratings live here, not in the staples step, so going back to it keeps them (Loud pilot).
  const [stapleRatings, setStapleRatings] = useState({});
  const [why, setWhy] = useState([]);                       // picks on "What brings you here?"
  const [detailsSkipped, setDetailsSkipped] = useState(false);
  const [likes, setLikes] = useState([]);                   // "Foods you like"
  const [likeInput, setLikeInput] = useState('');
  const wantsDetails = why.includes('goals') || why.includes('sport');
  const withDetails = wantsDetails && !detailsSkipped;
  const steps = !LOUD ? STEPS : setupSteps({ why, detailsSkipped, research: researchEnabled() });
  // The study step needs an answer, Yes or No, before Continue works.
  const [studyAnswered, setStudyAnswered] = useState(false);
  // Which way the last move went, so the next step slides in from that side.
  const [direction, setDirection] = useState('fwd');
  // A full-screen colour panel that sweeps across between steps. The step
  // changes while the panel covers the screen, so the swap is never seen.
  const [wipe, setWipe] = useState(null);
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
  // Which nutrition numbers to show. Asked during onboarding rather than left
  // to be discovered in Settings, because someone who needs the numbers hidden
  // needs them hidden before they first see a meal plan.
  const [nutritionDisplay, setNutritionDisplay] = useState({
    calories: true, protein: true, carbs: true, fat: true,
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

  const WIPE_COLORS = LOUD ? ['#FF6A13', '#D2FF3D', '#A99CFF'] : ['#FD8F2A', '#77BD3E', '#24384F'];
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const changeStep = (delta) => {
    const apply = () => setCurrentStep((prev) => Math.max(0, Math.min(prev + delta, steps.length - 1)));
    if (reduced) { apply(); return; }
    const next = Math.max(0, Math.min(currentStep + delta, steps.length - 1));
    if (next === currentStep) return;   // already at the first or last step: nothing to sweep to
    setWipe({
      key: Date.now(),
      color: WIPE_COLORS[next % WIPE_COLORS.length],
      label: String(next + 1).padStart(2, '0'),
      back: delta < 0,
    });
    setTimeout(apply, 330);
    setTimeout(() => setWipe(null), 900);
  };

  const handleNext = () => {
    if (steps[currentStep] === 'basics' && !validateBasics()) return;
    haptics.light();
    setDirection('fwd');
    changeStep(1);
  };

  const handleBack = () => {
    haptics.selection();
    setDirection('back');
    changeStep(-1);
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
    haptics.success();
    if (LOUD) {
      // Details are optional now. Without them the profile keeps no body numbers and the plan uses the starter target.
      const keptProfile = withDetails ? profile
        : { ...profile, weight: null, heightFeet: null, heightInches: null, age: null, sex: null };   // activity and goal keep their defaults
      await Promise.all([
        setUserProfile(keptProfile),
        setNutritionTargets(withDetails ? calculateTargets() : STARTER_TARGETS),
        setDietaryRestrictions(restrictions),
      ]);
      await saveSetupState({ setupDone: true, goals: why, likedFoods: likes });
      onComplete();
      return;
    }
    const targets = calculateTargets();
    await Promise.all([
      setUserProfile(profile),
      saveNutritionDisplay(nutritionDisplay),
      setNutritionTargets(targets),
      setDietaryRestrictions(restrictions),
    ]);
    onComplete();
  };

  const renderUniversityStep = () => (
    <div className="step-content">
      <StepArt kind="university" />
      <BigTitle text="Select your university" />
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
      <StepArt kind="basics" />
      <BigTitle text="Let's get to know you" />
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
      <StepArt kind="activity" />
      <BigTitle text="How active are you?" />
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
      <StepArt kind="goals" />
      <BigTitle text="What's your goal?" />
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
      <StepArt kind="dietary" />
      <BigTitle text="Dietary Preferences" />
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
        <StepArt kind="review" />
        <BigTitle text="Your Personalized Plan" />
        <p className="step-description">Here's what we calculated based on your inputs.</p>

        <div className="review-summary">
          <div className="summary-card">
            <h3>Daily Targets</h3>
            <div className="target-grid">
              <div className="target-item">
                <span className="target-value"><CountUp value={targets.calories} duration={1300} /></span>
                <span className="target-label">Calories</span>
              </div>
              <div className="target-item">
                <span className="target-value"><CountUp value={targets.macros.protein} suffix="g" duration={1300} /></span>
                <span className="target-label">Protein</span>
              </div>
              <div className="target-item">
                <span className="target-value"><CountUp value={targets.macros.carbs} suffix="g" duration={1300} /></span>
                <span className="target-label">Carbs</span>
              </div>
              <div className="target-item">
                <span className="target-value"><CountUp value={targets.macros.fat} suffix="g" duration={1300} /></span>
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

  const METRIC_LABELS = [
    ['calories', 'Calories'],
    ['protein',  'Protein'],
    ['carbs',    'Carbs'],
    ['fat',      'Fat'],
  ];

  const toggleMetric = (key) =>
    setNutritionDisplay(prev => ({ ...prev, [key]: !prev[key] }));

  const allHidden = !nutritionDisplay.calories && !nutritionDisplay.protein
    && !nutritionDisplay.carbs && !nutritionDisplay.fat;

  const renderNumbersStep = () => (
    <div className="step-content">
      <StepArt kind="numbers" />
      <BigTitle text="Nutrition numbers" />
      <p className="step-description">
        Bento can show calories and macros on your plan, or keep them out of sight.
        Turn off anything you would rather not see. You can change this any time in Settings.
      </p>

      <div className="dietary-toggles">
        {METRIC_LABELS.map(([key, label]) => (
          <label key={key} className={`dietary-toggle ${nutritionDisplay[key] ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={nutritionDisplay[key]}
              onChange={() => toggleMetric(key)}
            />
            <span>Show {label.toLowerCase()}</span>
          </label>
        ))}
      </div>

      <button
        type="button"
        className="hide-all-numbers-btn"
        onClick={() => setNutritionDisplay(
          allHidden
            ? { calories: true, protein: true, carbs: true, fat: true }
            : { calories: false, protein: false, carbs: false, fat: false }
        )}
      >
        {allHidden ? 'Show all numbers' : 'Hide all numbers'}
      </button>

      <p className="section-note">
        Bento still builds balanced meals either way. Hiding the numbers only
        changes what you see, never what gets recommended.
      </p>
    </div>
  );

  const toggleWhy = (id) => setWhy((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const renderWhyStep = () => (
    <div className="step-content loud-setup">
      <h2 className="loud-setup-title">What brings you here?</h2>
      <p className="loud-setup-sub">Pick as many as you like.</p>
      <div className="loud-why">
        {WHY.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`loud-why-tile${why.includes(w.id) ? ' is-on' : ''}${w.id === 'good' ? ' is-wide' : ''}`}
            style={{ '--tone': w.tone }}
            aria-pressed={why.includes(w.id)}
            onClick={() => toggleWhy(w.id)}
          >
            <svg className="loud-why-icon" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">{WHY_ICON[w.id]}</svg>
            <span className="loud-why-label">{w.label}</span>
            {why.includes(w.id) && <span className="loud-why-tick" aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );

  const addLike = () => {
    const word = cleanLike(likeInput);
    if (!word) return;
    setLikes((prev) => (prev.some((l) => l.toLowerCase() === word.toLowerCase()) || prev.length >= 30 ? prev : [...prev, word]));
    setLikeInput('');
  };
  const renderLikesStep = () => (
    <div className="step-content loud-setup">
      <h2 className="loud-setup-title">Foods you like</h2>
      <p className="loud-setup-sub">Optional. Bento plans more dishes like these.</p>
      <div className="loud-like-add">
        <input
          type="text"
          value={likeInput}
          maxLength={40}
          placeholder="Type a food, like chicken"
          onChange={(e) => setLikeInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLike(); } }}
          aria-label="A food you like"
        />
        <button type="button" onClick={addLike} disabled={!cleanLike(likeInput)}>Add</button>
      </div>
      <ul className="loud-like-list">
        {likes.map((l) => (
          <li key={l}>
            <span>{l}</span>
            <button type="button" onClick={() => setLikes((prev) => prev.filter((x) => x !== l))} aria-label={`Remove ${l}`}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );

  const renderStudyStep = () => (
    <div className="step-content">
      <StudyJoin
        startAt="ask"
        onDone={() => {
          setStudyAnswered(true);
          // When the study question is the last step (the shorter setup), answering only unlocks the finish button.
          if (currentStep < steps.length - 1) handleNext();
        }}
        onEnrolled={() => setStudyAnswered(true)}
        onGoContact={onGoContact}
      />
    </div>
  );

  const renderStep = () => {
    switch (steps[currentStep]) {
      case 'university': return renderUniversityStep();
      case 'why':        return renderWhyStep();
      case 'likes':      return renderLikesStep();
      case 'basics':     return renderBasicsStep();
      case 'activity':   return renderActivityStep();
      case 'goals':      return renderGoalsStep();
      case 'dietary':    return renderDietaryStep();
      case 'numbers':    return renderNumbersStep();
      case 'study':      return renderStudyStep();
      case 'review':     return renderReviewStep();
      default:           return null;
    }
  };

  const isSwipeStep = steps[currentStep] === 'swipe';

  const sectionProgress = LOUD ? (
    <div className="loud-setup-top">
      <div className="loud-segs" aria-label={`Step ${currentStep + 1} of ${steps.length}`}>
        {steps.map((st, i) => <i key={st} className={i <= currentStep ? 'on' : ''} />)}
      </div>
      {DETAIL_STEPS.includes(steps[currentStep]) ? (
        <button type="button" className="loud-setup-skip" onClick={() => { haptics.selection(); setDetailsSkipped(true); }}>
          Skip
        </button>
      ) : (
        <span className="loud-setup-count">{currentStep + 1} of {steps.length}</span>
      )}
    </div>
  ) : (
    <div className="section-progress">
      {SECTIONS.map((section, sIdx) => {
        const sectionStepIndices = section.steps.map(s => steps.indexOf(s));
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
      <div className={`onboarding-wizard onboarding-wizard-swipe${LOUD ? ' loud loud-onb' : ''}`}>
        {LOUD && <LoudGlows />}
        {wipe && (
          <div key={wipe.key} className={`wipe${wipe.back ? ' back' : ''}`} style={{ '--wipe': wipe.color }} aria-hidden="true">
            <span className="wipe-num">{wipe.label}</span>
          </div>
        )}
        <div className="swipe-step-topbar">
          <img src="/logo-cropped.png" alt="Bento" className="swipe-step-logo" />
        </div>
        {sectionProgress}
        <MenuRatingOnboarding
          university={profile.university}
          onBack={handleBack}
          saved={stapleRatings}
          onSave={setStapleRatings}
          onDone={() => {
            localStorage.setItem('bento_swipe_done', '1');
            handleNext();
          }}
        />
      </div>
    );
  }

  const wipeEl = wipe && (
    <div
      key={wipe.key}
      className={`wipe${wipe.back ? ' back' : ''}`}
      style={{ '--wipe': wipe.color }}
      aria-hidden="true"
    >
      <span className="wipe-num">{wipe.label}</span>
    </div>
  );

  return (
    <div className={`onboarding-wizard${LOUD ? ' loud loud-onb' : ''}`}>
      {LOUD && <LoudGlows />}
      {wipeEl}
      <div className="wizard-header">
        <img src="/logo-cropped.png" alt="Bento" className="wizard-logo-img" />
      </div>
      {/* Someone who closed the app halfway through setup comes back here. Give them a way back to sign in with a
          different account instead of forcing them through setup (Loud pilot). */}
      {LOUD && sectionProgress}
      {LOUD && onSignOut && currentStep === 0 && (
        <button type="button" className="wizard-login-instead" onClick={onSignOut}>‹ Log in with a different account</button>
      )}

      {!LOUD && sectionProgress}

      <form onSubmit={(e) => e.preventDefault()}>
        <div key={currentStep} className={`step-stage ${direction}`}>
          {renderStep()}
        </div>

        <div className="wizard-actions">
          {currentStep > 0 && (
            <button type="button" className="btn-secondary" onClick={handleBack}>
              Back
            </button>
          )}
          {currentStep < steps.length - 1 ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleNext}
              disabled={steps[currentStep] === 'study' && !studyAnswered}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={handleComplete}
              disabled={steps[currentStep] === 'study' && !studyAnswered}
            >
              {LOUD ? "See today's menu" : 'Get Started'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/* Two soft color glows behind the setup screens (Loud pilot). They sit under everything and never cover text. */
function LoudGlows() {
  return (
    <>
      <span className="loud-glow" style={{ background: 'var(--or)', width: 260, height: 260, right: -60, top: 40 }} />
      <span className="loud-glow" style={{ background: 'var(--lc)', width: 240, height: 240, left: -80, bottom: 120 }} />
    </>
  );
}
