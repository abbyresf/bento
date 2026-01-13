// Mock menu data for Brandeis dining halls
// This simulates the structure that would come from scraping the actual dining website

export const LOCATIONS = {
  sherman: {
    id: 'sherman',
    name: 'Farm Table at Sherman',
    shortName: 'Sherman',
  },
  usdan: {
    id: 'usdan',
    name: 'Usdan Kitchen',
    shortName: 'Usdan',
  },
};

export const MEAL_TIMES = {
  breakfast: { start: 7, end: 10, label: 'Breakfast' },
  lunch: { start: 11, end: 14, label: 'Lunch' },
  dinner: { start: 17, end: 20, label: 'Dinner' },
};

// Station categories
export const STATIONS = {
  grill: 'Grill',
  deli: 'Deli',
  salad: 'Salad Bar',
  entree: 'Entrees',
  sides: 'Sides',
  pizza: 'Pizza',
  soup: 'Soup',
  bakery: 'Bakery',
  beverage: 'Beverages',
  breakfast: 'Breakfast',
  allgood: 'Allgood (Allergen-Free)',
};

// Dietary tags
export const DIETARY_TAGS = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  glutenFree: 'Gluten-Free',
  dairyFree: 'Dairy-Free',
  nutFree: 'Nut-Free',
  halal: 'Halal',
  kosher: 'Kosher',
};

// Mock menu items with nutrition data
const menuItems = {
  // BREAKFAST ITEMS
  scrambled_eggs: {
    id: 'scrambled_eggs',
    name: 'Scrambled Eggs',
    station: 'breakfast',
    meal: 'breakfast',
    nutrition: { calories: 180, protein: 12, carbs: 2, fat: 14, sodium: 320, fiber: 0, sugar: 1 },
    tags: ['vegetarian', 'glutenFree', 'nutFree'],
    ingredients: ['eggs', 'butter', 'milk', 'salt'],
  },
  turkey_sausage: {
    id: 'turkey_sausage',
    name: 'Turkey Sausage Links',
    station: 'breakfast',
    meal: 'breakfast',
    nutrition: { calories: 140, protein: 10, carbs: 2, fat: 10, sodium: 480, fiber: 0, sugar: 1 },
    tags: ['glutenFree', 'dairyFree', 'nutFree', 'halal'],
    ingredients: ['turkey', 'spices', 'salt'],
  },
  oatmeal: {
    id: 'oatmeal',
    name: 'Steel Cut Oatmeal',
    station: 'breakfast',
    meal: 'breakfast',
    nutrition: { calories: 150, protein: 5, carbs: 27, fat: 3, sodium: 10, fiber: 4, sugar: 1 },
    tags: ['vegan', 'dairyFree', 'nutFree'],
    ingredients: ['oats', 'water', 'salt'],
  },
  french_toast: {
    id: 'french_toast',
    name: 'French Toast',
    station: 'breakfast',
    meal: 'breakfast',
    nutrition: { calories: 280, protein: 8, carbs: 42, fat: 9, sodium: 380, fiber: 1, sugar: 12 },
    tags: ['vegetarian', 'nutFree'],
    ingredients: ['bread', 'eggs', 'milk', 'vanilla', 'cinnamon'],
  },
  yogurt_parfait: {
    id: 'yogurt_parfait',
    name: 'Greek Yogurt Parfait',
    station: 'breakfast',
    meal: 'breakfast',
    nutrition: { calories: 220, protein: 15, carbs: 32, fat: 4, sodium: 80, fiber: 2, sugar: 20 },
    tags: ['vegetarian', 'glutenFree'],
    ingredients: ['greek yogurt', 'granola', 'berries', 'honey'],
  },
  avocado_toast: {
    id: 'avocado_toast',
    name: 'Avocado Toast',
    station: 'breakfast',
    meal: 'breakfast',
    nutrition: { calories: 290, protein: 7, carbs: 28, fat: 18, sodium: 320, fiber: 8, sugar: 2 },
    tags: ['vegan', 'dairyFree', 'nutFree'],
    ingredients: ['sourdough bread', 'avocado', 'lemon', 'salt', 'pepper'],
  },
  bacon: {
    id: 'bacon',
    name: 'Crispy Bacon',
    station: 'breakfast',
    meal: 'breakfast',
    nutrition: { calories: 160, protein: 12, carbs: 0, fat: 12, sodium: 620, fiber: 0, sugar: 0 },
    tags: ['glutenFree', 'dairyFree', 'nutFree'],
    ingredients: ['pork belly', 'salt', 'sugar'],
  },
  fruit_cup: {
    id: 'fruit_cup',
    name: 'Fresh Fruit Cup',
    station: 'breakfast',
    meal: 'breakfast',
    nutrition: { calories: 80, protein: 1, carbs: 20, fat: 0, sodium: 5, fiber: 3, sugar: 16 },
    tags: ['vegan', 'glutenFree', 'dairyFree', 'nutFree', 'halal', 'kosher'],
    ingredients: ['melon', 'berries', 'grapes', 'pineapple'],
  },
  breakfast_burrito: {
    id: 'breakfast_burrito',
    name: 'Breakfast Burrito',
    station: 'breakfast',
    meal: 'breakfast',
    nutrition: { calories: 420, protein: 18, carbs: 38, fat: 22, sodium: 780, fiber: 3, sugar: 2 },
    tags: ['nutFree'],
    ingredients: ['tortilla', 'eggs', 'cheese', 'peppers', 'onions', 'salsa'],
  },

  // LUNCH/DINNER ENTREES
  grilled_chicken: {
    id: 'grilled_chicken',
    name: 'Herb Grilled Chicken Breast',
    station: 'grill',
    meal: 'lunch',
    nutrition: { calories: 220, protein: 38, carbs: 2, fat: 6, sodium: 420, fiber: 0, sugar: 0 },
    tags: ['glutenFree', 'dairyFree', 'nutFree', 'halal'],
    ingredients: ['chicken breast', 'herbs', 'olive oil', 'garlic'],
  },
  beef_burger: {
    id: 'beef_burger',
    name: 'Classic Beef Burger',
    station: 'grill',
    meal: 'lunch',
    nutrition: { calories: 480, protein: 28, carbs: 32, fat: 26, sodium: 680, fiber: 2, sugar: 6 },
    tags: ['nutFree'],
    ingredients: ['beef patty', 'brioche bun', 'lettuce', 'tomato', 'onion'],
  },
  veggie_burger: {
    id: 'veggie_burger',
    name: 'Black Bean Veggie Burger',
    station: 'grill',
    meal: 'lunch',
    nutrition: { calories: 380, protein: 14, carbs: 48, fat: 14, sodium: 620, fiber: 8, sugar: 6 },
    tags: ['vegetarian', 'vegan', 'dairyFree', 'nutFree'],
    ingredients: ['black beans', 'corn', 'peppers', 'bun', 'lettuce'],
  },
  salmon: {
    id: 'salmon',
    name: 'Baked Salmon with Dill',
    station: 'entree',
    meal: 'dinner',
    nutrition: { calories: 320, protein: 34, carbs: 2, fat: 18, sodium: 380, fiber: 0, sugar: 0 },
    tags: ['glutenFree', 'dairyFree', 'nutFree'],
    ingredients: ['atlantic salmon', 'dill', 'lemon', 'olive oil'],
  },
  pasta_marinara: {
    id: 'pasta_marinara',
    name: 'Penne Marinara',
    station: 'entree',
    meal: 'dinner',
    nutrition: { calories: 380, protein: 12, carbs: 68, fat: 6, sodium: 580, fiber: 4, sugar: 8 },
    tags: ['vegetarian', 'vegan', 'dairyFree', 'nutFree'],
    ingredients: ['penne pasta', 'tomatoes', 'garlic', 'basil', 'olive oil'],
  },
  chicken_stir_fry: {
    id: 'chicken_stir_fry',
    name: 'Chicken Vegetable Stir Fry',
    station: 'entree',
    meal: 'dinner',
    nutrition: { calories: 340, protein: 28, carbs: 24, fat: 14, sodium: 720, fiber: 4, sugar: 6 },
    tags: ['dairyFree', 'nutFree'],
    ingredients: ['chicken', 'broccoli', 'bell peppers', 'soy sauce', 'ginger'],
  },
  tofu_curry: {
    id: 'tofu_curry',
    name: 'Thai Coconut Tofu Curry',
    station: 'entree',
    meal: 'dinner',
    nutrition: { calories: 360, protein: 16, carbs: 28, fat: 22, sodium: 580, fiber: 4, sugar: 6 },
    tags: ['vegetarian', 'vegan', 'glutenFree', 'dairyFree'],
    ingredients: ['tofu', 'coconut milk', 'curry paste', 'vegetables', 'basil'],
  },
  beef_tacos: {
    id: 'beef_tacos',
    name: 'Seasoned Beef Tacos (2)',
    station: 'entree',
    meal: 'dinner',
    nutrition: { calories: 420, protein: 22, carbs: 36, fat: 22, sodium: 640, fiber: 4, sugar: 3 },
    tags: ['nutFree'],
    ingredients: ['ground beef', 'corn tortillas', 'lettuce', 'cheese', 'salsa'],
  },
  falafel_plate: {
    id: 'falafel_plate',
    name: 'Falafel Plate with Hummus',
    station: 'entree',
    meal: 'lunch',
    nutrition: { calories: 480, protein: 18, carbs: 52, fat: 24, sodium: 820, fiber: 12, sugar: 4 },
    tags: ['vegetarian', 'vegan', 'dairyFree', 'nutFree', 'halal'],
    ingredients: ['chickpeas', 'herbs', 'pita', 'hummus', 'cucumber', 'tomato'],
  },

  // DELI
  turkey_sandwich: {
    id: 'turkey_sandwich',
    name: 'Turkey Club Sandwich',
    station: 'deli',
    meal: 'lunch',
    nutrition: { calories: 520, protein: 32, carbs: 42, fat: 24, sodium: 1120, fiber: 3, sugar: 5 },
    tags: ['nutFree'],
    ingredients: ['turkey', 'bacon', 'lettuce', 'tomato', 'mayo', 'bread'],
  },
  veggie_wrap: {
    id: 'veggie_wrap',
    name: 'Mediterranean Veggie Wrap',
    station: 'deli',
    meal: 'lunch',
    nutrition: { calories: 380, protein: 12, carbs: 48, fat: 16, sodium: 680, fiber: 6, sugar: 4 },
    tags: ['vegetarian', 'nutFree'],
    ingredients: ['tortilla', 'hummus', 'feta', 'cucumbers', 'peppers', 'olives'],
  },

  // PIZZA
  cheese_pizza: {
    id: 'cheese_pizza',
    name: 'Cheese Pizza Slice',
    station: 'pizza',
    meal: 'lunch',
    nutrition: { calories: 280, protein: 12, carbs: 34, fat: 12, sodium: 620, fiber: 2, sugar: 4 },
    tags: ['vegetarian', 'nutFree'],
    ingredients: ['dough', 'tomato sauce', 'mozzarella'],
  },
  pepperoni_pizza: {
    id: 'pepperoni_pizza',
    name: 'Pepperoni Pizza Slice',
    station: 'pizza',
    meal: 'lunch',
    nutrition: { calories: 320, protein: 14, carbs: 34, fat: 16, sodium: 780, fiber: 2, sugar: 4 },
    tags: ['nutFree'],
    ingredients: ['dough', 'tomato sauce', 'mozzarella', 'pepperoni'],
  },
  veggie_pizza: {
    id: 'veggie_pizza',
    name: 'Garden Veggie Pizza Slice',
    station: 'pizza',
    meal: 'lunch',
    nutrition: { calories: 260, protein: 10, carbs: 36, fat: 10, sodium: 540, fiber: 3, sugar: 5 },
    tags: ['vegetarian', 'nutFree'],
    ingredients: ['dough', 'tomato sauce', 'mozzarella', 'peppers', 'onions', 'mushrooms'],
  },

  // SALADS
  caesar_salad: {
    id: 'caesar_salad',
    name: 'Classic Caesar Salad',
    station: 'salad',
    meal: 'lunch',
    nutrition: { calories: 220, protein: 6, carbs: 12, fat: 18, sodium: 480, fiber: 2, sugar: 2 },
    tags: ['vegetarian', 'glutenFree', 'nutFree'],
    ingredients: ['romaine', 'parmesan', 'caesar dressing', 'croutons'],
  },
  garden_salad: {
    id: 'garden_salad',
    name: 'Garden Salad',
    station: 'salad',
    meal: 'lunch',
    nutrition: { calories: 80, protein: 3, carbs: 14, fat: 2, sodium: 120, fiber: 4, sugar: 6 },
    tags: ['vegetarian', 'vegan', 'glutenFree', 'dairyFree', 'nutFree', 'halal', 'kosher'],
    ingredients: ['mixed greens', 'tomatoes', 'cucumbers', 'carrots'],
  },
  chicken_caesar: {
    id: 'chicken_caesar',
    name: 'Grilled Chicken Caesar',
    station: 'salad',
    meal: 'lunch',
    nutrition: { calories: 380, protein: 32, carbs: 12, fat: 24, sodium: 680, fiber: 2, sugar: 2 },
    tags: ['glutenFree', 'nutFree'],
    ingredients: ['romaine', 'grilled chicken', 'parmesan', 'caesar dressing'],
  },
  quinoa_bowl: {
    id: 'quinoa_bowl',
    name: 'Quinoa Power Bowl',
    station: 'salad',
    meal: 'lunch',
    nutrition: { calories: 420, protein: 14, carbs: 52, fat: 18, sodium: 380, fiber: 8, sugar: 4 },
    tags: ['vegetarian', 'vegan', 'glutenFree', 'dairyFree', 'nutFree'],
    ingredients: ['quinoa', 'chickpeas', 'roasted vegetables', 'tahini'],
  },

  // SIDES
  rice: {
    id: 'rice',
    name: 'Steamed Brown Rice',
    station: 'sides',
    meal: 'dinner',
    nutrition: { calories: 160, protein: 4, carbs: 34, fat: 1, sodium: 10, fiber: 2, sugar: 0 },
    tags: ['vegetarian', 'vegan', 'glutenFree', 'dairyFree', 'nutFree', 'halal', 'kosher'],
    ingredients: ['brown rice', 'water', 'salt'],
  },
  mashed_potatoes: {
    id: 'mashed_potatoes',
    name: 'Garlic Mashed Potatoes',
    station: 'sides',
    meal: 'dinner',
    nutrition: { calories: 180, protein: 3, carbs: 28, fat: 7, sodium: 340, fiber: 2, sugar: 2 },
    tags: ['vegetarian', 'glutenFree', 'nutFree'],
    ingredients: ['potatoes', 'butter', 'milk', 'garlic', 'salt'],
  },
  roasted_vegetables: {
    id: 'roasted_vegetables',
    name: 'Roasted Seasonal Vegetables',
    station: 'sides',
    meal: 'dinner',
    nutrition: { calories: 100, protein: 3, carbs: 14, fat: 4, sodium: 180, fiber: 4, sugar: 6 },
    tags: ['vegetarian', 'vegan', 'glutenFree', 'dairyFree', 'nutFree', 'halal', 'kosher'],
    ingredients: ['zucchini', 'squash', 'peppers', 'olive oil', 'herbs'],
  },
  french_fries: {
    id: 'french_fries',
    name: 'Crispy French Fries',
    station: 'sides',
    meal: 'lunch',
    nutrition: { calories: 320, protein: 4, carbs: 42, fat: 16, sodium: 480, fiber: 3, sugar: 0 },
    tags: ['vegetarian', 'vegan', 'glutenFree', 'dairyFree', 'nutFree'],
    ingredients: ['potatoes', 'oil', 'salt'],
  },
  steamed_broccoli: {
    id: 'steamed_broccoli',
    name: 'Steamed Broccoli',
    station: 'sides',
    meal: 'dinner',
    nutrition: { calories: 55, protein: 4, carbs: 10, fat: 0, sodium: 30, fiber: 5, sugar: 2 },
    tags: ['vegetarian', 'vegan', 'glutenFree', 'dairyFree', 'nutFree', 'halal', 'kosher'],
    ingredients: ['broccoli', 'salt'],
  },
  mac_cheese: {
    id: 'mac_cheese',
    name: 'Mac and Cheese',
    station: 'sides',
    meal: 'dinner',
    nutrition: { calories: 380, protein: 14, carbs: 42, fat: 18, sodium: 720, fiber: 2, sugar: 4 },
    tags: ['vegetarian', 'nutFree'],
    ingredients: ['pasta', 'cheddar', 'milk', 'butter'],
  },

  // SOUP
  tomato_soup: {
    id: 'tomato_soup',
    name: 'Creamy Tomato Soup',
    station: 'soup',
    meal: 'lunch',
    nutrition: { calories: 180, protein: 4, carbs: 22, fat: 9, sodium: 680, fiber: 3, sugar: 12 },
    tags: ['vegetarian', 'glutenFree', 'nutFree'],
    ingredients: ['tomatoes', 'cream', 'basil', 'onion'],
  },
  chicken_noodle: {
    id: 'chicken_noodle',
    name: 'Chicken Noodle Soup',
    station: 'soup',
    meal: 'lunch',
    nutrition: { calories: 160, protein: 12, carbs: 18, fat: 4, sodium: 820, fiber: 1, sugar: 2 },
    tags: ['dairyFree', 'nutFree'],
    ingredients: ['chicken', 'noodles', 'carrots', 'celery', 'broth'],
  },
  minestrone: {
    id: 'minestrone',
    name: 'Vegetable Minestrone',
    station: 'soup',
    meal: 'dinner',
    nutrition: { calories: 140, protein: 6, carbs: 24, fat: 3, sodium: 720, fiber: 5, sugar: 4 },
    tags: ['vegetarian', 'vegan', 'dairyFree', 'nutFree'],
    ingredients: ['beans', 'pasta', 'tomatoes', 'vegetables', 'herbs'],
  },

  // BEVERAGES
  coffee: {
    id: 'coffee',
    name: 'Coffee',
    station: 'beverage',
    meal: 'breakfast',
    nutrition: { calories: 5, protein: 0, carbs: 0, fat: 0, sodium: 5, fiber: 0, sugar: 0 },
    tags: ['vegan', 'glutenFree', 'dairyFree', 'nutFree', 'halal', 'kosher'],
    ingredients: ['coffee'],
  },
  orange_juice: {
    id: 'orange_juice',
    name: 'Fresh Orange Juice',
    station: 'beverage',
    meal: 'breakfast',
    nutrition: { calories: 110, protein: 2, carbs: 26, fat: 0, sodium: 0, fiber: 0, sugar: 22 },
    tags: ['vegan', 'glutenFree', 'dairyFree', 'nutFree', 'halal', 'kosher'],
    ingredients: ['oranges'],
  },
  milk: {
    id: 'milk',
    name: 'Low-Fat Milk',
    station: 'beverage',
    meal: 'breakfast',
    nutrition: { calories: 100, protein: 8, carbs: 12, fat: 2, sodium: 100, fiber: 0, sugar: 12 },
    tags: ['vegetarian', 'glutenFree', 'nutFree'],
    ingredients: ['milk'],
  },
  iced_tea: {
    id: 'iced_tea',
    name: 'Unsweetened Iced Tea',
    station: 'beverage',
    meal: 'lunch',
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 10, fiber: 0, sugar: 0 },
    tags: ['vegan', 'glutenFree', 'dairyFree', 'nutFree', 'halal', 'kosher'],
    ingredients: ['tea', 'water'],
  },

  // ALLGOOD (Allergen-Free Station)
  allgood_chicken: {
    id: 'allgood_chicken',
    name: 'Allgood Lemon Herb Chicken',
    station: 'allgood',
    meal: 'dinner',
    nutrition: { calories: 240, protein: 36, carbs: 4, fat: 8, sodium: 320, fiber: 1, sugar: 1 },
    tags: ['glutenFree', 'dairyFree', 'nutFree', 'halal'],
    ingredients: ['chicken breast', 'lemon', 'herbs', 'olive oil'],
  },
  allgood_rice_bowl: {
    id: 'allgood_rice_bowl',
    name: 'Allgood Vegetable Rice Bowl',
    station: 'allgood',
    meal: 'lunch',
    nutrition: { calories: 320, protein: 8, carbs: 58, fat: 6, sodium: 280, fiber: 6, sugar: 4 },
    tags: ['vegetarian', 'vegan', 'glutenFree', 'dairyFree', 'nutFree', 'halal', 'kosher'],
    ingredients: ['rice', 'roasted vegetables', 'herbs', 'olive oil'],
  },
};

// Generate today's menu for both locations
export function generateTodaysMenu() {
  // Simulate different menus at each location with some overlap
  const commonBreakfast = ['scrambled_eggs', 'turkey_sausage', 'oatmeal', 'fruit_cup', 'coffee', 'orange_juice', 'milk'];
  const commonLunch = ['garden_salad', 'tomato_soup', 'iced_tea'];
  const commonDinner = ['rice', 'roasted_vegetables', 'steamed_broccoli', 'minestrone'];

  const shermanMenu = {
    breakfast: [...commonBreakfast, 'french_toast', 'yogurt_parfait', 'bacon'],
    lunch: [...commonLunch, 'grilled_chicken', 'turkey_sandwich', 'cheese_pizza', 'pepperoni_pizza', 'caesar_salad', 'quinoa_bowl', 'french_fries', 'allgood_rice_bowl'],
    dinner: [...commonDinner, 'salmon', 'chicken_stir_fry', 'pasta_marinara', 'mashed_potatoes', 'mac_cheese', 'allgood_chicken'],
  };

  const usdanMenu = {
    breakfast: [...commonBreakfast, 'avocado_toast', 'breakfast_burrito', 'yogurt_parfait'],
    lunch: [...commonLunch, 'beef_burger', 'veggie_burger', 'veggie_wrap', 'veggie_pizza', 'chicken_caesar', 'falafel_plate', 'chicken_noodle', 'allgood_rice_bowl'],
    dinner: [...commonDinner, 'tofu_curry', 'beef_tacos', 'grilled_chicken', 'pasta_marinara', 'mashed_potatoes', 'allgood_chicken'],
  };

  return {
    date: new Date().toISOString().split('T')[0],
    locations: {
      sherman: {
        ...LOCATIONS.sherman,
        meals: {
          breakfast: shermanMenu.breakfast.map((id) => menuItems[id]).filter(Boolean),
          lunch: shermanMenu.lunch.map((id) => menuItems[id]).filter(Boolean),
          dinner: shermanMenu.dinner.map((id) => menuItems[id]).filter(Boolean),
        },
      },
      usdan: {
        ...LOCATIONS.usdan,
        meals: {
          breakfast: usdanMenu.breakfast.map((id) => menuItems[id]).filter(Boolean),
          lunch: usdanMenu.lunch.map((id) => menuItems[id]).filter(Boolean),
          dinner: usdanMenu.dinner.map((id) => menuItems[id]).filter(Boolean),
        },
      },
    },
  };
}

// Get all menu items (for testing/reference)
export function getAllMenuItems() {
  return menuItems;
}

// Check if a dining hall is open for a given meal at current time
export function isDiningHallOpen(meal) {
  const hour = new Date().getHours();
  const mealTime = MEAL_TIMES[meal];
  return hour >= mealTime.start && hour < mealTime.end;
}

// Get current or next meal based on time
export function getCurrentMeal() {
  const hour = new Date().getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 14) return 'lunch';
  if (hour < 20) return 'dinner';
  return 'dinner'; // After dinner, still show dinner
}

// Check if a meal has passed
export function hasMealPassed(meal) {
  const hour = new Date().getHours();
  return hour >= MEAL_TIMES[meal].end;
}
