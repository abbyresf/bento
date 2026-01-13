# NutriRecs - Brandeis Dining Meal Planner

## Overview
A client-side React web application that generates personalized daily meal plans from Brandeis University dining halls (Sherman and Usdan) based on user nutrition preferences and dietary restrictions.

---

## Data Source

### Menu Data
- **Source**: Brandeis University dining website (web scraping)
- **Locations**: Sherman Dining Hall and Usdan Student Center only
- **Data Fetching**: Fetch fresh menu data on page load
- **Fallback**: If fetch fails, use last cached data with a visible "may be outdated" warning banner
- **Missing Nutrition Data**: Estimate values from similar food items when nutrition info is incomplete

### Data Structure Expected
- Menu items with names, nutrition facts, station/category, allergen tags
- Operating hours for each location
- Meal period assignments (breakfast, lunch, dinner)

---

## User Preferences & Configuration

### TDEE Calculator Wizard (Required Onboarding)
New users must complete setup before seeing recommendations.

**Required Inputs:**
- Weight (lbs/kg)
- Height (ft-in/cm)
- Age
- Biological sex
- Activity level (sedentary, lightly active, moderately active, very active, extra active)

**Optional Goal Add-ons:**
- Goal selection: lose weight, maintain, gain muscle
- Calorie adjustment based on goal (+/- 250-500 cal)
- Target macro ratios (protein/carbs/fat percentages)

**Output:**
- Calculated daily calorie target
- Suggested macro breakdown
- User can manually override any calculated value

### Dietary Restrictions
**Standard Categories (toggles):**
- Vegetarian
- Vegan
- Gluten-free
- Dairy-free
- Nut-free
- Halal
- Kosher

**Custom Ingredient Avoidance:**
- Free-text input for specific ingredients to avoid
- Distinguish between allergies (hard block - never recommend) vs. preferences (soft avoid - deprioritize)

### Persistence
- All preferences stored in browser LocalStorage
- No user accounts or server-side storage

---

## Meal Planning Algorithm

### Optimization Strategy
- **Scope**: Holistic daily optimization (balance across all 3 meals to hit daily totals)
- **Approach**: Fast heuristic algorithm (not exhaustive search)
- **Meal Composition**: Multi-item meal building (entree + sides + drink combinations)

### Meal Balance
- Smart defaults by meal type:
  - Breakfast: ~25% of daily calories (lighter)
  - Lunch: ~35-40% of daily calories
  - Dinner: ~35-40% of daily calories
- User can adjust these ratios in settings

### Variety System
- **Storage**: LocalStorage history of selected items (last 14 days)
- **Behavior**: Soft preference - penalize recently-eaten items in recommendation scoring, but still allow them if clearly the best option
- **Tracking**: Optional checkoff for what user actually ate (improves variety accuracy)

### Constraint Handling
- **Hard constraints** (allergies): Never violate - completely exclude items
- **Soft constraints** (preferences, macro targets): Best-effort with warnings
- When constraints cannot be satisfied: Show closest match with clear warning indicators explaining which targets were missed and why

---

## User Interface

### Technology
- **Framework**: React
- **Styling**: Clean, minimal aesthetic (whitespace, simple typography, subtle colors)
- **Responsive**: Desktop-first, mobile-friendly

### Main Views

#### 1. Onboarding Wizard
- Step-by-step TDEE calculator
- Dietary restriction selection
- Custom ingredient avoidance input
- Must complete before accessing meal plans

#### 2. Daily Meal Plan (Card-based Timeline)
Vertical scroll layout with three meal cards:

**Each Meal Card Contains:**
- Meal name (Breakfast/Lunch/Dinner)
- Time indicator (past meals grayed out, current/upcoming prominent)
- Location tabs: "Sherman" | "Usdan" (show both options, user decides)
- Recommended items (3-4 items per meal)
  - Item name
  - Brief reasoning (e.g., "High protein to meet your goal")
  - Prominent macros: Calories, Protein, Carbs, Fat
  - Expandable details for micronutrients
- Per-meal nutrition subtotals
- Swap button on each item

**Daily Summary Section:**
- Total calories and macros for the day
- Visual progress bars toward targets
- Warnings for any missed targets or constraint violations

#### 3. Item Swap Interface
When user rejects an item:
- Show single best alternative with nutrition comparison
- One-click to accept alternative
- Option to reject again for another alternative
- Shows how swap affects daily totals

#### 4. Settings/Preferences
- Edit TDEE inputs and recalculate
- Modify dietary restrictions
- Adjust meal balance ratios
- Clear history/reset variety tracking

### Nutrition Display
- **Prominent**: Calories, Protein, Carbs, Fat
- **Expandable Details**: Sodium, fiber, sugar, saturated fat, cholesterol, vitamins, minerals (when available)

---

## Features Summary

### Core Features
1. Fetch and parse Brandeis dining menus (Sherman + Usdan)
2. TDEE calculator with goal-based adjustments
3. Dietary restriction filtering (standard + custom)
4. Multi-item meal recommendations optimized for daily targets
5. Side-by-side Sherman vs. Usdan recommendations
6. Item swapping with smart alternatives
7. Brief recommendation explanations
8. Soft variety tracking via LocalStorage

### User Experience
- Forced onboarding ensures personalized experience from start
- Clean card-based timeline for easy scanning
- Past meals de-emphasized, upcoming meals highlighted
- Optional meal confirmation for variety accuracy
- Graceful fallback to cached data on fetch failure

---

## Technical Architecture

### Stack
- React (Create React App or Vite)
- LocalStorage for all persistence
- No backend server required

### Data Flow
1. On app load: Check LocalStorage for user preferences
2. If no preferences: Show onboarding wizard
3. If preferences exist: Fetch today's menu from Brandeis website
4. If fetch fails: Load cached menu, show warning
5. Run optimization algorithm with preferences + menu
6. Display meal plan with both location options
7. On item swap: Recalculate and update display
8. On meal confirmation: Update variety history

### Key Modules
- `MenuFetcher`: Web scraper for Brandeis dining data
- `NutritionEstimator`: Estimate missing values from similar items
- `TDEECalculator`: Calculate calorie/macro targets
- `MealOptimizer`: Heuristic algorithm for daily meal planning
- `VarietyTracker`: LocalStorage-based history management
- `PreferencesManager`: Store and retrieve user settings

---

## Non-Requirements (Explicitly Out of Scope)
- User accounts / server-side storage
- Multi-day planning (today only)
- Offline/PWA functionality
- Item locking (force-include specific items)
- Social features / sharing
- C-Store or other Brandeis dining locations
- Optimal algorithm (good-enough heuristic is acceptable)

---

## Edge Cases to Handle
1. **No items match restrictions**: Show warning, suggest adjusting preferences
2. **Dining hall closed**: Don't show that location's tab for that meal
3. **All items missing nutrition data**: Show items with "nutrition unknown" disclaimer
4. **Browser LocalStorage full/unavailable**: Graceful degradation, work without persistence
5. **Menu not yet published**: Show appropriate message, suggest checking back later
