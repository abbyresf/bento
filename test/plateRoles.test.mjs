import test from 'node:test';
import assert from 'node:assert/strict';
import { isBentoPlate } from '../src/data/plateRoles.js';

const dish = (name, station = 'entree') => ({ id: name, name, station, tags: [], allergens: [], ingredients: [] });

test('a protein, a vegetable and a grain make a Bento plate', () => {
  assert.equal(isBentoPlate([dish('Grilled Chicken Breast', 'grill'), dish('Roasted Broccoli', 'sides'), dish('Brown Rice', 'sides')]), true);
  assert.equal(isBentoPlate([dish('Baked Salmon'), dish('Steamed Green Beans', 'sides'), dish('Jasmine Rice', 'sides')]), true);
});

test('a plate missing one of the three is not one', () => {
  assert.equal(isBentoPlate([dish('Grilled Chicken Breast', 'grill'), dish('Brown Rice', 'sides')]), false);          // no vegetable
  assert.equal(isBentoPlate([dish('Roasted Broccoli', 'sides'), dish('Brown Rice', 'sides')]), false);                // no protein
  assert.equal(isBentoPlate([dish('Grilled Chicken Breast', 'grill'), dish('Roasted Broccoli', 'sides')]), false);    // no grain
});

test('nothing, or the wrong shape, is not a Bento plate', () => {
  assert.equal(isBentoPlate([]), false);
  assert.equal(isBentoPlate(null), false);
});
