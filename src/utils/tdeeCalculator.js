// TDEE Calculator using Mifflin-St Jeor equation

export const ACTIVITY_LEVELS = {
  sedentary: { label: 'Sedentary', description: 'Little or no exercise', multiplier: 1.2 },
  light: { label: 'Lightly Active', description: 'Light exercise 1-3 days/week', multiplier: 1.375 },
  moderate: { label: 'Moderately Active', description: 'Moderate exercise 3-5 days/week', multiplier: 1.55 },
  active: { label: 'Very Active', description: 'Hard exercise 6-7 days/week', multiplier: 1.725 },
  extreme: { label: 'Extra Active', description: 'Very hard exercise, physical job', multiplier: 1.9 },
};

export const GOALS = {
  lose: { label: 'Lose Weight', adjustment: -500, description: 'Moderate deficit (~1 lb/week)' },
  maintain: { label: 'Maintain Weight', adjustment: 0, description: 'Stay at current weight' },
  gain: { label: 'Build Muscle', adjustment: 300, description: 'Lean bulk surplus' },
};

export const DEFAULT_MACRO_RATIOS = {
  lose: { protein: 0.35, carbs: 0.35, fat: 0.30 },
  maintain: { protein: 0.30, carbs: 0.40, fat: 0.30 },
  gain: { protein: 0.30, carbs: 0.45, fat: 0.25 },
};

// Calculate BMR using Mifflin-St Jeor
export function calculateBMR(weight, height, age, sex) {
  // weight in kg, height in cm
  const base = 10 * weight + 6.25 * height - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

// Calculate TDEE
export function calculateTDEE(bmr, activityLevel) {
  return Math.round(bmr * ACTIVITY_LEVELS[activityLevel].multiplier);
}

// Calculate daily calorie target with goal adjustment
export function calculateCalorieTarget(tdee, goal) {
  return tdee + GOALS[goal].adjustment;
}

// Calculate macro targets in grams
export function calculateMacros(calories, ratios) {
  return {
    protein: Math.round((calories * ratios.protein) / 4), // 4 cal/g
    carbs: Math.round((calories * ratios.carbs) / 4), // 4 cal/g
    fat: Math.round((calories * ratios.fat) / 9), // 9 cal/g
  };
}

// Convert lbs to kg
export function lbsToKg(lbs) {
  return lbs * 0.453592;
}

// Convert feet/inches to cm
export function feetInchesToCm(feet, inches) {
  return (feet * 12 + inches) * 2.54;
}

// Full calculation from user inputs
export function calculateNutritionTargets(userProfile) {
  const { weight, weightUnit, heightFeet, heightInches, age, sex, activityLevel, goal } = userProfile;

  const weightKg = weightUnit === 'lbs' ? lbsToKg(weight) : weight;
  const heightCm = feetInchesToCm(heightFeet, heightInches);

  const bmr = calculateBMR(weightKg, heightCm, age, sex);
  const tdee = calculateTDEE(bmr, activityLevel);
  const calories = calculateCalorieTarget(tdee, goal);
  const macroRatios = userProfile.customMacros || DEFAULT_MACRO_RATIOS[goal];
  const macros = calculateMacros(calories, macroRatios);

  return {
    bmr: Math.round(bmr),
    tdee,
    calories,
    macros,
    macroRatios,
  };
}

// Meal distribution defaults (percentage of daily calories)
export const MEAL_DISTRIBUTION = {
  breakfast: 0.25,
  lunch: 0.375,
  dinner: 0.375,
};

export function calculateMealTargets(dailyTargets, distribution = MEAL_DISTRIBUTION) {
  return {
    breakfast: {
      calories: Math.round(dailyTargets.calories * distribution.breakfast),
      protein: Math.round(dailyTargets.macros.protein * distribution.breakfast),
      carbs: Math.round(dailyTargets.macros.carbs * distribution.breakfast),
      fat: Math.round(dailyTargets.macros.fat * distribution.breakfast),
    },
    lunch: {
      calories: Math.round(dailyTargets.calories * distribution.lunch),
      protein: Math.round(dailyTargets.macros.protein * distribution.lunch),
      carbs: Math.round(dailyTargets.macros.carbs * distribution.lunch),
      fat: Math.round(dailyTargets.macros.fat * distribution.lunch),
    },
    dinner: {
      calories: Math.round(dailyTargets.calories * distribution.dinner),
      protein: Math.round(dailyTargets.macros.protein * distribution.dinner),
      carbs: Math.round(dailyTargets.macros.carbs * distribution.dinner),
      fat: Math.round(dailyTargets.macros.fat * distribution.dinner),
    },
  };
}
