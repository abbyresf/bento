import test from 'node:test';
import assert from 'node:assert/strict';
import { microSummary } from '../src/utils/micros.js';

const dish = (n, servings) => ({ id: Math.random().toString(), nutrition: n, ...(servings ? { servings } : {}) });

test('daily average over the days with a confirmed meal, as a share of the label Daily Value', () => {
  const rows = [
    { meal_date: '2026-11-02', items: [dish({ calcium: 300, iron: 4, potassium: 900 }), dish({ calcium: 350, iron: 5, potassium: 1450 })] },
    { meal_date: '2026-11-03', items: [dish({ calcium: 650, iron: 9, potassium: 2350 })] },
  ];
  const s = microSummary(rows);
  assert.equal(s.days, 2);
  const by = Object.fromEntries(s.micros.map((m) => [m.key, m]));
  assert.equal(by.calcium.perDay, 650);
  assert.equal(by.calcium.percentDv, 50);
  assert.equal(by.iron.perDay, 9);
  assert.equal(by.iron.percentDv, 50);
  assert.equal(by.potassium.percentDv, 50);
  assert.equal(by.iron.coverage, 1);
});

test('servings count', () => {
  const s = microSummary([{ meal_date: '2026-11-02', items: [dish({ iron: 3 }, 2)] }]);
  assert.equal(s.micros.find((m) => m.key === 'iron').perDay, 6);
});

test('a dish with no value is left out, not counted as zero, and coverage says so', () => {
  const rows = [{ meal_date: '2026-11-02', items: [dish({ iron: 6 }), dish({ iron: null }), dish({ calories: 200 })] }];
  const iron = microSummary(rows).micros.find((m) => m.key === 'iron');
  assert.equal(iron.perDay, 6);
  assert.ok(Math.abs(iron.coverage - 1 / 3) < 1e-9);
});

test('no data gives no figure', () => {
  const s = microSummary([]);
  assert.equal(s.days, 0);
  assert.ok(s.micros.every((m) => m.perDay === null && m.percentDv === null));
  const old = microSummary([{ meal_date: '2026-11-02', items: [dish({ calories: 500 })] }]);
  assert.ok(old.micros.every((m) => m.perDay === null));
});
