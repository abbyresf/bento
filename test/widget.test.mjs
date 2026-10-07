// node --test test/widget.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlatePayload } from '../src/lib/widget.js';

const meals = {
  breakfast: { hall: 'Sherman', items: [{ name: 'Oatmeal', id: 'x', calories: 150 }], confirmed: true },
  lunch: { hall: 'Usdan', items: [], confirmed: false },
  dinner: { hall: 'Sherman', items: [{ name: ' Salmon ' }, { name: '' }, { name: 'Rice' }], confirmed: false },
};

test('only names, hall and confirmed go across, never ids or nutrition', () => {
  const p = buildPlatePayload({ date: '2026-10-07', streak: 4, meals });
  assert.deepEqual(p.meals.breakfast, { hall: 'Sherman', items: ['Oatmeal'], confirmed: true });
  assert.ok(!JSON.stringify(p).includes('calories'));
  assert.ok(!JSON.stringify(p).includes('"id"'));
});

test('meals with no items are left out', () => {
  const p = buildPlatePayload({ date: '2026-10-07', streak: 0, meals });
  assert.deepEqual(Object.keys(p.meals), ['breakfast', 'dinner']);
});

test('names are trimmed and blanks dropped', () => {
  const p = buildPlatePayload({ date: '2026-10-07', streak: 0, meals });
  assert.deepEqual(p.meals.dinner.items, ['Salmon', 'Rice']);
});

test('a bad streak becomes zero and the version is 1', () => {
  assert.equal(buildPlatePayload({ date: 'd', streak: -2, meals }).streak, 0);
  assert.equal(buildPlatePayload({ date: 'd', streak: null, meals }).streak, 0);
  assert.equal(buildPlatePayload({ date: 'd', streak: 3, meals }).v, 1);
});

test('missing meals never throw', () => {
  assert.deepEqual(buildPlatePayload({ date: 'd', streak: 1 }).meals, {});
});
