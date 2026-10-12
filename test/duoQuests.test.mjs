import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DUO_QUESTS, duoQuestState, progressLine, claimWeeks, visibleQuests, groupQuests, weeklyQuestIds } from '../src/data/duoQuests.js';

test('the targets match the database function', () => {
  // the latest migration that defines duo_quest_target decides the numbers
  const sql = readFileSync(new URL('../supabase/migrations/051_duo_rainbow_plate.sql', import.meta.url), 'utf8');
  for (const q of DUO_QUESTS) {
    const m = new RegExp(`when '${q.id}' then (\\d+)`).exec(sql);
    assert.ok(m, `${q.id} is in duo_quest_target`);
    assert.equal(Number(m[1]), q.target, q.id);
  }
});

test('states', () => {
  const q = DUO_QUESTS[0];
  assert.equal(duoQuestState(q, 0, false), 'open');
  assert.equal(duoQuestState(q, q.target - 1, false), 'open');
  assert.equal(duoQuestState(q, q.target, false), 'ready');
  assert.equal(duoQuestState(q, q.target, true), 'claimed');
  assert.equal(duoQuestState(q, undefined, false), 'open');
});

test('progress line never goes above the target', () => {
  assert.equal(progressLine(DUO_QUESTS.find((q) => q.id === 'daily_duo'), 1), '1 of 2 days');
  assert.equal(progressLine(DUO_QUESTS.find((q) => q.id === 'daily_duo'), 7), '2 of 2 days');
  assert.equal(progressLine(DUO_QUESTS.find((q) => q.id === 'week_dinners'), 9), '5 of 5 nights');
  assert.equal(progressLine(DUO_QUESTS.find((q) => q.id === 'week_dinners'), undefined), '0 of 5 nights');
  assert.equal(progressLine(DUO_QUESTS.find((q) => q.id === 'taste_test'), 4), '1 of 1 dish');
});

test('this week and last week are consecutive Mondays', () => {
  const w = claimWeeks(new Date(2026, 9, 8));     // Thursday 8 Oct 2026
  assert.equal(w.thisWeek, '2026-10-05');
  assert.equal(w.lastWeek, '2026-09-28');
  assert.equal(claimWeeks(new Date(2026, 9, 5)).thisWeek, '2026-10-05');   // a Monday
  assert.equal(claimWeeks(new Date(2026, 9, 11)).thisWeek, '2026-10-05');  // the Sunday
});

test('last week shows only when finished and unclaimed', () => {
  const weeks = { thisWeek: '2026-10-05', lastWeek: '2026-09-28' };
  const row = (id, progress, claimed = false) => ({ quest_id: id, progress, target: id === 'daily_duo' ? 2 : 5, claimed });
  const byWeek = {
    '2026-10-05': [row('daily_duo', 1), row('week_dinners', 5)],
    '2026-09-28': [row('daily_duo', 2), row('week_dinners', 5, true)],
  };
  const shown = visibleQuests(byWeek, weeks).map((v) => `${v.label}:${v.quest.id}:${v.state}`);
  assert.deepEqual(shown, ['Last week:daily_duo:ready', 'This week:daily_duo:open', 'This week:week_dinners:ready']);
});

test('nothing shows without data', () => {
  assert.deepEqual(visibleQuests({}, { thisWeek: 'a', lastWeek: 'b' }), []);
  assert.deepEqual(visibleQuests(undefined, { thisWeek: 'a', lastWeek: 'b' }), []);
});

test('the server\'s target wins over the one in the app', () => {
  const weeks = { thisWeek: '2026-10-05', lastWeek: '2026-09-28' };
  const byWeek = { '2026-10-05': [{ quest_id: 'daily_duo', progress: 3, target: 3, claimed: false }, { quest_id: 'week_dinners', progress: 4, target: 5, claimed: false }] };
  const shown = visibleQuests(byWeek, weeks);
  const daily = shown.find((v) => v.quest.id === 'daily_duo');
  assert.equal(daily.target, 3);
  assert.equal(daily.state, 'ready');                          // 3 of the server's 3, though the app's own number is 2
  assert.equal(shown.find((v) => v.quest.id === 'week_dinners').state, 'open');
  assert.equal(progressLine(DUO_QUESTS.find((q) => q.id === 'daily_duo'), 3, 3), '3 of 3 days');
  // an old row with no target falls back to the app's number
  assert.equal(visibleQuests({ '2026-10-05': [{ quest_id: 'daily_duo', progress: 2, claimed: false }] }, weeks)[0].target, 2);
});

test('three quests a week, one of each kind, and the same for everybody', () => {
  assert.deepEqual(weeklyQuestIds('2026-10-12'), ['mystery_plate', 'taste_test', 'daily_duo']);
  assert.deepEqual(weeklyQuestIds('2026-10-19'), ['match_plate', 'review_duo', 'week_dinners']);   // the next week rotates
  assert.deepEqual(weeklyQuestIds('2026-10-26'), ['rainbow_plate', 'taste_test', 'daily_duo']);
  assert.deepEqual(weeklyQuestIds('2026-11-02'), ['mystery_plate', 'review_duo', 'week_dinners']);
  for (const w of ['2026-01-05', '2026-06-01', '2027-03-01']) assert.equal(weeklyQuestIds(w).length, 3);
});

test('one list for the week, each quest with the buddy closest to finishing it', () => {
  const weeks = { thisWeek: '2026-10-12', lastWeek: '2026-10-05' };
  const friends = [{ friend_id: 'a', display_name: 'Maya' }, { friend_id: 'b', display_name: 'Sam' }];
  const row = (quest_id, progress, target, claimed = false, detail = null) => ({ quest_id, progress, target, claimed, detail });
  const by = {
    a: { [weeks.thisWeek]: [row('daily_duo', 1, 2), row('taste_test', 1, 1), row('week_dinners', 4, 5), row('mystery_plate', 0, 2)], [weeks.lastWeek]: [] },
    b: { [weeks.thisWeek]: [row('daily_duo', 2, 2), row('taste_test', 0, 1), row('mystery_plate', 1, 2, false, 'Baked Salmon')], [weeks.lastWeek]: [] },
  };
  const g = groupQuests(friends, by, weeks);
  const byId = Object.fromEntries(g.map((x) => [x.quest.id, x]));
  assert.equal(g.length, 3);                                  // only this week's three, not week_dinners
  assert.ok(!byId.week_dinners);
  assert.equal(byId.daily_duo.friendName, 'Sam');             // Sam finished it
  assert.equal(byId.daily_duo.state, 'ready');
  assert.equal(byId.taste_test.friendName, 'Maya');
  assert.equal(byId.taste_test.state, 'ready');
  assert.equal(byId.mystery_plate.friendName, 'Sam');         // the pair that has a pick beats the pair that has none
  assert.equal(byId.mystery_plate.detail, 'Baked Salmon');
  assert.equal(byId.mystery_plate.state, 'open');
  assert.equal(g[g.length - 1].quest.id, 'mystery_plate');    // ready ones first
  assert.deepEqual(groupQuests([], {}, weeks), []);
});

test('a plate quest with no pick yet is ready to start, and last week\'s finished quest still shows', () => {
  const weeks = { thisWeek: '2026-10-12', lastWeek: '2026-10-05' };
  const friends = [{ friend_id: 'a', display_name: 'Maya' }];
  const row = (quest_id, progress, target, claimed = false, detail = null) => ({ quest_id, progress, target, claimed, detail });
  const by = { a: {
    [weeks.thisWeek]: [row('mystery_plate', 0, 2), row('taste_test', 0, 1), row('daily_duo', 0, 2)],
    [weeks.lastWeek]: [row('week_dinners', 5, 5)],
  } };
  const g = groupQuests(friends, by, weeks);
  assert.equal(g.find((x) => x.quest.id === 'mystery_plate').state, 'start');
  assert.equal(g[0].quest.id, 'week_dinners');                // last week's, ready, first
  assert.equal(g[0].label, 'Last week');
  assert.equal(g.length, 4);
});

test('a Rainbow plate carries the color and whether you have tapped', () => {
  const weeks = { thisWeek: '2026-10-26', lastWeek: '2026-10-19' };            // a week that shows Rainbow plate
  const friends = [{ friend_id: 'a', display_name: 'Maya' }, { friend_id: 'b', display_name: 'Sam' }];
  const row = (quest_id, progress, target, claimed = false, detail = null, acked = false) => ({ quest_id, progress, target, claimed, detail, acked });
  const by = {
    a: { [weeks.thisWeek]: [row('rainbow_plate', 0, 2)], [weeks.lastWeek]: [] },
    b: { [weeks.thisWeek]: [row('rainbow_plate', 1, 2, false, 'Green', true)], [weeks.lastWeek]: [] },
  };
  const g = groupQuests(friends, by, weeks).find((x) => x.quest.id === 'rainbow_plate');
  assert.equal(g.friendName, 'Sam');
  assert.equal(g.detail, 'Green');
  assert.equal(g.acked, true);
  assert.equal(g.state, 'open');
  const none = groupQuests([friends[0]], { a: by.a }, weeks).find((x) => x.quest.id === 'rainbow_plate');
  assert.equal(none.state, 'start');                                             // no color picked yet
});
