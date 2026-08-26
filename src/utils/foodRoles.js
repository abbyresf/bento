// Classifies a menu item by the role it plays on a plate.
//
// Dining-hall station labels are too unreliable to build a meal from: Brandeis
// files dressings, olive oil and shredded cheese under "Produce Market" (which
// maps to the salad station), lists raw zucchini as an entree, and puts only a
// handful of items in "sides" campus-wide. So roles are derived from the item's
// name and its nutrition, with the station used only as a weak hint.
//
// The roles that matter most are the ones that must never stand alone:
// CONDIMENT and GARNISH. A vinaigrette scores beautifully against a 15-calorie
// gap, which is exactly how "balsamic vinaigrette" ends up recommended as food.

export const ROLE = {
  PROTEIN:   'protein',    // a protein source: chicken, tofu, eggs, beans
  VEGETABLE: 'vegetable',  // a cooked or composed vegetable dish
  GRAIN:     'grain',      // rice, pasta, bread, potatoes
  COMPOSED:  'composed',   // a dish already combining protein and carb
  SOUP:      'soup',
  FRUIT:     'fruit',
  DESSERT:   'dessert',
  BEVERAGE:  'beverage',
  GARNISH:   'garnish',    // toppings: sliced peppers, seeds, shredded cheese
  CONDIMENT: 'condiment',  // dressings, sauces, oils, syrups
  OTHER:     'other',
};

// Roles that can never be selected on their own merit.
export const ACCESSORY_ROLES = new Set([ROLE.CONDIMENT, ROLE.GARNISH]);

// Roles that make a plate feel like a meal.
export const STRUCTURAL_ROLES = new Set([ROLE.PROTEIN, ROLE.VEGETABLE, ROLE.GRAIN, ROLE.COMPOSED]);

const rx = (...parts) => new RegExp(parts.join('|'), 'i');

// Whole-item condiments. Matched against the full name, so "Jerk Sauce" is a
// condiment while "Chicken in Tomato Sauce" is not.
const CONDIMENT = rx(
  '\\b(dressing|vinaigrette|mayonnaise|aioli|ketchup|syrup|gravy|marinade|glaze)\\b',
  '^(.*\\s)?(sauce|salsa|pesto|tzatziki|hummus|guacamole|tahini|chimichurri|relish|chutney)$',
  '^(.*\\s)?(mustard|honey|jam|jelly|preserves|marmalade|nutella|ranch)$',
  '\\bsugar\\b',
  '^(.*\\s)?(oil|vinegar)$',
  '^(butter|margarine|whipped butter|cream cheese|sour cream|creamer)$',
  '\\b(sprinkles|powdered sugar|brown sugar|granulated sugar|kosher salt|sea salt)\\b',
  '^hot honey$'
);

// Things that are a topping no matter how they are labelled or how much
// protein they carry. Pumpkin seeds are 8g of protein and still not a course.
const ALWAYS_GARNISH = rx(
  '\\b(sunflower|pumpkin|chia|flax|sesame|hemp|poppy)\\s*seeds?\\b',
  '\\b(pepitas|roasted garlic)\\b',
  '\\b(croutons|bacon bits|chow mein noodles|wonton strips|tortilla strips|chocolate chips)\\b',
  '\\b(olives?|pickles?|pepperoncini|capers|relish)\\b',
  '\\b(dried cranberries|raisins|craisins)\\b',
  '\\b(shaved|shredded|grated|crumbled|sliced)\\s+(parmesan|cheddar|mozzarella|feta|cheese)\\b',
  '\\b(feta|parmesan|cheddar|mozzarella|american)\\s+cheese\\s+(crumbles|slices)\\b',
  '\\b(lemon|lime|orange)\\s+(wedges?|slices?)\\b'
);

// Toppings and add-ons. These are real food, but they are not a component of a
// meal on their own — you put them on something.
const GARNISH_NAME = rx(
  '^(sliced|diced|shredded|grated|chopped|julienne[d]?|minced|crumbled|shaved)\\s',
  '\\b(banana peppers|jalapeno peppers)\\b',
  '^(american|swiss|provolone|feta)\\s+cheese$'
);

const BEVERAGE = rx(
  '\\b(coffee|espresso|latte|cappuccino|tea|lemonade|soda|cola|seltzer)\\b',
  '\\bwater\\b(?!\\s*chestnut)',
  '\\b(milk|juice|smoothie|kombucha|cider|hot chocolate|horchata)\\b'
);

const DESSERT = rx(
  '\\b(cake|cookie|brownie|whoopie|cupcake|donut|doughnut|eclair|macaron)\\b',
  '\\b(ice cream|gelato|sorbet|pudding|mousse|cheesecake|tiramisu|cobbler|crumble)\\b',
  '\\b(candy|fudge|toffee|truffle|churro|baklava|rugelach|babka)\\b',
  '\\b(apple|cherry|pecan|pumpkin|banana cream|key lime|chocolate|lemon meringue)\\s+pie\\b'
);

const SOUP = rx('\\b(soup|bisque|chowder|broth|consomme|gazpacho|ramen broth)\\b');

// Dishes that already carry protein and carbohydrate together.
const COMPOSED = rx(
  '\\b(sandwich|wrap|burrito|taco|quesadilla|panini|melt|sub|hoagie|gyro|shawarma)\\b',
  '\\b(pizza|calzone|stromboli|burger|cheeseburger|hot dog|sloppy joe|grilled cheese)\\b',
  '\\b(lasagna|casserole|pot pie|shepherd\'?s pie|enchilada|paella|jambalaya|risotto)\\b',
  '\\b(lo mein|fried rice|pad thai|stir fry|stir-fry|bibimbap|poke bowl|burrito bowl)\\b',
  '\\b(mac and cheese|macaroni and cheese|baked ziti|spaghetti and meatballs)\\b'
);

const PROTEIN_NAME = rx(
  '\\b(chicken|turkey|beef|steak|pork|ham|bacon|sausages?|lamb|veal|brisket|meatballs?)\\b',
  '\\b(salmon|tuna|cod|tilapia|haddock|shrimp|crab|lobster|fish|scallop|anchov)\\b',
  '\\b(tofu|tempeh|seitan|edamame|falafel|paneer)\\b',
  '\\b(burgers?|patty|patties|kielbasa|gyro meat|shawarma)\\b',
  '\\b(egg|eggs|omelet|omelette|frittata|scrambled)\\b',
  '\\b(lentil|chickpea|garbanzo|black bean|kidney bean|pinto bean|hummus)\\b',
  '\\b(yogurt|greek yogurt|cottage cheese|skyr)\\b'
);

const GRAIN_NAME = rx(
  '\\b(rice|pasta|noodles?|spaghetti|penne|linguine|orzo|couscous|quinoa|farro|barley|bulgur)\\b',
  '\\b(cavatappi|rotini|rigatoni|fusilli|ziti|farfalle|macaroni|gnocchi|ravioli|tortellini)\\b',
  '\\b(banana bread|zucchini bread|oatmeal bar|granola bar)\\b',
  '\\b(bread|roll|bun|baguette|ciabatta|focaccia|pita|naan|tortilla|bagel|toast|biscuit)\\b',
  '\\b(potato|potatoes|fries|hash brown|tater)\\b',
  '\\b(oatmeal|oats|grits|polenta|granola|cereal|pancake|waffle|french toast|crepe)\\b',
  '\\b(muffins?|scones?|croissants?|danish|cornbread|garlic knots?|chips?|crackers?)\\b'
);

// Plurals throughout: "Roasted Beets" and "Whole Steamed Green Beans" were
// falling through to OTHER because the singular forms never matched.
const VEGETABLE_NAME = rx(
  '\\b(broccoli|cauliflower|carrots?|zucchini|squash|spinach|kale|collards?|chard|cabbage)\\b',
  '\\b(green beans?|brussels|asparagus|peppers?|onions?|mushrooms?|eggplant|okra|beets?|turnips?)\\b',
  '\\b(tomato(es)?|cucumbers?|lettuce|arugula|romaine|greens|celery|radish(es)?|peas?|corn|artichokes?)\\b',
  '\\b(ratatouille|succotash|coleslaw|slaw|vegetables?|veggies?)\\b',
  '\\bsalad\\b'
);

// Plural forms matter here: \bapple\b does not match "Apples", which is how
// whole fruit ended up classified as a grain.
const FRUIT_NAME = rx(
  '\\b(apples?|bananas?|oranges?|melons?|watermelons?|cantaloupes?|honeydew)\\b',
  '\\bgrapes?\\b(?!\\s*tomato)',
  '\\b(berry|berries|strawberr|blueberr|raspberr|blackberr|pineapples?|mangos?|papayas?)\\b',
  '\\b(kiwis?|peach|peaches|pears?|plums?|clementines?|mandarins?|apricots?)\\b',
  '\\bfruit\\b'
);

// A beverage worth putting on a plate carries real nutrition — milk or a
// protein smoothie, not black coffee or seltzer.
export function isNutritionalBeverage(item) {
  const n = item.nutrition ?? {};
  return (n.protein ?? 0) >= 5;
}

/**
 * Determine the role an item plays on a plate.
 * Order matters: the most disqualifying categories are tested first, so a
 * "Honey Balsamic Vinaigrette" is a condiment before its name can look fruity.
 */
export function classifyRole(item) {
  const name = (item?.name ?? '').trim();
  const n = item?.nutrition ?? {};
  const cal = n.calories ?? 0;
  const protein = n.protein ?? 0;
  const carbs = n.carbs ?? 0;
  const fiber = n.fiber ?? 0;
  const station = item?.station ?? '';

  if (!name) return ROLE.OTHER;

  if (CONDIMENT.test(name)) return ROLE.CONDIMENT;
  if (station === 'beverage' || BEVERAGE.test(name)) return ROLE.BEVERAGE;

  // Brandeis publishes some items with every macro at zero, which means the
  // nutrition is missing rather than that the food is empty. Trusting those
  // numbers demotes real food ("Turkey Bacon", 0cal) to a garnish, so fall
  // back to the name alone when there is nothing to weigh.
  const hasNutrition = cal > 0 || protein > 0 || carbs > 0;

  // Checked before the nutrition gate: these are toppings by identity, not by
  // portion size, and several carry no published nutrition at all.
  if (ALWAYS_GARNISH.test(name)) return ROLE.GARNISH;

  // A topping prefix only demotes an item when it brings little protein —
  // "Sliced Grilled Chicken" (29g) is a protein source, "Sliced Cucumbers" is not.
  if (hasNutrition && GARNISH_NAME.test(name) && protein < 8) return ROLE.GARNISH;

  if (DESSERT.test(name)) return ROLE.DESSERT;

  // Whole fruit is a real component even when it is light, so it is settled
  // before the small-portion rule below. Baked goods named after fruit
  // ("Banana Bread") are grain, so grain wins the name first.
  if (FRUIT_NAME.test(name) && !GRAIN_NAME.test(name)) return ROLE.FRUIT;

  // Anything trivially small is a topping regardless of what it is called.
  // Raw zucchini at 10 calories is not a vegetable serving.
  if (hasNutrition && cal < 40 && protein < 5) return ROLE.GARNISH;
  // The soup station also holds crackers and bread, so a grain name wins over
  // the station hint.
  if (SOUP.test(name) || (station === 'soup' && !GRAIN_NAME.test(name))) return ROLE.SOUP;

  // A bare roll or bun is bread, even though "hoagie" reads as a sandwich.
  const isBareBread = /\b(roll|bun|baguette|pita|tortilla|bagel)s?$/i.test(name) && protein < 12;

  // A composed dish carries protein AND carbohydrate. Without the carb test,
  // plain "Shawarma Beef" (25g protein, 1g carb) counts as a whole meal.
  // Carb data is unreliable for grill items (a grilled cheese is published at
  // 5g), so a substantial calorie count also qualifies.
  if (!isBareBread && COMPOSED.test(name) && protein >= 8 && (carbs >= 15 || cal >= 250)) {
    return ROLE.COMPOSED;
  }

  // Name is the strongest signal, but nutrition decides between close calls:
  // a "chicken caesar salad" with 30g protein is a protein dish, not a side salad.
  const looksProtein = PROTEIN_NAME.test(name);
  const looksVeg     = VEGETABLE_NAME.test(name);
  const looksGrain   = GRAIN_NAME.test(name);

  if (looksProtein && protein >= 8) return ROLE.PROTEIN;
  if (looksVeg && protein >= 15) return ROLE.PROTEIN;
  if (looksVeg) return ROLE.VEGETABLE;
  if (looksGrain && protein >= 20) return ROLE.PROTEIN;
  if (looksGrain) return ROLE.GRAIN;
  if (looksProtein) return ROLE.PROTEIN;

  // Unnamed fallbacks, decided purely on macros.
  if (protein >= 15) return ROLE.PROTEIN;
  if (fiber >= 4 && carbs < 25) return ROLE.VEGETABLE;
  if (carbs >= 20 && protein < 10) return ROLE.GRAIN;
  if (protein >= 8 && carbs >= 20) return ROLE.COMPOSED;

  return ROLE.OTHER;
}

// Roles are stable for an item, so cache by identity to avoid re-running the
// regex battery for every candidate on every scoring pass.
const roleCache = new WeakMap();

export function getRole(item) {
  if (!item || typeof item !== 'object') return ROLE.OTHER;
  if (roleCache.has(item)) return roleCache.get(item);
  const role = classifyRole(item);
  roleCache.set(item, role);
  return role;
}
