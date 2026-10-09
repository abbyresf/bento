/* Buddy quests: two starter goals you reach together with one buddy.
 *
 * Progress is worked out in the database from both students' confirmed meals
 * (duo_quests, migration 045). Nothing here counts calories, amounts or what anyone
 * ate. The targets below must match duo_quest_target in the latest migration that defines it (047),
 * and a test reads that migration to hold them together.
 *
 * Weeks run Monday to Sunday, the same weeks as the personal quests. A quest can be
 * claimed for the current week or the one before, so finishing on Sunday night is not
 * lost if the app is opened on Monday. A claim belongs to the person who made it, and
 * claiming one buddy quest unlocks Bento's colors (data/mascotColors.js). */
import { weekStartOf } from './quests.js';

export const DUO_QUESTS = [
  { id: 'daily_duo',    title: 'Daily duo',       what: 'Both confirm a meal on the same day', target: 2, unit: 'days' },
  { id: 'week_dinners', title: 'Week of dinners', what: 'Both confirm dinner on the same night', target: 5, unit: 'nights' },
];

/* 'claimed' after the tap, 'ready' once met, otherwise 'open'. */
export function duoQuestState(quest, progress, claimed) {
  if (claimed) return 'claimed';
  return (progress ?? 0) >= quest.target ? 'ready' : 'open';
}

export function progressLine(quest, progress) {
  const n = Math.min(progress ?? 0, quest.target);
  return `${n} of ${quest.target} ${quest.unit}`;
}

/* This week's Monday and the one before it, as YYYY-MM-DD. */
export function claimWeeks(now = new Date()) {
  const prior = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  return { thisWeek: weekStartOf(now), lastWeek: weekStartOf(prior) };
}

/* The quests worth showing for one buddy: everything this week, plus anything from
 * last week that is finished and not yet claimed. `byWeek` is { [weekStart]: rows }
 * where a row is { quest_id, progress, target, claimed }. */
export function visibleQuests(byWeek, weeks) {
  const out = [];
  for (const q of DUO_QUESTS) {
    const cur = byWeek?.[weeks.thisWeek]?.find((r) => r.quest_id === q.id);
    const prev = byWeek?.[weeks.lastWeek]?.find((r) => r.quest_id === q.id);
    if (prev && !prev.claimed && prev.progress >= q.target) {
      out.push({ quest: q, week: weeks.lastWeek, label: 'Last week', progress: prev.progress, state: 'ready' });
    }
    if (cur) {
      out.push({
        quest: q, week: weeks.thisWeek, label: 'This week', progress: cur.progress,
        state: duoQuestState(q, cur.progress, cur.claimed),
      });
    }
  }
  return out;
}
