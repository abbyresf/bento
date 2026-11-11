import test from 'node:test';
import assert from 'node:assert/strict';
import { setupSteps } from '../src/components/Loud/setupSteps.js';
import { likedIdsFrom, withLikes, cleanLike } from '../src/components/Loud/likes.js';

test('just browsing: school, why, then the two optional steps, nothing about the body', () => {
  assert.deepEqual(setupSteps({ why: ['good'] }), ['university', 'why', 'swipe', 'likes']);
});

test('hit my goals or a sport asks the details and ends on the review of targets', () => {
  for (const why of [['goals'], ['sport']]) {
    assert.deepEqual(setupSteps({ why }), ['university', 'why', 'basics', 'activity', 'goals', 'swipe', 'likes', 'review']);
  }
});

test('skipping the details drops them and the review, so the starter target is used', () => {
  assert.deepEqual(setupSteps({ why: ['goals'], detailsSkipped: true }), ['university', 'why', 'swipe', 'likes']);
});

test('eat safely asks restrictions, and the study question stays on the iPhone app', () => {
  assert.deepEqual(setupSteps({ why: ['safe'], research: true }), ['university', 'why', 'dietary', 'swipe', 'likes', 'study']);
});

const menu = { locations: { usdan: { meals: { lunch: [
  { id: 'a', name: 'Grilled Chicken Breast' }, { id: 'b', name: 'Hamburger' }, { id: 'c', name: 'Ham and Cheese' },
  { id: 'd', name: 'Chicken Tenders' }, { id: 'e', name: 'Rice Bowls' },
] } } } };

test('a typed food matches whole words and plurals, not parts of other words', () => {
  assert.deepEqual([...likedIdsFrom(menu, ['chicken'])].sort(), ['a', 'd']);
  assert.deepEqual([...likedIdsFrom(menu, ['ham'])], ['c']);
  assert.deepEqual([...likedIdsFrom(menu, ['rice bowl'])], ['e']);
  assert.equal(likedIdsFrom(menu, []).size, 0);
});

test('a liked dish counts as 4 stars, but the student own rating always wins', () => {
  const merged = withLikes(new Map([['a', 1]]), new Set(['a', 'd']));
  assert.equal(merged.get('a'), 1);
  assert.equal(merged.get('d'), 4);
  assert.equal(cleanLike('   fried   rice  '), 'fried rice');
});
