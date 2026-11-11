import test from 'node:test';
import assert from 'node:assert/strict';
import { streakStyle, streakLine, STREAK_STYLES } from '../src/components/Loud/streakStyle.js';

test('the four looks take turns, so two days in a row never match', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(streakStyle), ['stripes', 'dots', 'confetti', 'gradient', 'stripes']);
  for (let d = 1; d < 60; d++) assert.notEqual(streakStyle(d), streakStyle(d + 1));
  assert.equal(STREAK_STYLES.length, 4);
  assert.equal(streakStyle(0), 'stripes');
});

test('milestones get their own line', () => {
  assert.match(streakLine(7), /week/);
  assert.match(streakLine(30), /month/);
  assert.match(streakLine(20), /20 days/);
  assert.equal(streakLine(5), 'Logged and counted.');
});
