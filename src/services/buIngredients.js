/* Reads a dish's ingredient list and checks it against what BU labels.
 *
 * BU labels allergens and diets by hand, and its own notice says the page may lag a recipe change. So every
 * dish's ingredient text is scanned here as a second opinion:
 *
 *   - an allergen found in the ingredients is added to the dish, whether or not BU labeled it;
 *   - a diet tag (vegan, vegetarian, gluten-free, halal) the ingredients contradict is removed.
 *
 * It only ever makes a dish stricter. It never adds a diet tag and never clears an allergen BU labeled, so a
 * mistake here can hide a dish from someone, never offer one to someone it would hurt.
 *
 * The scan is deliberately on the side of caution. It reads the whole ingredient text, including what is
 * nested in brackets ("Sauce (water, soy, wheat)"). Plant versions of dairy, egg and meat ("oat milk", "vegan
 * mayonnaise", "plant-based chorizo") are recognized first, so a vegan dish is not thrown out for its
 * lookalikes. "Made in a facility that processes egg" is a cross-contact note, not an ingredient: it is kept
 * apart as `mayContain` and never filters a dish. Allergen names match the app's filter
 * (mealOptimizer STRUCTURED_ALLERGENS): milk, eggs, wheat, soy, fish, shellfish, tree nuts, peanuts, sesame. */

// "Contains no peanuts or tree nuts" and warnings aimed at allergic readers say the opposite of an ingredient.
const NEGATION = /contains?\s+no\s[^.\])]*|(?:free\s+(?:of|from)|does\s+not\s+contain|not\s+made\s+with)\s[^.\])]*|people\s+with[^.]*\./gi;

const PRECAUTION = /(?:made|processed|manufactured|produced|packaged|prepared)\s+(?:in|on)\s+(?:a\s+|the\s+|shared\s+)?(?:facility|equipment|line|plant)[^.\])]*|may\s+contain[^.\])]*|contains?\s+traces[^.\])]*/gi;

// Plant-based lookalikes, taken out before the dairy, egg and meat checks.
const PLANT = '(?:oat|almond|soy|soya|coconut|rice|cashew|pea|hemp|flax|macadamia|plant[- ]based|plant|vegan|non[- ]?dairy|dairy[- ]free|egg[- ]free|meatless|meat[- ]free|veggie|vegetarian|imitation|faux)';
const NOT_MILK = new RegExp(`${PLANT}\\s+(?:[a-z-]+\\s+){0,3}(?:milk|cream|creamer|cheese|cheddar|mozzarella|parmesan|butter|yogurt|yoghurt|ice cream|margarine|spread)|cocoa butter|shea butter|peanut butter|almond butter|nut butter|sunflower(?: seed)? butter|apple butter|butternut|butter bean|butter lettuce|cream of tartar|coconut cream|cream of coconut|cream of (?:rice|wheat)|swiss chard|(?:cheddar|mozzarella|parmesan|cream cheese|swiss|provolone|feta|cheese|butter|yogurt|milk)[- ]style(?: (?:cheese|cheddar|mozzarella|shreds?|butter|spread))?`, 'g');
const NOT_EGG = new RegExp(`eggplant|${PLANT}\\s+(?:[a-z-]+\\s+){0,2}(?:eggs?|mayonnaise|mayo|aioli)`, 'g');
const NOT_MEAT = new RegExp(`${PLANT}\\s+(?:[a-z-]+\\s+){0,3}(?:chicken|beef|pork|bacon|ham|turkey|sausage|chorizo|meatball|meat|crumbles?|jerky|pepperoni|burger|patty)`, 'g');
const NOT_WHEAT = /(?:rice|corn|almond|coconut|chickpea|garbanzo|oat|tapioca|potato|cassava|sorghum|buckwheat|masa|soy|pea|quinoa|amaranth|teff|lentil|arrowroot|gluten[- ]free)\s+(?:[a-z-]+\s+){0,1}(?:flour|bread|pasta|noodles?|breadcrumbs?)|gluten[- ]free\s+(?:[a-z-]+\s+){0,2}(?:soy sauce|tamari)|rice noodles?|rice vermicelli|rice paper|buckwheat/g;
const NOT_CHESTNUT = /water chestnuts?/g;
// Highly refined soybean oil is exempt from allergen labeling and is in most fried and sauteed dishes. It is not read as soy.
const NOT_SOY_OIL = /(?:refined\s+)?(?:soybean|soy|soya)\s+oil|soybeans?\s+and\s*\/\s*or/g;
const NOT_STEAK = /steak (?:seasoning|spice|sauce|rub)|beyond meat|impossible meat/g;
const NOT_PORK = /(?:turkey|beef|chicken|plant[- ]based|vegan|veggie|coconut|tempeh|mushroom) (?:bacon|ham)/g;
const NOT_ALCOHOL = /\b(?:[a-z]+\s+){0,2}(?:wine|sherry) vinegar\b/g;

const MILK = /\b(?:milk|cream|butter|buttermilk|cheese|cheddar|mozzarella|parmesan|parmigiano|romano|ricotta|feta|provolone|gouda|swiss|brie|mascarpone|paneer|yogurt|yoghurt|kefir|whey|casein|caseinate|lactose|ghee|custard|ice cream|gelato|half[- ]and[- ]half|creme fraiche|sour cream|milkfat|curds?)\b/;
const EGG = /\b(?:eggs?|albumen|ovalbumin|meringue|mayonnaise|mayo|aioli|hollandaise|lysozyme)\b/;
const TREE_NUT = /\b(?:almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|filberts?|macadamias?|brazil nuts?|pine nuts?|pignoli|pinon|chestnuts?|praline|marzipan|nutella|gianduja|nuts?|tree nuts?)\b/;
const PEANUT = /\b(?:peanuts?|groundnuts?|arachis)\b/;
const FISH = /\b(?:fish|salmon|tuna|cod|tilapia|anchov(?:y|ies)|haddock|trout|halibut|mahi|pollock|sardines?|mackerel|catfish|swordfish|snapper|herring|bass|flounder|perch|eel|surimi|bonito|katsuobushi|dashi|worcestershire)\b/;
const SHELLFISH = /\b(?:shrimps?|prawns?|crabs?|lobsters?|crawfish|crayfish|clams?|mussels?|oysters?|scallops?|shellfish|krill|squid|calamari|octopus|abalone|escargot)\b/;
const SESAME = /\b(?:sesame|tahini|benne|gomashio|gomasio)\b/;
const SOY = /\b(?:soy|soya|soybeans?|tofu|tempeh|edamame|miso|tamari|shoyu|natto)\b/;
const WHEAT = /\b(?:wheat|flour|semolina|durum|farina|couscous|bread|breadcrumbs?|panko|pasta|noodles?|spelt|bulgur|seitan|farro|kamut|matzo|crackers?|soy sauce|teriyaki)\b/;

// Gluten reaches beyond wheat.
const GLUTEN_EXTRA = /\b(?:barley|rye|malt|malted|triticale|beer)\b/;
const MEAT = /\b(?:chicken|beef|pork|bacon|ham|turkey|sausage|salami|pepperoni|prosciutto|pancetta|lamb|veal|duck|bologna|chorizo|steak|meatballs?|meat|lard|tallow|gelatin|gelatine|bone broth|(?:chicken|beef|pork|turkey|ham)\s+(?:broth|stock|base|fat))\b/;
const ANIMAL_OTHER = /\b(?:honey|beeswax|carmine|cochineal|whey|casein|caseinate|lactose|ghee)\b/;
// Pepperoni, salami and chorizo come in beef and halal versions, so they are not read as pork unless the text says so.
const PORK = /\b(?:pork|bacon|ham|prosciutto|pancetta|lard)\b/;
const ALCOHOL = /\b(?:wine|beer|rum|bourbon|whiskey|whisky|vodka|brandy|sherry|sake|mirin|liqueur|cognac|marsala|vermouth|tequila|gin)\b/;

const has = (re, text) => re.test(text);
const strip = (text, ...res) => res.reduce((t, re) => t.replace(re, ' '), text);

/* What the ingredient text says. `text` is the raw ingredient string. */
export function scanIngredients(text = '') {
  const raw = String(text).toLowerCase().replace(/\s+/g, ' ');
  const mayContainText = (raw.match(PRECAUTION) ?? []).join(' ');
  const main = raw.replace(PRECAUTION, ' ').replace(NEGATION, ' ');

  const milkText = strip(main, NOT_MILK);
  const eggText = strip(main, NOT_EGG);
  const meatText = strip(main, NOT_MEAT, NOT_STEAK);
  const porkText = strip(main, NOT_MEAT, NOT_PORK);
  const wheatText = strip(main, NOT_WHEAT);
  const nutText = strip(main, NOT_CHESTNUT);
  const alcoholText = strip(main, NOT_ALCOHOL);

  const allergens = [];
  const why = {};
  const add = (name, re, haystack) => {
    const m = haystack.match(re);
    if (m) { allergens.push(name); why[name] = m[0]; }
  };
  add('milk', MILK, milkText);
  add('eggs', EGG, eggText);
  add('wheat', WHEAT, wheatText);
  add('soy', SOY, strip(main, NOT_SOY_OIL));
  add('fish', FISH, main);
  add('shellfish', SHELLFISH, main);
  add('tree nuts', TREE_NUT, nutText);
  add('peanuts', PEANUT, main);
  add('sesame', SESAME, main);

  const meatHit = meatText.match(MEAT);
  const meat = Boolean(meatHit);
  if (meatHit) why.meat = meatHit[0];
  const glutenHit = wheatText.match(GLUTEN_EXTRA);
  if (glutenHit) why.gluten = glutenHit[0];
  const porkHit = porkText.match(PORK);
  if (porkHit) why.pork = porkHit[0];
  const alcoholHit = alcoholText.match(ALCOHOL);
  if (alcoholHit) why.alcohol = alcoholHit[0];
  const fishy = allergens.includes('fish') || allergens.includes('shellfish');
  const animalOther = has(ANIMAL_OTHER, milkText);

  const mayContain = [];
  for (const [name, re] of [['milk', MILK], ['eggs', EGG], ['wheat', WHEAT], ['soy', SOY], ['fish', FISH], ['shellfish', SHELLFISH], ['tree nuts', TREE_NUT], ['peanuts', PEANUT], ['sesame', SESAME]]) {
    if (has(re, mayContainText)) mayContain.push(name);
  }

  return {
    allergens,
    why,
    mayContain,
    // True when the ingredients rule the diet out.
    breaks: {
      vegetarian: meat || fishy,
      vegan: meat || fishy || allergens.includes('milk') || allergens.includes('eggs') || animalOther,
      glutenFree: allergens.includes('wheat') || has(GLUTEN_EXTRA, wheatText),
      halal: has(PORK, porkText) || has(ALCOHOL, alcoholText),
    },
  };
}

/* Applies the scan to a dish: BU's labels plus what the ingredients say.
   Returns { allergens, tags, check } where `check` lists what changed (empty when the labels held up). */
export function reconcileDish({ allergens: labeled = [], tags: labeledTags = [] }, ingredientText) {
  const scan = scanIngredients(ingredientText);
  const allergens = [...new Set([...labeled, ...scan.allergens])];
  const addedAllergens = scan.allergens.filter((a) => !labeled.includes(a));

  const tags = new Set(labeledTags);
  const removedTags = [];
  const drop = (tag) => { if (tags.delete(tag)) removedTags.push(tag); };
  if (scan.breaks.vegan) drop('vegan');
  if (scan.breaks.vegetarian) { drop('vegetarian'); drop('vegan'); }
  if (scan.breaks.glutenFree) drop('glutenFree');
  if (scan.breaks.halal) drop('halal');

  const check = {};
  if (addedAllergens.length) check.addedAllergens = addedAllergens;
  if (removedTags.length) check.removedTags = removedTags;
  // The words that decided it, so a person can see why a label changed.
  const why = {};
  for (const a of addedAllergens) why[a] = scan.why[a];
  for (const t of removedTags) why[`not ${t}`] = scan.why.meat ?? scan.why.milk ?? scan.why.eggs ?? scan.why.fish ?? scan.why.shellfish ?? scan.why.pork ?? scan.why.alcohol ?? scan.why.wheat ?? scan.why.gluten ?? 'animal ingredient';
  if (Object.keys(why).length) check.why = why;
  if (scan.mayContain.length) check.mayContain = scan.mayContain;
  return { allergens, tags: [...tags], check };
}
