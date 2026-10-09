/* Which items of the bento box are in the box at each level.
 *
 * The drawing is in components/Badges/BentoBox.jsx and the art in data/badgeArt.js (generated
 * from the original illustration). This is only the table, kept apart so it can be tested: what
 * arrives at each level and in what order things are painted, so a later piece can sit in front
 * of an earlier one (the cup is painted before the oranges that lean on it).
 *
 * Levels run 0 (the empty tray) to 10 (the full box) and match `fill` in data/badges.js.
 * The first mound of rice at level 1 becomes the whole packed rice at level 2, so the mound
 * shows at level 1 only. `z` is the paint order, back to front. */
export const PIECES = [
  { name: 'mound',    arrives: 1,  until: 1,  z: 10 },
  { name: 'rice',     arrives: 2,  until: 10, z: 10 },
  { name: 'nori',     arrives: 2,  until: 10, z: 12 },
  { name: 'leaf',     arrives: 3,  until: 10, z: 14 },
  { name: 'plum',     arrives: 9,  until: 10, z: 16 },
  { name: 'edamame',  arrives: 3,  until: 10, z: 20 },
  { name: 'broccoli', arrives: 4,  until: 10, z: 22 },
  { name: 'tamago',   arrives: 5,  until: 10, z: 30 },
  { name: 'skewer',   arrives: 6,  until: 10, z: 32 },
  { name: 'cup',      arrives: 8,  until: 10, z: 34 },
  { name: 'oranges',  arrives: 7,  until: 10, z: 36 },
  { name: 'fish',     arrives: 9,  until: 10, z: 38 },
  { name: 'cherry',   arrives: 7,  until: 10, z: 40 },
  { name: 'chop',     arrives: 10, until: 10, z: 50 },
  { name: 'steam',    arrives: 10, until: 10, z: 60 },
];

export const MAX_LEVEL = 10;

export function clampLevel(level) {
  const n = Math.floor(Number(level));
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_LEVEL, n)) : 0;
}

/* Pieces in the box at a level, back to front. */
export function piecesAt(level) {
  const lv = clampLevel(level);
  return PIECES.filter((p) => lv >= p.arrives && lv <= p.until).sort((a, b) => a.z - b.z);
}

/* What the next level adds, shown faintly as a hint. Empty once the box is full. */
export function ghostPieces(level) {
  const lv = clampLevel(level);
  return lv >= MAX_LEVEL ? [] : PIECES.filter((p) => p.arrives === lv + 1).sort((a, b) => a.z - b.z);
}

/* What arrived at exactly this level, for the drop-in animation. */
export function arrivedAt(level) {
  const lv = clampLevel(level);
  return PIECES.filter((p) => p.arrives === lv).map((p) => p.name);
}
