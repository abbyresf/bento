import test from 'node:test';
import assert from 'node:assert/strict';
import { hotScore, sortPosts, topRated, autoPosts, colorForPost, timeAgo } from '../src/components/Loud/campus.js';

const now = Date.parse('2026-11-10T20:00:00Z');
const ago = (h) => new Date(now - h * 3600000).toISOString();

test('hot favors a fresh post over an old one with more votes', () => {
  const fresh = { id: 'a', emphasize_count: 8, downvote_count: 0, created_at: ago(2) };
  const old = { id: 'b', emphasize_count: 20, downvote_count: 0, created_at: ago(24 * 7) };
  assert.ok(hotScore(fresh, now) > hotScore(old, now));
  assert.deepEqual(sortPosts([old, fresh], 'hot', now).map((p) => p.id), ['a', 'b']);
});

test('downvotes pull a post down, and New is newest first', () => {
  const liked = { id: 'a', emphasize_count: 5, downvote_count: 0, created_at: ago(3) };
  const disliked = { id: 'b', emphasize_count: 5, downvote_count: 5, created_at: ago(3) };
  assert.ok(hotScore(liked, now) > hotScore(disliked, now));
  assert.deepEqual(sortPosts([liked, { id: 'c', created_at: ago(1) }], 'new', now).map((p) => p.id), ['c', 'a']);
});

const agg = {
  x: { name: 'Pesto pasta', avg: 4.8, count: 38, diningHall: 'Usdan' },
  y: { name: 'Poke bowl', avg: 4.6, count: 12 },
  z: { name: 'One-off', avg: 5, count: 1 },
};

test('top rated needs 3 ratings, so one 5-star rating cannot lead', () => {
  assert.deepEqual(topRated(agg).map((d) => d.name), ['Pesto pasta', 'Poke bowl']);
});

test('Bento posts at most two, always signed AUTO, and stops once students post', () => {
  const autos = autoPosts(agg, 'Brandeis', 0);
  assert.equal(autos.length, 2);
  assert.ok(autos.every((a) => a.auto));
  assert.match(autos[0].text, /Pesto pasta is the top-rated dish at Brandeis this week. ★ 4.8 from 38 ratings./);
  assert.equal(autoPosts(agg, 'Brandeis', 15).length, 0);
});

test('an anonymous poster keeps one color per post, and times read short', () => {
  const ids = ['classic', 'berry', 'mint'];
  assert.equal(colorForPost('post-1', ids), colorForPost('post-1', ids));
  assert.ok(ids.includes(colorForPost('post-2', ids)));
  assert.deepEqual([ago(0), ago(0.5), ago(5), ago(50)].map((t) => timeAgo(t, now)), ['now', '30m', '5h', '2d']);
});
