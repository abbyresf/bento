import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { passesHardRestrictions } from '../src/utils/mealOptimizer.js';
import { passesFailClosed } from '../src/data/plateFilter.js';

const cases = JSON.parse(readFileSync(new URL('./fixtures/restrictionCases.json', import.meta.url), 'utf8'));

test('the shared dietary cases agree with the meal plan filter and the fail-closed wrapper', () => {
  for (const c of cases) {
    assert.equal(passesHardRestrictions(c.item, c.js), c.pass, `plan filter: ${c.name}`);
    assert.equal(passesFailClosed(c.item, c.js), c.pass, `fail closed: ${c.name}`);
  }
});

test('a dish with no allergen list is left out for someone with an allergy', () => {
  const noList = { id: 'x', tags: [] };
  assert.equal(passesFailClosed(noList, { peanuts: true }), false);
  assert.equal(passesFailClosed(noList, { allergies: ['cilantro'] }), false);
  assert.equal(passesFailClosed(noList, {}), true);                         // no allergy, nothing to clear
});

test('a dish with no tags is left out for someone on a tag diet', () => {
  const noTags = { id: 'x', allergens: [] };
  assert.equal(passesFailClosed(noTags, { vegetarian: true }), false);
  assert.equal(passesFailClosed(noTags, { kosher: true }), false);
  assert.equal(passesFailClosed(noTags, { halal: true }), true);            // halal is not a hard block in the plan either
});

test('nothing passes for a missing dish', () => {
  assert.equal(passesFailClosed(null, {}), false);
});
