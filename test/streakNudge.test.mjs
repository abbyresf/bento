// node --test test/streakNudge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { streakRecipients } from '../api/_streakNudge.js';
import { streakMessage, STREAK_POOL_SIZE } from '../api/reminderMessages.js';

const T = '2026-10-07';
const row = (user_id, current_streak, last_confirmed_date) => ({ user_id, current_streak, last_confirmed_date });

test('a running streak with nothing counted today is nudged', () => {
  assert.deepEqual(streakRecipients([row('a', 6, '2026-10-06')], T), [{ user_id: 'a', count: 6 }]);
});

test('the day before still counts, because one missed day is forgiven', () => {
  assert.equal(streakRecipients([row('a', 4, '2026-10-05')], T).length, 1);
});

test('nobody is nudged who already confirmed today', () => {
  assert.equal(streakRecipients([row('a', 6, T)], T).length, 0);
});

test('a lapsed streak, a zero streak and a missing date are left alone', () => {
  const rows = [row('old', 9, '2026-10-01'), row('zero', 0, '2026-10-06'), row('none', 3, null), row('nulls', null, '2026-10-06')];
  assert.equal(streakRecipients(rows, T).length, 0);
});

test('month and year boundaries are handled', () => {
  assert.equal(streakRecipients([row('a', 2, '2026-12-31')], '2027-01-01').length, 1);
  assert.equal(streakRecipients([row('a', 2, '2026-02-28')], '2026-03-01').length, 1);
});

test('every nudge line carries the number and follows the copy rules', () => {
  for (let d = 0; d < STREAK_POOL_SIZE * 3; d++) {
    const date = new Date(Date.UTC(2026, 9, 1 + d)).toISOString().slice(0, 10);
    const line = streakMessage(12, date);
    assert.ok(line.includes('12'), line);
    assert.ok(!line.includes('—') && !line.includes(';'), line);
    assert.ok(line.length <= 40, `long: ${line}`);
    for (const banned of ['risk', 'lose', 'lost', 'miss', 'danger', 'break', 'ate', 'eaten', 'skip']) {
      assert.ok(!line.toLowerCase().includes(banned), `"${banned}" in: ${line}`);
    }
  }
  assert.equal(streakMessage(5, '2026-10-07'), streakMessage(5, '2026-10-07'));
});
