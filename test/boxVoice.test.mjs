// node --test test/boxVoice.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { boxVoice } from '../src/utils/boxVoice.js';
import { glyphFor, glyphsFor } from '../src/utils/foodGlyph.js';

const day = (flags) => ['breakfast', 'lunch', 'dinner'].map((id, i) => ({ id, active: true, confirmed: !!flags[i] }));

test('every state gives a short lowercase line with no em dash or semicolon', () => {
  const states = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]];
  for (const flags of states) for (let seed = 0; seed < 5; seed++) {
    const line = boxVoice({ meals: day(flags), seed });
    assert.ok(line.length > 5 && line.length <= 60, line);
    assert.equal(line, line.toLowerCase(), line);
    assert.ok(!/[—;]/.test(line), line);
  }
});

test('a finished day says the box is packed, and an unfinished one names the next meal', () => {
  assert.match(boxVoice({ meals: day([1, 1, 1]), seed: 0 }), /packed|full box/);
  assert.match(boxVoice({ meals: day([1, 0, 0]), seed: 0 }), /lunch/);
  assert.match(boxVoice({ meals: day([1, 1, 0]), seed: 1 }), /dinner/);
});

test('a meal that is off is skipped when naming the next one', () => {
  const meals = [{ id: 'breakfast', active: false }, { id: 'lunch', active: true, confirmed: true }, { id: 'dinner', active: true, confirmed: false }];
  assert.match(boxVoice({ meals, seed: 0 }), /dinner/);
  assert.equal(boxVoice({ meals: meals.map((m) => ({ ...m, active: false })), seed: 0 }).includes('nothing planned'), true);
});

test('the line is stable for a seed and varies between seeds', () => {
  const a = boxVoice({ meals: day([0, 0, 0]), seed: 3 });
  assert.equal(a, boxVoice({ meals: day([0, 0, 0]), seed: 3 }));
  assert.ok(new Set([0, 1, 2].map((s) => boxVoice({ meals: day([0, 0, 0]), seed: s }))).size > 1);
});

test('glyphs: the dish names a student sees map to the right drawing', () => {
  const g = (name) => glyphFor({ name, nutrition: { calories: 250, protein: 10, carbs: 30, fat: 8 }, tags: [], station: '' });
  assert.equal(g('Baked Salmon'), 'fish');
  assert.equal(g('Scrambled Eggs'), 'egg');
  assert.equal(g('Cheese Pizza'), 'bread');
  assert.equal(g('Greek Yogurt Parfait'), 'dairy');
  assert.equal(g('Jasmine Rice'), 'rice');
});

test('a compartment never shows the same glyph twice or more than the limit', () => {
  const items = ['Grilled Chicken', 'Chicken Tenders', 'Brown Rice', 'Steamed Broccoli', 'Cookie'].map((name) => ({ name, nutrition: { calories: 200, protein: 10, carbs: 20, fat: 5 }, tags: [], station: '' }));
  const out = glyphsFor(items, 3);
  assert.ok(out.length <= 3);
  assert.equal(new Set(out).size, out.length);
  assert.deepEqual(glyphsFor([], 3), []);
});
