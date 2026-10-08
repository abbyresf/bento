import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, COLOR_IDS, DEFAULT_COLOR, colorFor, cleanColor, colorsUnlocked, canWear, contrast } from '../src/data/mascotColors.js';

test('ids are well formed, unique, and classic is first', () => {
  assert.equal(COLORS[0].id, DEFAULT_COLOR);
  assert.equal(new Set(COLOR_IDS).size, COLOR_IDS.length);
  for (const id of COLOR_IDS) assert.match(id, /^[a-z]{2,16}$/);          // the database check
  for (const c of COLORS) for (const k of ['body', 'ink', 'a', 'b']) assert.match(c[k], /^#[0-9A-Fa-f]{6}$/);
});

test('classic is exactly the colors the mascot always had', () => {
  const c = colorFor('classic');
  assert.deepEqual([c.body, c.ink, c.a, c.b], ['#24384F', '#24384F', '#FD8F2A', '#77BD3E']);
});

test('unknown, empty and null all fall back to classic', () => {
  for (const v of [undefined, null, '', 'neon', 'CHERRY']) assert.equal(colorFor(v).id, 'classic');
});

test('only known non-classic ids are saved', () => {
  assert.equal(cleanColor('cherry'), 'cherry');
  assert.equal(cleanColor('classic'), null);
  assert.equal(cleanColor('neon'), null);
  assert.equal(cleanColor(undefined), null);
});

test('colors unlock with one claimed buddy quest', () => {
  assert.ok(!colorsUnlocked(0));
  assert.ok(!colorsUnlocked(undefined));
  assert.ok(colorsUnlocked(1));
  assert.ok(colorsUnlocked(5));
  assert.ok(canWear('classic', 0));
  assert.ok(!canWear('cherry', 0));
  assert.ok(canWear('cherry', 1));
});

test('the food shapes and the eyes stay visible against every body', () => {
  for (const c of COLORS) {
    assert.ok(contrast(c.a, c.body) >= 1.8 || c.id === 'classic', `${c.id} a`);
    assert.ok(contrast(c.b, c.body) >= 1.8 || c.id === 'classic', `${c.id} b`);
    assert.ok(contrast(c.ink, c.body) >= 1.0, `${c.id} ink`);
  }
});

test('the two food shapes differ from each other in every scheme', () => {
  for (const c of COLORS) assert.notEqual(c.a.toLowerCase(), c.b.toLowerCase());
});
