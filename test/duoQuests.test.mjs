import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DUO_QUESTS, duoQuestState, progressLine, claimWeeks, visibleQuests } from '../src/data/duoQuests.js';

test('the targets match the database function', () => {
  const sql = readFileSync(new URL('../supabase/migrations/045_duo_quests_and_colors.sql', import.meta.url), 'utf8');
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
  assert.equal(progressLine(DUO_QUESTS[0], 2), '2 of 4 days');
  assert.equal(progressLine(DUO_QUESTS[1], 9), '5 of 5 nights');
  assert.equal(progressLine(DUO_QUESTS[1], undefined), '0 of 5 nights');
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
  const row = (id, progress, claimed = false) => ({ quest_id: id, progress, target: id === 'daily_duo' ? 4 : 5, claimed });
  const byWeek = {
    '2026-10-05': [row('daily_duo', 2), row('week_dinners', 5)],
    '2026-09-28': [row('daily_duo', 4), row('week_dinners', 5, true)],
  };
  const shown = visibleQuests(byWeek, weeks).map((v) => `${v.label}:${v.quest.id}:${v.state}`);
  assert.deepEqual(shown, ['Last week:daily_duo:ready', 'This week:daily_duo:open', 'This week:week_dinners:ready']);
});

test('nothing shows without data', () => {
  assert.deepEqual(visibleQuests({}, { thisWeek: 'a', lastWeek: 'b' }), []);
  assert.deepEqual(visibleQuests(undefined, { thisWeek: 'a', lastWeek: 'b' }), []);
});
