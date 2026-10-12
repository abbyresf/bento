/* A made-up campus menu for design work and App Store screenshots. Marker: BENTO_UI_MOCK_ACTIVE
 *
 * It names no real school or dining hall, so screenshots do not tie Bento to one campus. Reached only
 * when the app is built with VITE_UI_MOCK=true (see the demo university in data/universities.js and
 * DEMO_CONFIG in services/menuFetcher.js). Nothing here ships in a release build. */

const sv = (amount, unit) => ({ amount, unit, label: `${amount} ${unit}${amount > 1 && ['cup', 'slice', 'piece'].includes(unit) ? 's' : ''}` });

// name, station, calories, protein, carbs, fat, serving, tags
const NORTH = {
  breakfast: [
    ['Scrambled Eggs', 'breakfast', 190, 13, 2, 14, sv(1, 'serving'), ['vegetarian', 'glutenFree']],
    ['Turkey Sausage Links', 'breakfast', 120, 11, 1, 8, sv(2, 'each'), ['halal']],
    ['Veggie Egg White Scramble', 'breakfast', 110, 15, 4, 3, sv(1, 'serving'), ['vegetarian', 'glutenFree']],
    ['Steel-Cut Oatmeal', 'breakfast', 150, 5, 27, 3, sv(1, 'cup'), ['vegan', 'vegetarian', 'dairyFree']],
    ['Greek Yogurt Parfait', 'bakery', 240, 15, 32, 6, sv(1, 'serving'), ['vegetarian']],
    ['Whole Wheat Toast', 'bakery', 130, 5, 24, 2, sv(2, 'slice'), ['vegan', 'vegetarian']],
    ['Fresh Fruit Cup', 'salad', 80, 1, 20, 0, sv(1, 'cup'), ['vegan', 'vegetarian', 'glutenFree']],
    ['Blueberry Pancakes', 'breakfast', 290, 7, 52, 6, sv(2, 'each'), ['vegetarian']],
  ],
  lunch: [
    ['Grilled Chicken Breast', 'grill', 280, 42, 0, 8, sv(1, 'each'), ['glutenFree', 'dairyFree', 'halal']],
    ['Crispy Chicken Tender', 'grill', 270, 13, 14, 18, sv(3, 'each'), []],
    ['Black Bean Burger', 'grill', 310, 14, 38, 11, sv(1, 'each'), ['vegan', 'vegetarian']],
    ['Brown Rice', 'sides', 215, 5, 45, 2, sv(1, 'cup'), ['vegan', 'vegetarian', 'glutenFree']],
    ['Roasted Broccoli', 'sides', 70, 4, 10, 2, sv(1, 'cup'), ['vegan', 'vegetarian', 'glutenFree']],
    ['Garden Veggie Wrap', 'deli', 360, 12, 48, 13, sv(1, 'each'), ['vegetarian']],
    ['Turkey Club Sandwich', 'deli', 420, 31, 38, 16, sv(1, 'each'), []],
    ['Tomato Basil Soup', 'soup', 170, 4, 24, 6, sv(1, 'bowl'), ['vegetarian']],
    ['Garden Salad', 'salad', 60, 2, 8, 3, sv(1, 'bowl'), ['vegan', 'vegetarian', 'glutenFree']],
    ['Cheese Pizza Slice', 'pizza', 290, 13, 34, 11, sv(1, 'slice'), ['vegetarian']],
    ['Chocolate Chip Cookie', 'bakery', 210, 2, 29, 10, sv(1, 'each'), ['vegetarian']],
  ],
  dinner: [
    ['Baked Salmon', 'entree', 350, 34, 0, 22, sv(1, 'each'), ['glutenFree', 'dairyFree']],
    ['Chicken Tikka Masala', 'entree', 390, 32, 18, 21, sv(1, 'serving'), ['glutenFree', 'halal']],
    ['Tofu Vegetable Stir Fry', 'entree', 270, 19, 20, 14, sv(1, 'serving'), ['vegan', 'vegetarian', 'dairyFree']],
    ['Roasted Sweet Potatoes', 'sides', 180, 3, 41, 0, sv(1, 'cup'), ['vegan', 'vegetarian', 'glutenFree']],
    ['Steamed Green Beans', 'sides', 45, 2, 10, 0, sv(1, 'cup'), ['vegan', 'vegetarian', 'glutenFree']],
    ['Jasmine Rice', 'sides', 200, 4, 44, 0, sv(1, 'cup'), ['vegan', 'vegetarian', 'glutenFree']],
    ['Pasta Primavera', 'entree', 380, 14, 62, 9, sv(1, 'serving'), ['vegetarian']],
    ['Garlic Bread', 'bakery', 150, 4, 20, 6, sv(1, 'slice'), ['vegetarian']],
    ['Caesar Salad', 'salad', 120, 4, 9, 8, sv(1, 'bowl'), ['vegetarian']],
    ['Fruit Crisp', 'bakery', 230, 2, 38, 8, sv(1, 'serving'), ['vegetarian']],
  ],
};

const COMMONS = {
  breakfast: NORTH.breakfast.slice(0, 5),
  lunch: [
    ['Vegetable Sushi Roll', 'entree', 310, 9, 58, 5, sv(6, 'piece'), ['vegan', 'vegetarian']],
    ['Edamame', 'sides', 120, 11, 9, 5, sv(1, 'cup'), ['vegan', 'vegetarian', 'glutenFree']],
    ['Miso Soup', 'soup', 40, 3, 4, 1, sv(1, 'bowl'), ['vegetarian']],
    ['Teriyaki Chicken Bowl', 'entree', 480, 34, 62, 9, sv(1, 'bowl'), ['halal']],
  ],
  dinner: NORTH.dinner.slice(0, 6),
};

const slug = (s) => s.toLowerCase().replace(/\W+/g, '_');
const items = (rows, meal) => rows.map(([name, station, calories, protein, carbs, fat, serving, tags]) => ({
  id: `demo_${slug(name)}`, name, station, meal, tags, serving,
  nutrition: { calories, protein, carbs, fat, sodium: 380, fiber: 3, sugar: 4 },
  ingredients: [], allergens: [],
}));

export function mockCampusMenu(config) {
  const date = new Date();
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const build = (id, table) => ({
    ...config.locations[id],
    isOpen: true,
    meals: Object.fromEntries(['breakfast', 'lunch', 'dinner'].map((m) => [m, items(table[m], m)])),
  });
  return { date: dateStr, locations: { north: build('north', NORTH), commons: build('commons', COMMONS) } };
}
