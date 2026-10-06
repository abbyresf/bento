// node --test test/bentoSays.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { bentoSays, voiceMessage } from '../src/utils/bentoSays.js';

const none = { breakfast: false, lunch: false, dinner: false };
const T = '2026-10-07';

const ALL = [];
for (const hour of [0, 3, 8, 12, 14, 17, 19, 21, 23]) {
  for (const confirmed of [none, { ...none, lunch: true }, { breakfast: true, lunch: true, dinner: true }]) {
    for (const streak of [{ currentStreak: 0 }, { currentStreak: 6, lastConfirmedDate: '2026-10-06' }, { currentStreak: 6, lastConfirmedDate: T }]) {
      ALL.push(bentoSays({ hour, today: T, confirmed, streak }));
    }
  }
}

test('every line follows the copy rules', () => {
  for (const { text, mood } of ALL) {
    assert.ok(!text.includes('—') && !text.includes('–'), `dash in: ${text}`);
    assert.ok(!text.includes(';'), `semicolon in: ${text}`);
    assert.ok(text.length <= 60, `too long (${text.length}): ${text}`);
    assert.ok(['happy', 'cheer', 'sleepy'].includes(mood));
    for (const banned of ['exciting', 'powerful', 'leverage', 'utilize', 'seamless', 'game-changer', 'delicious', 'miss', 'skipped', 'danger', 'lose', 'broken']) {
      assert.ok(!text.toLowerCase().includes(banned), `"${banned}" in: ${text}`);
    }
  }
});

test('a finished day cheers', () => {
  const r = bentoSays({ hour: 20, today: T, confirmed: { breakfast: true, lunch: true, dinner: true }, streak: { currentStreak: 3, lastConfirmedDate: T } });
  assert.equal(r.mood, 'cheer');
});

test('a live streak in the evening is named, and never framed as a loss', () => {
  const r = bentoSays({ hour: 18, today: T, confirmed: none, streak: { currentStreak: 6, lastConfirmedDate: '2026-10-06' } });
  assert.match(r.text, /6-day streak is still going/);
});

test('confirming today shows the running count', () => {
  const r = bentoSays({ hour: 13, today: T, confirmed: { ...none, lunch: true }, streak: { currentStreak: 1, lastConfirmedDate: T } });
  assert.equal(r.text, '1 day and counting.');
});

test('the same day always gives the same generic line', () => {
  const a = bentoSays({ hour: 15, today: T, confirmed: { ...none, lunch: true, dinner: true }, streak: { currentStreak: 0 } });
  const b = bentoSays({ hour: 15, today: T, confirmed: { ...none, lunch: true, dinner: true }, streak: { currentStreak: 0 } });
  assert.deepEqual(a, b);
});

test('the voice card only claims partnership where it exists', () => {
  const partner = voiceMessage({ diningPartner: true, diningTeamName: 'Brandeis Dining', universityName: 'Brandeis University' });
  assert.match(partner, /Brandeis Dining sees what students confirm and rate/);
  const other = voiceMessage({ diningPartner: false, diningTeamName: 'Brandeis Dining', universityName: 'Brandeis University' });
  assert.ok(!/dining team|Brandeis Dining/i.test(other), other);
  assert.match(other, /shape the plates Bento builds/);
});
