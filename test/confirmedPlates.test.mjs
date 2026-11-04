import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedPlates, applyConfirmedPlates, hallLocation } from '../src/utils/confirmedPlates.js';

const item = (id, calories, servings = 1) => ({ id, name: id, servings, nutrition: { calories, protein: 10, carbs: 20, fat: 5 } });
const planned = (cal) => ({ items: [item('planned', cal)], totals: { calories: cal, protein: 10, carbs: 20, fat: 5 }, target: { calories: 800, protein: 40, carbs: 90, fat: 30 }, warnings: [] });
const plan = () => ({
  usdan: { breakfast: planned(500), lunch: planned(800), dinner: planned(800) },
  sherman: { breakfast: planned(510), lunch: planned(810), dinner: planned(810) },
  dailyTotals: {}, targets: { calories: 2200 }, warnings: [],
});

test('the stored plate replaces the planned one at every hall, with servings counted', () => {
  const eaten = [item('eggs', 200, 2), item('toast', 130)];
  const next = applyConfirmedPlates(plan(), { breakfast: { items: eaten, hall: 'Usdan' } });
  for (const loc of ['usdan', 'sherman']) {
    assert.deepEqual(next[loc].breakfast.items.map((i) => i.id), ['eggs', 'toast']);
    assert.equal(next[loc].breakfast.totals.calories, 530);
    assert.equal(next[loc].breakfast.target.calories, 800);           // still compared against the planned target
    assert.equal(next[loc].lunch.items[0].id, 'planned');             // meals not confirmed are untouched
  }
  assert.deepEqual(next.targets, { calories: 2200 });
});

test('nothing to change returns the same plan, so nothing re-renders or re-plans', () => {
  const p = plan();
  assert.equal(applyConfirmedPlates(p, {}), p);
  assert.equal(applyConfirmedPlates(null, { lunch: { items: [item('x', 1)] } }), null);
  const once = applyConfirmedPlates(p, { lunch: { items: [item('x', 1)] } });
  const plates = { lunch: { items: once.usdan.lunch.confirmedItems } };
  assert.equal(applyConfirmedPlates(once, plates), once);              // already in place
});

test('an eaten plate carries no planning advice', () => {
  const p = plan();
  p.usdan.lunch.warnings = ['Consider adding protein-rich foods'];
  assert.deepEqual(applyConfirmedPlates(p, { lunch: { items: [item('x', 100)] } }).usdan.lunch.warnings, []);
});

test('the database comes first, then the offline queue, and empty plates are skipped', () => {
  const db = { breakfast: { rowId: 1, items: [item('a', 1)], hall: 'Sherman' }, lunch: null, dinner: { rowId: 2, items: [] } };
  const queue = [
    { date: '2026-11-04', meal: 'lunch', items: [item('q', 1)], hall: 'Usdan' },
    { date: '2026-11-04', meal: 'breakfast', items: [item('stale', 1)] },
    { date: '2026-11-03', meal: 'dinner', items: [item('yesterday', 1)] },
  ];
  const out = confirmedPlates('2026-11-04', db, queue);
  assert.equal(out.breakfast.items[0].id, 'a');
  assert.equal(out.breakfast.hall, 'Sherman');
  assert.equal(out.lunch.items[0].id, 'q');
  assert.equal(out.dinner, undefined);                                 // no stored items: keeps its planned plate
  assert.deepEqual(confirmedPlates('2026-11-04', null, []), {});
});

test('a hall name finds its location id', () => {
  const locations = { usdan: { shortName: 'Usdan', name: 'Usdan Kitchen' }, sherman: { shortName: 'Sherman' } };
  assert.equal(hallLocation(locations, 'Sherman'), 'sherman');
  assert.equal(hallLocation(locations, 'Usdan Kitchen'), 'usdan');
  assert.equal(hallLocation(locations, 'Dewick'), null);
  assert.equal(hallLocation(locations, null), null);
});
