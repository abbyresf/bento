// node --test test/quests.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTS, computeProgress, questState, weekStartOf, weekRange } from '../src/data/quests.js';
import { OUTFITS, isUnlocked, unlockHint } from '../src/data/mascotOutfits.js';

const q = (id) => QUESTS.find((x) => x.id === id);

test('weeks start on Monday, including across a month end', () => {
  assert.equal(weekStartOf(new Date(2026, 9, 6)), '2026-10-05');   // Tue
  assert.equal(weekStartOf(new Date(2026, 9, 5)), '2026-10-05');   // Mon
  assert.equal(weekStartOf(new Date(2026, 9, 11)), '2026-10-05');  // Sun
  assert.equal(weekStartOf(new Date(2026, 10, 1)), '2026-10-26');  // Sun, next month
});

test('weekRange ends on the next Monday', () => {
  const r = weekRange('2026-10-26');
  assert.equal(r.startDate, '2026-10-26');
  assert.equal(r.endDate, '2026-11-02');
});

test('no data means zero progress and never throws', () => {
  assert.deepEqual(computeProgress(), { days4: 0, rate3: 0, twoMeals: 0 });
});

test('days4 counts distinct days, not meals, and caps at the target', () => {
  const meals = ['05', '05', '06', '07', '08', '09', '10'].map((d, i) => ({ meal_date: `2026-10-${d}`, meal_type: `m${i}`, items: [] }));
  assert.equal(computeProgress({ meals }).days4, 4);
});

test('twoMeals needs two different meals on the same day', () => {
  const one = [{ meal_date: '2026-10-05', meal_type: 'lunch', items: [] }, { meal_date: '2026-10-06', meal_type: 'lunch', items: [] }];
  assert.equal(computeProgress({ meals: one }).twoMeals, 0);
  const two = [...one, { meal_date: '2026-10-05', meal_type: 'dinner', items: [] }];
  assert.equal(computeProgress({ meals: two }).twoMeals, 1);
});

test('rate3 counts only ratings of dishes in a confirmed meal', () => {
  const meals = [{ meal_date: '2026-10-05', meal_type: 'lunch', items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }];
  const ratings = [{ item_id: 'a' }, { item_id: 'b' }, { item_id: 'zzz' }, { item_id: 'zzz2' }];
  assert.equal(computeProgress({ meals, ratings }).rate3, 2);
  assert.equal(computeProgress({ meals: [], ratings }).rate3, 0);
});

test('a dish rated twice counts once', () => {
  const meals = [{ meal_date: '2026-10-05', meal_type: 'lunch', items: [{ id: 'a' }] }];
  assert.equal(computeProgress({ meals, ratings: [{ item_id: 'a' }, { item_id: 'a' }] }).rate3, 1);
});

test('state moves open, ready, claimed', () => {
  assert.equal(questState(q('rate3'), { rate3: 2 }, []), 'open');
  assert.equal(questState(q('rate3'), { rate3: 3 }, []), 'ready');
  assert.equal(questState(q('rate3'), { rate3: 3 }, ['rate3']), 'claimed');
});

test('quest pieces unlock by total claims', () => {
  const bow = OUTFITS.find((o) => o.id === 'bowtie');
  assert.equal(isUnlocked(bow, { questsClaimed: 2 }), false);
  assert.equal(isUnlocked(bow, { questsClaimed: 3 }), true);
  assert.equal(unlockHint(bow, { questsClaimed: 2 }), 'Claim one more quest');
  assert.equal(unlockHint(bow, { questsClaimed: 0 }), 'Claim 3 quests');
});

test('quest titles follow the copy rules', () => {
  for (const x of QUESTS) assert.doesNotMatch(x.title, /—|;|calorie|macro|protein|eat\b/i);
});
