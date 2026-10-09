import test from 'node:test';
import assert from 'node:assert/strict';
import { BADGES, TOP_TIER, getEarnedBadges, getNewBadge, fillForStreak, nextBadge } from '../src/data/badges.js';
import { PIECES, MAX_LEVEL, clampLevel, piecesAt, ghostPieces, arrivedAt } from '../src/data/badgeBox.js';

test('ten tiers, climbing in days, and the top one is reachable inside a semester', () => {
  assert.equal(BADGES.length, 10);
  for (let i = 1; i < BADGES.length; i++) assert.ok(BADGES[i].days > BADGES[i - 1].days);
  assert.ok(TOP_TIER.days <= 100);
});

test('fill runs 1 to 10 with no gaps, and every tier says what it adds', () => {
  assert.deepEqual(BADGES.map((b) => b.fill), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const b of BADGES) {
    assert.ok(b.name && b.description && b.adds, b.id);
    assert.ok(!('emoji' in b), `${b.id} has no emoji`);
  }
  assert.equal(new Set(BADGES.map((b) => b.id)).size, 10);
});

test('the longest streak decides what is earned and how full the box is', () => {
  assert.equal(fillForStreak(0), 0);
  assert.equal(fillForStreak(1), 1);
  assert.equal(fillForStreak(2), 1);
  assert.equal(fillForStreak(3), 2);
  assert.equal(fillForStreak(89), 9);
  assert.equal(fillForStreak(90), 10);
  assert.equal(fillForStreak(400), 10);
  assert.equal(getEarnedBadges(7).length, 3);
  assert.equal(nextBadge(7).name, 'Greens Packed');
  assert.equal(nextBadge(90), null);
});

test('crossing several tiers at once celebrates the highest one', () => {
  assert.equal(getNewBadge(0, 1).fill, 1);
  assert.equal(getNewBadge(0, 8).fill, 3);
  assert.equal(getNewBadge(5, 5), null);
  assert.equal(getNewBadge(89, 90).name, 'Full Box');
});

test('each level adds something, and the box only grows', () => {
  let seen = new Set();
  for (let l = 1; l <= MAX_LEVEL; l++) {
    assert.ok(arrivedAt(l).length >= 1, `level ${l} adds a piece`);
    const now = new Set(piecesAt(l).map((p) => p.name));
    for (const name of seen) {
      if (name === 'mound' && l >= 2) continue;            // the first mound becomes the packed rice
      assert.ok(now.has(name), `${name} stays at level ${l}`);
    }
    seen = now;
  }
});

test('level 0 is empty, level 10 has everything but the first mound', () => {
  assert.deepEqual(piecesAt(0), []);
  const full = piecesAt(10).map((p) => p.name);
  assert.equal(full.length, PIECES.length - 1);
  assert.ok(!full.includes('mound'));
  for (const must of ['rice', 'nori', 'leaf', 'edamame', 'broccoli', 'tamago', 'skewer', 'oranges', 'cup', 'cherry', 'plum', 'fish', 'steam', 'chop']) {
    assert.ok(full.includes(must), must);
  }
});

test('pieces are painted back to front, so the cup sits behind the oranges', () => {
  const order = piecesAt(10).map((p) => p.name);
  assert.ok(order.indexOf('cup') < order.indexOf('oranges'));
  assert.ok(order.indexOf('rice') < order.indexOf('nori'));
  assert.ok(order.indexOf('chop') < order.indexOf('steam'));
  assert.equal(order[order.length - 1], 'steam');
});

test('the ghost is the next level\'s pieces, and nothing at the top', () => {
  assert.deepEqual(ghostPieces(2).map((p) => p.name), ['leaf', 'edamame']);
  assert.deepEqual(ghostPieces(6).map((p) => p.name), ['oranges', 'cherry']);
  assert.deepEqual(ghostPieces(7).map((p) => p.name), ['cup']);
  assert.deepEqual(ghostPieces(10), []);
  assert.deepEqual(ghostPieces(0).map((p) => p.name), ['mound']);
});

test('levels outside 0 to 10 are clamped', () => {
  assert.equal(clampLevel(-3), 0);
  assert.equal(clampLevel(99), 10);
  assert.equal(clampLevel(3.9), 3);
  assert.equal(clampLevel(undefined), 0);
  assert.equal(clampLevel(NaN), 0);
});
