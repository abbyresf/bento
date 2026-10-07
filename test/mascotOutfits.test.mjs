// node --test test/mascotOutfits.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { OUTFITS, isUnlocked, unlockHint, validOutfit } from '../src/data/mascotOutfits.js';

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
