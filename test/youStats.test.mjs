import test from 'node:test';
import assert from 'node:assert/strict';
import { weekSummary, activeDays, dedupe, lastDays } from '../src/components/Loud/youStats.js';

const today = new Date(2026, 10, 10, 18);   // Tue 10 Nov 2026, 6 pm local
const days = lastDays(14, today);
const row = (dayIdx, meal, items, hour = 12) => ({
  meal_type: meal, meal_date: days[dayIdx], confirmed_at: new Date(`${days[dayIdx]}T${String(hour).padStart(2, '0')}:00:00`).toISOString(), items,
});
const dish = (id, protein) => ({ id, name: id, nutrition: { protein } });

test('a meal confirmed twice on one day counts once, the latest wins', () => {
  const rows = [row(13, 'lunch', [dish('a', 10)], 12), row(13, 'lunch', [dish('b', 40)], 13)];
  assert.equal(dedupe(rows).length, 1);
  assert.equal(weekSummary(rows, 100, today).proteinByDay[6], 40);
});

test('the week counts meals, averages protein over days with meals, and counts days on goal at 80%', () => {
  const rows = [row(13, 'lunch', [dish('a', 60)]), row(13, 'dinner', [dish('b', 50)]), row(12, 'lunch', [dish('c', 40)])];
  const w = weekSummary(rows, 130, today);
  assert.equal(w.mealsLogged, 3);
  assert.equal(w.avgProtein, 75);            // (110 + 40) / 2 days
  assert.equal(w.daysOnGoal, 1);             // 110 >= 104, 40 is not
  assert.equal(w.days.length, 7);
});

test('a dish is new this week only if it was not eaten the week before', () => {
  const rows = [row(2, 'lunch', [dish('old', 10)]), row(12, 'lunch', [dish('old', 10), dish('fresh', 10)])];
  assert.equal(weekSummary(rows, 100, today).newDishes, 1);
});

test('the calendar marks logged days and today, oldest first', () => {
  const cal = activeDays([row(13, 'lunch', []), row(0, 'dinner', [])], today);
  assert.equal(cal.length, 14);
  assert.deepEqual([cal[0].logged, cal[1].logged, cal[13].logged, cal[13].today], [true, false, true, true]);
});
