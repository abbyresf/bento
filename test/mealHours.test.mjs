import test from 'node:test';
import assert from 'node:assert/strict';
import { mealHoursFor, formatClock, formatRange, hoursHavePassed } from '../src/utils/mealHours.js';

test('formats whole and half hours', () => {
  assert.equal(formatClock(7), '7am');
  assert.equal(formatClock(10.5), '10:30am');
  assert.equal(formatClock(12), '12pm');
  assert.equal(formatClock(16), '4pm');
  assert.equal(formatRange({ start: 10.5, end: 16 }), '10:30am – 4pm');
});

test("a hall's own hours win, and the campus default fills the gaps", () => {
  const menu = { locations: { warren: { hours: { dinner: { start: 16, end: 21 } } }, other: {} } };
  assert.deepEqual(mealHoursFor(menu, 'warren', 'dinner'), { start: 16, end: 21, label: 'Dinner' });
  assert.equal(mealHoursFor(menu, 'warren', 'lunch').start, 11);
  assert.equal(mealHoursFor(menu, 'other', 'dinner').start, 17);
  assert.equal(mealHoursFor(null, 'warren', 'dinner').end, 20);
});

test('a meal has passed once the clock reaches its end, minutes included', () => {
  const h = { start: 10.5, end: 14.5 };
  assert.equal(hoursHavePassed(h, new Date(2026, 10, 2, 14, 29)), false);
  assert.equal(hoursHavePassed(h, new Date(2026, 10, 2, 14, 30)), true);
});
