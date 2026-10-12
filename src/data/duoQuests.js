/* Buddy quests: two starter goals you reach together with one buddy.
 *
 * Progress is worked out in the database from both students' confirmed meals
 * (duo_quests, migrations 045, 048 and 049). Nothing here counts calories, amounts or what anyone
 * ate. The targets below must match duo_quest_target in the latest migration that defines it (049),
 * and a test reads that migration to hold them together.
 *
 * Weeks run Monday to Sunday, the same weeks as the personal quests. A quest can be
 * claimed for the current week or the one before, so finishing on Sunday night is not
 * lost if the app is opened on Monday. A claim belongs to the person who made it, and
 * claiming one buddy quest unlocks Bento's colors (data/mascotColors.js). */
import { weekStartOf } from './quests.js';

export const DUO_QUESTS = [
  { id: 'match_plate',  title: 'Match the plate', what: 'Eat the same meal with two dishes in common', target: 1, unit: 'meal',   emoji: '🍱', fun: true },
  { id: 'taste_test',   title: 'Taste test',      what: 'Both rate the same dish',                      target: 1, unit: 'dish',   emoji: '🍜', fun: true },
  { id: 'review_duo',   title: 'Review duo',      what: 'Both rate 3 dishes',                           target: 3, unit: 'dishes', emoji: '⭐', fun: true },
  { id: 'daily_duo',    title: 'Daily duo',       what: 'Both confirm a meal on the same day',          target: 2, unit: 'days',   emoji: '📅' },
  { id: 'week_dinners', title: 'Week of dinners', what: 'Both confirm dinner on the same night',        target: 5, unit: 'nights', emoji: '🌙' },
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

/* One list of quests for the top of the Buddies tab, not a list per buddy. Each quest shows the buddy who is
 * closest to finishing it: one that is ready to claim first, then the furthest along, then one already claimed.
 * `questsByFriend` is { [friendId]: { [weekStart]: rows } } or null for a friend whose quests could not load.
 * Returns the quests in the order to show them: ready, then in progress, then claimed. */
const RANK = { ready: 0, open: 1, claimed: 2 };
export function groupQuests(friends = [], questsByFriend = {}, weeks) {
  const best = new Map();
  for (const f of friends) {
    for (const v of visibleQuests(questsByFriend?.[f.friend_id], weeks)) {
      const mine = { ...v, friendId: f.friend_id, friendName: f.display_name };
      const cur = best.get(v.quest.id);
      const ratio = (x) => (x.target ? x.progress / x.target : 0);
      if (!cur || RANK[mine.state] < RANK[cur.state] || (RANK[mine.state] === RANK[cur.state] && ratio(mine) > ratio(cur))) {
        best.set(v.quest.id, mine);
      }
    }
  }
  return DUO_QUESTS.map((q) => best.get(q.id)).filter(Boolean)
    .sort((a, b) => RANK[a.state] - RANK[b.state] || Number(Boolean(b.quest.fun)) - Number(Boolean(a.quest.fun)));
}
