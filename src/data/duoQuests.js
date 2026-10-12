/* Buddy quests: two starter goals you reach together with one buddy.
 *
 * Progress is worked out in the database from both students' confirmed meals
 * (duo_quests, migrations 045, 048, 049 and 050). Nothing here counts calories, amounts or what anyone
 * ate. The targets below must match duo_quest_target in the latest migration that defines it (050),
 * and a test reads that migration to hold them together.
 *
 * Weeks run Monday to Sunday, the same weeks as the personal quests. A quest can be
 * claimed for the current week or the one before, so finishing on Sunday night is not
 * lost if the app is opened on Monday. A claim belongs to the person who made it, and
 * claiming one buddy quest unlocks Bento's colors (data/mascotColors.js). */
import { weekStartOf } from './quests.js';

export const DUO_QUESTS = [
  { id: 'mystery_plate', title: 'Mystery plate', what: 'Pick a dish you both can eat, then both eat it', target: 2, unit: 'have eaten', emoji: '🎁', fun: true, needsPick: true },
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
      out.push({ quest: q, week: weeks.lastWeek, label: 'Last week', progress: prev.progress, target: goal(prev), state: 'ready', detail: prev.detail ?? null });
    }
    if (cur) {
      out.push({
        quest: q, week: weeks.thisWeek, label: 'This week', progress: cur.progress, target: goal(cur), detail: cur.detail ?? null,
        state: duoQuestState({ ...q, target: goal(cur) }, cur.progress, cur.claimed),
      });
    }
  }
  return out;
}

/* Three quests a week, one of each kind, so the Buddies tab is never crowded. The week number picks which one of
 * each pair, and it is the same for everybody. Plate quests rotate Mystery plate and Match the plate, rating
 * quests rotate Taste test and Review duo, habit quests rotate Daily duo and Week of dinners. */
const SLOTS = [
  ['mystery_plate', 'match_plate'],
  ['taste_test', 'review_duo'],
  ['daily_duo', 'week_dinners'],
];
const WEEK0 = Date.parse('2026-01-05T12:00:00Z');                       // a Monday, week zero
export function weeklyQuestIds(weekStart) {
  const n = Math.floor((Date.parse(`${weekStart}T12:00:00Z`) - WEEK0) / (7 * 86400000));
  return SLOTS.map((pair) => pair[((n % pair.length) + pair.length) % pair.length]);
}

/* The quests to show at the top of the Buddies tab: this week's three, each with the buddy closest to finishing it,
 * plus any quest finished last week and not yet claimed. For each quest the buddy shown is one ready to claim
 * first, then one with a pick or progress, then one already claimed. A quest that needs a pick (Mystery plate)
 * and has none yet has the state 'start'.
 * `questsByFriend` is { [friendId]: { [weekStart]: rows } }, or null for a friend whose quests could not load. */
const score = (c) => {
  if (c.state === 'ready') return 0;
  if (c.state === 'claimed') return 3;
  if (c.quest.needsPick && !c.detail) return 2;
  return 1;
};
const ratio = (x) => (x.target ? x.progress / x.target : 0);
export function groupQuests(friends = [], questsByFriend = {}, weeks) {
  const thisWeek = new Set(weeklyQuestIds(weeks.thisWeek));
  const best = new Map();
  const carry = [];
  for (const f of friends) {
    for (const v of visibleQuests(questsByFriend?.[f.friend_id], weeks)) {
      const mine = { ...v, friendId: f.friend_id, friendName: f.display_name };
      if (v.week === weeks.lastWeek) { carry.push(mine); continue; }
      if (!thisWeek.has(v.quest.id)) continue;
      const cur = best.get(v.quest.id);
      if (!cur || score(mine) < score(cur) || (score(mine) === score(cur) && ratio(mine) > ratio(cur))) best.set(v.quest.id, mine);
    }
  }
  const out = [...thisWeek].map((id) => best.get(id)).filter(Boolean)
    .map((c) => (c.quest.needsPick && !c.detail && c.state === 'open' ? { ...c, state: 'start' } : c))
    .sort((a, b) => score(a) - score(b));
  return [...carry.sort((a, b) => ratio(b) - ratio(a)), ...out];
}
