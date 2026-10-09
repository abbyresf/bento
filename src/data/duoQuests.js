/* Buddy quests: two starter goals you reach together with one buddy.
 *
 * Progress is worked out in the database from both students' confirmed meals
 * (duo_quests, migrations 045 and 048). Nothing here counts calories, amounts or what anyone
 * ate. The targets below must match duo_quest_target in the latest migration that defines it (048),
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
  { id: 'review_duo',   title: 'Review duo',      what: 'Both rate 3 dishes', target: 3, unit: 'dishes' },
  { id: 'taste_test',   title: 'Taste test',      what: 'Both rate the same dish', target: 1, unit: 'dish' },
];

/* 'claimed' after the tap, 'ready' once met, otherwise 'open'. */
export function duoQuestState(quest, progress, claimed) {
  if (claimed) return 'claimed';
  return (progress ?? 0) >= quest.target ? 'ready' : 'open';
}

/* `target` is the number the server counted against. It wins over the one written here, so changing a
 * target in the database never needs a new build of the app. */
export function progressLine(quest, progress, target = quest.target) {
  const n = Math.min(progress ?? 0, target);
  return `${n} of ${target} ${quest.unit}`;
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
    const goal = (row) => row?.target ?? q.target;
    if (prev && !prev.claimed && prev.progress >= goal(prev)) {
      out.push({ quest: q, week: weeks.lastWeek, label: 'Last week', progress: prev.progress, target: goal(prev), state: 'ready' });
    }
    if (cur) {
      out.push({
        quest: q, week: weeks.thisWeek, label: 'This week', progress: cur.progress, target: goal(cur),
        state: duoQuestState({ ...q, target: goal(cur) }, cur.progress, cur.claimed),
      });
    }
  }
  return out;
}
