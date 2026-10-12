/* The dishes Mystery plate may offer: everything served today, once each, with where and when.
 * Only dishes that make a meal (protein, composed, vegetable, grain). Sauces, toppings and drinks are left out. */
import { getRole, ROLE } from '../utils/foodRoles.js';

const DISH_ROLES = new Set([ROLE.PROTEIN, ROLE.COMPOSED, ROLE.VEGETABLE, ROLE.GRAIN]);
const ROLE_ORDER = { [ROLE.PROTEIN]: 0, [ROLE.COMPOSED]: 1, [ROLE.VEGETABLE]: 2, [ROLE.GRAIN]: 3 };
const MEALS = ['breakfast', 'lunch', 'dinner'];

export function dishesFromMenu(menu) {
  const seen = new Map();
  for (const loc of Object.values(menu?.locations ?? {})) {
    for (const meal of MEALS) {
      for (const item of loc.meals?.[meal] ?? []) {
        if (!item?.id || seen.has(item.id) || !DISH_ROLES.has(getRole(item))) continue;
        seen.set(item.id, { ...item, hall: loc.shortName ?? loc.name, mealName: meal });
      }
    }
  }
  return [...seen.values()].sort((a, b) =>
    ROLE_ORDER[getRole(a)] - ROLE_ORDER[getRole(b)] || a.name.localeCompare(b.name)).slice(0, 150);
}

