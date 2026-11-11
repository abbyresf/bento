import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNextMeal, countdown } from '../src/components/Loud/heroTiming.js';

const at = (h, m = 0) => new Date(2026, 10, 10, h, m);
const day = (over = {}) => ['breakfast', 'lunch', 'dinner'].map((meal, i) => ({
  meal,
  active: true,
  confirmed: false,
  hours: [{ start: 7, end: 10 }, { start: 11, end: 14 }, { start: 17, end: 20 }][i],
  ...(over[meal] ?? {}),
}));

test('the hero shows the meal that is open now', () => {
  assert.equal(pickNextMeal(day(), at(12)).meal, 'lunch');
});

test('a meal already eaten is skipped', () => {
  assert.equal(pickNextMeal(day({ lunch: { confirmed: true } }), at(12)).meal, 'dinner');
});

test('between meals the hero points at the next one, which is not open yet', () => {
  const next = pickNextMeal(day(), at(15));
  assert.equal(next.meal, 'dinner');
  assert.ok(15 < next.hours.start);
});

test('a skipped breakfast or a dinner out never shows', () => {
  assert.equal(pickNextMeal(day({ breakfast: { active: false } }), at(8)).meal, 'lunch');
  assert.equal(pickNextMeal(day({ dinner: { active: false } }), at(15)), null);
});

test('after the last meal ends the day is done', () => {
  assert.equal(pickNextMeal(day(), at(21)), null);
});

test('the countdown reads in hours and minutes, never negative', () => {
  assert.equal(countdown(17, at(14, 46)), '2h 14m');
  assert.equal(countdown(17, at(16, 30)), '30m');
  assert.equal(countdown(17, at(18)), '0m');
});

import { REACTIONS, reactionFor } from '../src/components/Loud/reactions.js';

test('the three choices save as 1, 3 and 5 stars, best on the right', () => {
  assert.deepEqual(REACTIONS.map((r) => r.stars), [1, 3, 5]);
  assert.deepEqual(REACTIONS.map((r) => r.label), ['Not good', 'Fine', 'Loved it']);
});

test('an older star rating shows on the nearest choice, and no rating shows none', () => {
  assert.deepEqual([0, null, 1, 2, 3, 4, 5].map(reactionFor), [0, 0, 1, 1, 3, 5, 5]);
});
