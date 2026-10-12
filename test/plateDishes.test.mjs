import test from 'node:test';
import assert from 'node:assert/strict';
import { dishesFromMenu } from '../src/data/plateDishes.js';
import { passesFailClosed } from '../src/data/plateFilter.js';
import { mockCampusMenu } from '../src/lib/mockCampusMenu.js';

const config = { locations: { north: { id: 'north', name: 'North Hall', shortName: 'North Hall' }, commons: { id: 'commons', name: 'The Commons', shortName: 'Commons' } } };

test('today\'s dishes come from every hall and meal, once each, as real meals', () => {
  const dishes = dishesFromMenu(mockCampusMenu(config));
  assert.ok(dishes.length > 10);
  assert.equal(new Set(dishes.map((d) => d.id)).size, dishes.length);          // no repeats
  assert.ok(dishes.every((d) => d.hall && d.mealName));
  assert.ok(dishes.some((d) => d.hall === 'Commons'));
  assert.ok(!dishes.some((d) => /cookie|fruit crisp/i.test(d.name)));                // desserts are not dishes to plan around
});

test('a vegan buddy and a milk allergy leave only dishes that fit both', () => {
  const dishes = dishesFromMenu(mockCampusMenu(config));
  const mine = { milk: true };
  const theirs = { vegan: true };
  const both = dishes.filter((d) => passesFailClosed(d, mine) && passesFailClosed(d, theirs));
  assert.ok(both.length > 0 && both.length < dishes.length);
  assert.ok(both.every((d) => d.tags.includes('vegan') && !d.allergens.includes('milk')));
});

test('no menu means no dishes', () => {
  assert.deepEqual(dishesFromMenu(null), []);
  assert.deepEqual(dishesFromMenu({ locations: {} }), []);
});
