/* Bento plate: whether a confirmed meal has a protein, a vegetable and a grain. Used before "I did it" is sent, so the tap is
 * an honest one. The database only checks that a meal was confirmed (the roles are worked out here, from the dish names).
 * A composed dish (a wrap, a bowl) counts as both a protein and a grain, because it already combines them. */
import { getRole, ROLE } from '../utils/foodRoles.js';

export function isBentoPlate(items) {
  const roles = new Set((Array.isArray(items) ? items : []).map((i) => getRole(i)));
  const protein = roles.has(ROLE.PROTEIN) || roles.has(ROLE.COMPOSED);
  const grain = roles.has(ROLE.GRAIN) || roles.has(ROLE.COMPOSED);
  return protein && grain && roles.has(ROLE.VEGETABLE);
}
