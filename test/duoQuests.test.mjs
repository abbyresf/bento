import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DUO_QUESTS, duoQuestState, progressLine, claimWeeks, visibleQuests, groupQuests } from '../src/data/duoQuests.js';

test('the targets match the database function', () => {
  // the latest migration that defines duo_quest_target decides the numbers
  const sql = readFileSync(new URL('../supabase/migrations/049_duo_match_plate.sql', import.meta.url), 'utf8');
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

test('one list of quests, each with the buddy closest to finishing it', () => {
  const weeks = { thisWeek: '2026-10-12', lastWeek: '2026-10-05' };
  const friends = [{ friend_id: 'a', display_name: 'Maya' }, { friend_id: 'b', display_name: 'Sam' }];
  const row = (quest_id, progress, target, claimed = false) => ({ quest_id, progress, target, claimed });
  const by = {
    a: { [weeks.thisWeek]: [row('daily_duo', 1, 2), row('match_plate', 1, 1), row('week_dinners', 4, 5)], [weeks.lastWeek]: [] },
    b: { [weeks.thisWeek]: [row('daily_duo', 2, 2), row('match_plate', 0, 1), row('week_dinners', 2, 5, true)], [weeks.lastWeek]: [] },
  };
  const g = groupQuests(friends, by, weeks);
  const byId = Object.fromEntries(g.map((x) => [x.quest.id, x]));
  assert.equal(byId.daily_duo.friendName, 'Sam');          // Sam finished it
  assert.equal(byId.daily_duo.state, 'ready');
  assert.equal(byId.match_plate.friendName, 'Maya');
  assert.equal(byId.week_dinners.friendName, 'Maya');      // 4 of 5 beats a claimed one
  assert.equal(byId.week_dinners.state, 'open');
  assert.equal(g.length, 3);                               // only quests with data
  assert.ok(g[0].state === 'ready' && g[g.length - 1].state === 'open');
  assert.deepEqual(groupQuests([], {}, weeks), []);
});
