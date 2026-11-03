import { getRole, ROLE } from './foodRoles.js';

/* Which drawing stands for a dish in the bento box. About fifteen glyphs cover the menu: the role the planner already works
 * out (protein, grain, vegetable and so on) picks the family, and the name picks within it, so salmon is a fish and a burger
 * is a drumstick. Pure, so the mapping is tested without a screen. */
const has = (name, re) => re.test(name);

export function glyphFor(item) {
  const name = String(item?.name ?? '').toLowerCase();
  if (has(name, /\b(salmon|cod|tuna|fish|shrimp|haddock|tilapia|sushi|scallop|crab|lobster|calamari)\b/)) return 'fish';
  if (has(name, /\b(egg|eggs|omelet|omelette|frittata|quiche)\b/)) return 'egg';
  if (has(name, /\b(pizza|burger|sandwich|wrap|taco|burrito|quesadilla|muffin|bagel|toast|waffle|pancake|croissant|bun|sub)\b/)) return 'bread';
  if (has(name, /\b(tofu|tempeh|edamame)\b/)) return 'tofu';
  if (has(name, /\b(yogurt|yoghurt|milk|cheese|parfait|cottage)\b/)) return 'dairy';

  const role = getRole(item);
  switch (role) {
    case ROLE.PROTEIN:
      return 'drumstick';
    case ROLE.GRAIN:
      if (has(name, /\b(pasta|noodle|noodles|mac|macaroni|spaghetti|penne|ramen|lasagna|ziti|linguine)\b/)) return 'pasta';
      if (has(name, /\b(bread|toast|bagel|bun|roll|pizza|wrap|sandwich|pita|naan|flatbread|waffle|pancake|muffin|croissant)\b/)) return 'bread';
      return 'rice';
    case ROLE.VEGETABLE:
      return has(name, /\b(broccoli|cauliflower|florets?)\b/) ? 'broccoli' : 'leaf';
    case ROLE.FRUIT:
      return 'fruit';
    case ROLE.SOUP:
      return 'soup';
    case ROLE.DESSERT:
      return 'cookie';
    case ROLE.BEVERAGE:
      return 'cup';
    case ROLE.COMPOSED:
      if (has(name, /\b(pasta|noodle|noodles|mac|spaghetti|ramen|lasagna)\b/)) return 'pasta';
      if (has(name, /\b(burger|sandwich|wrap|pizza|taco|burrito|quesadilla|sub)\b/)) return 'bread';
      if (has(name, /\b(chicken|beef|pork|turkey|steak|meatball)\b/)) return 'drumstick';
      return 'bowl';
    default:
      if (has(name, /\b(chicken|beef|pork|turkey|steak|meatball|sausage|bacon|ham|wings|tenders)\b/)) return 'drumstick';
      if (has(name, /\b(rice|quinoa|couscous|oats|oatmeal|cereal|grits)\b/)) return 'rice';
      if (has(name, /\b(salad|lettuce|greens|spinach|kale)\b/)) return 'leaf';
      return 'bowl';
  }
}

/* The few glyphs shown inside one compartment: the structural dishes first (what makes it a meal), no repeats, at most
 * `max`. A plate of five items still fits a compartment, and the same glyph is never drawn twice. */
export function glyphsFor(items = [], max = 3) {
  const out = [];
  for (const item of items) {
    const g = glyphFor(item);
    if (!out.includes(g)) out.push(g);
    if (out.length >= max) break;
  }
  return out;
}
