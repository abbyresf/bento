/* Which dishes may be suggested to a student, used by Mystery plate.
 *
 * The meal plan's own check (passesHardRestrictions) treats a dish with no allergen list as having none.
 * That is right for a plan the student can read, and wrong for a dish picked for two people. This wrapper
 * fails closed: a dish with no allergen data is left out for anyone with an allergy, and a dish with no tag
 * data is left out for anyone on a vegetarian, vegan, gluten-free or kosher diet. The same rule runs on the
 * server for a buddy (duo_compatible_items, migration 050), and a shared test file holds both together.
 * Labels only: Bento cannot see cross-contact in the kitchen. */
import { passesHardRestrictions } from '../utils/mealOptimizer.js';

const ALLERGEN_KEYS = ['milk', 'eggs', 'wheat', 'soy', 'fish', 'shellfish', 'treeNuts', 'peanuts', 'sesame'];

export function hasAllergy(restrictions = {}) {
  return ALLERGEN_KEYS.some((k) => restrictions[k]) || (restrictions.allergies ?? []).length > 0;
}
export function hasTagDiet(restrictions = {}) {
  return Boolean(restrictions.vegetarian || restrictions.vegan || restrictions.glutenFree || restrictions.kosher);
}

export function passesFailClosed(item, restrictions = {}) {
  if (!item) return false;
  if (hasAllergy(restrictions) && !Array.isArray(item.allergens)) return false;
  if (hasTagDiet(restrictions) && !Array.isArray(item.tags)) return false;
  return passesHardRestrictions({ ...item, tags: item.tags ?? [], allergens: item.allergens ?? [], ingredients: item.ingredients ?? [] }, restrictions);
}
