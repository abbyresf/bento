// node --test test/mascotOutfits.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { OUTFITS, isUnlocked, unlockHint, validOutfit, unlockProgress, closetOrder } from '../src/data/mascotOutfits.js';

const by = (id) => OUTFITS.find((o) => o.id === id);

test('the free piece is always unlocked', () => {
  assert.equal(isUnlocked(by('gradcap'), {}), true);
});

test('streak pieces use the LONGEST streak, so a lapse never takes one away', () => {
  assert.equal(isUnlocked(by('sunglasses'), { longestStreak: 6 }), false);
  assert.equal(isUnlocked(by('sunglasses'), { longestStreak: 7 }), true);
  assert.equal(isUnlocked(by('cape'), { longestStreak: 99 }), false);
  assert.equal(isUnlocked(by('cape'), { longestStreak: 100 }), true);
});

test('rating pieces use the number of dishes rated', () => {
  assert.equal(isUnlocked(by('sprout'), { dishesRated: 4 }), false);
  assert.equal(isUnlocked(by('sprout'), { dishesRated: 5 }), true);
});

test('missing numbers count as zero and never throw', () => {
  assert.equal(isUnlocked(by('crown'), undefined), false);
  assert.equal(isUnlocked(by('crown'), { longestStreak: null }), false);
});

test('a quest piece unlocks only for its own quest', () => {
  const q = { id: 'x', name: 'X', slot: 'head', unlock: { type: 'quest', id: 'explore3' } };
  assert.equal(isUnlocked(q, { questsDone: ['explore3'] }), true);
  assert.equal(isUnlocked(q, { questsDone: ['other'] }), false);
});

test('a saved piece that is locked or unknown is not worn', () => {
  assert.equal(validOutfit('crown', { longestStreak: 5 }), null);
  assert.equal(validOutfit('nope', { longestStreak: 500 }), null);
  assert.equal(validOutfit('crown', { longestStreak: 60 }), 'crown');
});

test('hints say what to do, with no guilt, dashes or semicolons', () => {
  for (const item of OUTFITS) {
    const h = unlockHint(item, { longestStreak: 2, dishesRated: 3 });
    assert.ok(!h.includes('—') && !h.includes(';'), h);
    for (const banned of ['miss', 'lost', 'fail', 'only', 'still']) assert.ok(!h.toLowerCase().includes(banned), h);
  }
  assert.equal(unlockHint(by('sunglasses'), { longestStreak: 6 }), 'One more day of streak');
});

test('ids are unique', () => {
  assert.equal(new Set(OUTFITS.map((o) => o.id)).size, OUTFITS.length);
});

test('the closet lists earned pieces first, then locked ones nearest to unlocking', () => {
  const ctx = { longestStreak: 12, dishesRated: 2, questsClaimed: 0 };
  const ids = closetOrder(OUTFITS, ctx).map((o) => o.id);
  // earned: gradcap (free), headband (3 days), sunglasses (7 days), in listed order
  assert.deepEqual(ids.slice(0, 3), ['gradcap', 'headband', 'sunglasses']);
  // locked, by progress: chefhat 12/14 first, sprout 2/5 and partyhat 12/30 tie at .4
  // and keep listed order, then crown, scarf, cape, then the two with no progress
  assert.deepEqual(ids.slice(3), ['chefhat', 'sprout', 'partyhat', 'crown', 'scarf', 'cape', 'bowtie', 'flower']);
});

test('with nothing earned yet only the free piece is first', () => {
  const ids = closetOrder(OUTFITS, {}).map((o) => o.id);
  assert.equal(ids[0], 'gradcap');
  assert.equal(ids.length, OUTFITS.length);
});

test('earned pieces always come before locked ones, and earning one loses none', () => {
  for (const longestStreak of [0, 3, 7, 14, 59, 60, 100]) {
    const ctx = { longestStreak, dishesRated: 6, questsClaimed: 3 };
    const order = closetOrder(OUTFITS, ctx);
    const flags = order.map((o) => isUnlocked(o, ctx));
    const firstLocked = flags.indexOf(false);
    if (firstLocked !== -1) assert.equal(flags.slice(firstLocked).includes(true), false, `streak ${longestStreak}`);
    assert.equal(order.length, OUTFITS.length);
  }
  const before = closetOrder(OUTFITS, { longestStreak: 59 }).map((o) => o.id);
  const after = closetOrder(OUTFITS, { longestStreak: 60 }).map((o) => o.id);
  // the piece about to be earned is already the first locked tile, so it holds its place
  assert.equal(after.indexOf('crown') <= before.indexOf('crown'), true);
  assert.deepEqual([...before].sort(), [...after].sort());
});

test('progress is a fraction and unlocked pieces are 1', () => {
  assert.equal(unlockProgress(by('gradcap'), {}), 1);
  assert.equal(unlockProgress(by('crown'), { longestStreak: 30 }), 0.5);
  assert.equal(unlockProgress(by('crown'), { longestStreak: 600 }), 1);
  assert.equal(unlockProgress(by('crown'), undefined), 0);
});
