/* Bento's closet.
 *
 * Every piece is cosmetic and nothing here touches what or how much anyone
 * eats. Pieces unlock from showing up (streak days) and from taking part
 * (dishes rated), never from hitting a calorie or macro number.
 *
 * Unlocks are DERIVED from numbers the app already keeps, the longest streak and
 * the count of dishes rated, so nothing has to be stored per unlock and nothing
 * can drift. Only which piece is worn is saved.
 *
 * Weekly quests grant pieces by how many have been claimed in total
 * ({ type: 'quests', value }). A single-quest rule, { type: 'quest', id }, is
 * also supported.
 *
 * `slot` decides how it draws: 'head' sits on top, 'face' over the eyes, 'neck'
 * around the middle, 'back' behind the body. One piece is worn at a time. */
export const OUTFITS = [
  { id: 'gradcap',    name: 'Grad cap',    slot: 'head', unlock: null },
  { id: 'headband',   name: 'Headband',    slot: 'head', unlock: { type: 'streak', value: 3 } },
  { id: 'sunglasses', name: 'Shades',      slot: 'face', unlock: { type: 'streak', value: 7 } },
  { id: 'sprout',     name: 'Sprout',      slot: 'head', unlock: { type: 'rated',  value: 5 } },
  { id: 'scarf',      name: 'Scarf',       slot: 'neck', unlock: { type: 'rated',  value: 15 } },
  { id: 'chefhat',    name: 'Chef hat',    slot: 'head', unlock: { type: 'streak', value: 14 } },
  { id: 'partyhat',   name: 'Party hat',   slot: 'head', unlock: { type: 'streak', value: 30 } },
  { id: 'crown',      name: 'Crown',       slot: 'head', unlock: { type: 'streak', value: 60 } },
  { id: 'cape',       name: 'Cape',        slot: 'back', unlock: { type: 'streak', value: 100 } },
  { id: 'bowtie',     name: 'Bow tie',     slot: 'neck', unlock: { type: 'quests', value: 3 } },
  { id: 'flower',     name: 'Flower',      slot: 'head', unlock: { type: 'quests', value: 9 } },
  // Halloween 2026 launch gift (migration 065). A new account picks one of the two. They stay out of the closet for
  // everyone who has not been given one, so nobody sees a locked tile for something they can no longer earn.
  { id: 'batwings',   name: 'Bat wings',   slot: 'back', unlock: { type: 'gift', piece: 'batwings' }, hidden: true },
  { id: 'pumpkin',    name: 'Pumpkin hat', slot: 'head', unlock: { type: 'gift', piece: 'pumpkin' },  hidden: true },
];

export const OUTFIT_IDS = OUTFITS.map((o) => o.id);

/* ctx: { longestStreak, dishesRated, questsClaimed } with missing values as zero.
 * questsClaimed is how many weekly quests have been claimed in total. */
export function isUnlocked(item, ctx = {}) {
  const u = item.unlock;
  if (!u) return true;
  if (u.type === 'streak') return (ctx.longestStreak ?? 0) >= u.value;
  if (u.type === 'rated')  return (ctx.dishesRated ?? 0) >= u.value;
  if (u.type === 'quests') return (ctx.questsClaimed ?? 0) >= u.value;
  if (u.type === 'quest')  return (ctx.questsDone ?? []).includes(u.id);
  if (u.type === 'gift')   return (ctx.gifts ?? []).includes(u.piece);
  return false;
}

/* The pieces the closet lists for this student: every normal piece, and an event gift only once it is theirs. */
export function visibleOutfits(items, ctx = {}) {
  return items.filter((item) => !item.hidden || isUnlocked(item, ctx));
}

/* The line shown on a locked piece. Says what to do, never what was missed. */
export function unlockHint(item, ctx = {}) {
  const u = item.unlock;
  if (!u) return '';
  if (u.type === 'streak') {
    const left = Math.max(0, u.value - (ctx.longestStreak ?? 0));
    return left === 1 ? 'One more day of streak' : `${u.value}-day streak`;
  }
  if (u.type === 'rated') {
    const left = Math.max(0, u.value - (ctx.dishesRated ?? 0));
    return left === 1 ? 'Rate one more dish' : `Rate ${u.value} dishes`;
  }
  if (u.type === 'quests') {
    const left = Math.max(0, u.value - (ctx.questsClaimed ?? 0));
    return left === 1 ? 'Claim one more quest' : `Claim ${u.value} quests`;
  }
  if (u.type === 'quest') return 'Finish a quest';
  if (u.type === 'gift')  return 'Launch week gift';
  return '';
}

/* How far along a piece is, from 0 to 1. A piece that is unlocked is 1. Used to
 * put the piece closest to being earned at the top of the locked ones. */
export function unlockProgress(item, ctx = {}) {
  const u = item.unlock;
  if (!u || isUnlocked(item, ctx)) return 1;
  const have = u.type === 'streak' ? (ctx.longestStreak ?? 0)
    : u.type === 'rated' ? (ctx.dishesRated ?? 0)
    : u.type === 'quests' ? (ctx.questsClaimed ?? 0)
    : 0;
  return u.value ? Math.min(1, Math.max(0, have / u.value)) : 0;
}

/* The order the closet shows. Earned pieces first, in the order they are listed
 * above, which is roughly the order a student earns them. Then the locked ones,
 * nearest to unlocking first, so the next goal is always the first locked tile.
 * Ties keep the listed order. */
export function closetOrder(items, ctx = {}) {
  return items
    .map((item, index) => ({ item, index, open: isUnlocked(item, ctx), progress: unlockProgress(item, ctx) }))
    .sort((a, b) => (b.open - a.open) || (a.open ? 0 : b.progress - a.progress) || (a.index - b.index))
    .map((x) => x.item);
}

// A saved id that no longer exists, or is not unlocked, falls back to nothing
// worn rather than showing a piece the student has not earned.
export function validOutfit(id, ctx) {
  const item = OUTFITS.find((o) => o.id === id);
  return item && isUnlocked(item, ctx) ? item.id : null;
}
