/* Buddy quests: two starter goals you reach together with one buddy.
 *
 * Progress is worked out in the database from both students' confirmed meals
 * (duo_quests, migrations 045, 048, 049, 050, 051, 052 and 053). Nothing here counts calories, amounts or what anyone
 * ate. The targets below must match duo_quest_target in the latest migration that defines it (052),
 * and a test reads that migration to hold them together.
 *
 * Weeks run Monday to Sunday, the same weeks as the personal quests. A quest can be
 * claimed for the current week or the one before, so finishing on Sunday night is not
 * lost if the app is opened on Monday. A claim belongs to the person who made it, and
 * claiming one buddy quest unlocks Bento's colors (data/mascotColors.js). */
import { weekStartOf } from './quests.js';

export const DUO_QUESTS = [
  { id: 'rainbow_plate', title: 'Rainbow plate', what: 'Pick a color together, then both eat something that color', target: 2, unit: 'have done it', emoji: '🌈', fun: true, needsPick: true },
  { id: 'mystery_plate', title: 'Mystery plate', what: 'Each pick a mystery dish for the other, then eat the one you get', target: 2, unit: 'have eaten', emoji: '🎁', fun: true, needsPick: true },
  { id: 'bento_plate',   title: 'Bento plate',   what: 'Both eat a plate with a protein, a vegetable and a grain', target: 2, unit: 'have done it', emoji: '🥗', fun: true, needsPick: true },
  { id: 'match_plate',   title: 'Match the plate', what: 'Eat the same meal with two dishes in common', target: 1, unit: 'meal', emoji: '🍱', fun: true },
  { id: 'pick_of_week',  title: 'Pick of the week', what: 'Each name a favorite, then rate each other\'s pick', target: 2, unit: 'have rated', emoji: '🏆', fun: true, needsPick: true },
  { id: 'taste_test',    title: 'Taste test',    what: 'Both rate the same dish', target: 1, unit: 'dish', emoji: '🍜', fun: true },
  { id: 'review_duo',    title: 'Review duo',    what: 'Both rate 3 dishes', target: 3, unit: 'dishes', emoji: '⭐', fun: true },
  { id: 'twin_day',      title: 'Twin day',      what: 'Both wear the same outfit for a day', target: 2, unit: 'have agreed', emoji: '👯', fun: true, needsPick: true },
  { id: 'outfit_swap',   title: 'Outfit swap',   what: 'Wear each other\'s outfit for a day', target: 2, unit: 'have agreed', emoji: '🎭', fun: true, needsPick: true },
  { id: 'cover_me',      title: 'Cover for me',  what: 'Nudge a buddy to confirm a meal before 8pm', target: 1, unit: 'meal', emoji: '👋', needsPick: true },
  { id: 'daily_duo',     title: 'Daily duo',     what: 'Both confirm a meal on the same day', target: 2, unit: 'days', emoji: '📅' },
  { id: 'week_dinners',  title: 'Week of dinners', what: 'Both confirm dinner on the same night', target: 5, unit: 'nights', emoji: '🌙' },
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
      out.push({ quest: q, week: weeks.lastWeek, label: 'Last week', progress: prev.progress, target: goal(prev), state: 'ready', detail: prev.detail ?? null, acked: prev.acked === true,
        mineDetail: prev.mine_detail ?? null, requestedByMe: prev.requested_by_me === true, detailId: prev.detail_id ?? null });
    }
    if (cur) {
      out.push({
        quest: q, week: weeks.thisWeek, label: 'This week', progress: cur.progress, target: goal(cur), detail: cur.detail ?? null, acked: cur.acked === true,
        mineDetail: cur.mine_detail ?? null, requestedByMe: cur.requested_by_me === true, detailId: cur.detail_id ?? null,
        state: duoQuestState({ ...q, target: goal(cur) }, cur.progress, cur.claimed),
      });
    }
  }
  return out;
}

/* Three quests a week, one of each kind, so the Buddies tab is never crowded. The week number picks which one of
 * each group, and it is the same for everybody, so every quest comes round in turn. The three groups: a plate
 * quest, a rating or favorites quest, and an everyday quest (habits, nudges and outfits). */
const SLOTS = [
  ['mystery_plate', 'rainbow_plate', 'match_plate', 'bento_plate'],
  ['pick_of_week', 'taste_test', 'review_duo'],
  ['daily_duo', 'cover_me', 'twin_day', 'week_dinners', 'outfit_swap'],
];
const WEEK0 = Date.parse('2026-01-05T12:00:00Z');                       // a Monday, week zero
export function weeklyQuestIds(weekStart) {
  const n = Math.floor((Date.parse(`${weekStart}T12:00:00Z`) - WEEK0) / (7 * 86400000));
  return SLOTS.map((group) => group[((n % group.length) + group.length) % group.length]);
}

/* What the card for this quest should offer, given the buddy's row. One of:
 *   'claim'    finished, tap Claim
 *   'start'    nothing begun with any buddy: open the sheet to pick a buddy
 *   'pick'     your buddy picked a mystery dish for you and you have not picked one for them
 *   'nominate' your buddy nominated a favorite (Pick of the week) and you have not
 *   'tap'      tap "I did it" (Rainbow plate, Bento plate)
 *   'rate'     rate your buddy's nominated dish (Pick of the week)
 *   'approve'  your buddy asked for a Twin day or Outfit swap and you have not agreed
 *   null       nothing for you to do right now (waiting, or already claimed) */
export function questAction(quest, row) {
  const { state, detail, mineDetail, acked, requestedByMe } = row;
  if (state === 'claimed') return null;
  if (state === 'ready') return 'claim';
  switch (quest.id) {
    case 'mystery_plate': return !detail && !mineDetail ? 'start' : detail && !mineDetail ? 'pick' : null;
    case 'rainbow_plate':
    case 'bento_plate': return !detail ? 'start' : acked ? null : 'tap';
    case 'pick_of_week':
      if (!detail && !mineDetail) return 'start';
      if (!mineDetail) return 'nominate';
      return detail && !acked ? 'rate' : null;
    case 'cover_me': return requestedByMe ? null : 'start';
    case 'twin_day':
    case 'outfit_swap': return !detail ? 'start' : !requestedByMe && !acked ? 'approve' : null;
    default: return null;
  }
}

/* The two lines on a card: what to do now, and where it stands. `g` is an entry from groupQuests. */
export function questText(g) {
  const q = g.quest;
  const who = g.friendName;
  const lower = (g.detail ?? '').toLowerCase();
  let what = q.what;
  let meta = progressLine(q, g.progress, g.target);
  switch (q.id) {
    case 'mystery_plate':
      if (g.detail && g.mineDetail) what = `You eat ${g.detail}. ${who} eats ${g.mineDetail}. Today or tomorrow.`;
      else if (g.detail) { what = `${who} picked a mystery dish for you: ${g.detail}. Pick one for ${who}.`; meta = 'Your turn to pick'; }
      else if (g.mineDetail) { what = `You picked ${g.mineDetail} for ${who}. Waiting for ${who} to pick one for you.`; meta = 'Waiting for your buddy'; }
      else meta = 'Pick a buddy and a mystery dish for them';
      break;
    case 'rainbow_plate':
      if (g.detail) {
        what = `${g.detail}, with ${who}. Each of you eat something ${lower} today or tomorrow, then tap I did it.`;
        if (g.acked && g.state === 'open') meta += `, waiting for ${who}`;
      } else meta = 'Pick a buddy and a color';
      break;
    case 'bento_plate':
      if (g.detail) {
        what = `With ${who}. Each of you eat a plate with a protein, a vegetable and a grain today or tomorrow, then tap I did it.`;
        if (g.acked && g.state === 'open') meta += `, waiting for ${who}`;
      } else meta = 'Pick a buddy';
      break;
    case 'pick_of_week':
      if (g.detail && g.mineDetail) what = `Your pick: ${g.mineDetail}. ${who}'s pick: ${g.detail}.${g.acked ? '' : ' Rate it to count.'}`;
      else if (g.detail) { what = `${who} named ${g.detail} this week. Name your own favorite.`; meta = 'Your turn to pick'; }
      else if (g.mineDetail) { what = `You named ${g.mineDetail}. Waiting for ${who} to name theirs.`; meta = 'Waiting for your buddy'; }
      else meta = 'Pick a buddy and your favorite';
      break;
    case 'cover_me':
      if (g.requestedByMe) { what = `You nudged ${who}. It counts when they confirm a meal today.`; meta = g.progress > 0 ? 'Covered' : 'Waiting for your buddy'; }
      else meta = 'Pick a buddy who has not confirmed yet';
      break;
    case 'twin_day':
    case 'outfit_swap':
      if (g.detail && g.requestedByMe) { what = `You asked ${who}. Waiting for them to agree.`; meta = 'Waiting for your buddy'; }
      else if (g.detail) { what = `${who} asked for a ${q.title}. Wear it today if you agree.`; meta = 'Asked of you'; }
      else meta = 'Pick a buddy';
      break;
    default:
      if (g.progress > 0) meta += ` with ${who}`;
  }
  if (g.label === 'Last week') meta += ', from last week';
  return { what, meta };
}

/* The quests to show at the top of the Buddies tab: this week's three, each with the buddy closest to finishing it,
 * plus any quest finished last week and not yet claimed. For each quest the buddy shown is: one ready to claim, then
 * one with something for you to do, then one that is under way, then one with nothing begun, then one already claimed.
 * `questsByFriend` is { [friendId]: { [weekStart]: rows } }, or null for a friend whose quests could not load. */
const score = (c) => {
  if (c.action === 'claim') return 0;
  if (c.action && c.action !== 'start') return 1;                      // something for you to do
  if (c.state === 'claimed') return 4;
  return c.action === 'start' ? 3 : 2;                                 // nothing begun, or under way
};
const ratio = (x) => (x.target ? x.progress / x.target : 0);
export function groupQuests(friends = [], questsByFriend = {}, weeks) {
  const thisWeek = new Set(weeklyQuestIds(weeks.thisWeek));
  const best = new Map();
  const carry = [];
  for (const f of friends) {
    for (const v of visibleQuests(questsByFriend?.[f.friend_id], weeks)) {
      const base = { ...v, friendId: f.friend_id, friendName: f.display_name };
      const mine = { ...base, action: questAction(v.quest, base) };
      if (v.week === weeks.lastWeek) { carry.push(mine); continue; }
      if (!thisWeek.has(v.quest.id)) continue;
      const cur = best.get(v.quest.id);
      if (!cur || score(mine) < score(cur) || (score(mine) === score(cur) && ratio(mine) > ratio(cur))) best.set(v.quest.id, mine);
    }
  }
  const out = [...thisWeek].map((id) => best.get(id)).filter(Boolean)
    .map((c) => (c.action === 'start' && c.state === 'open' ? { ...c, state: 'start' } : c))
    .sort((a, b) => score(a) - score(b));
  return [...carry.sort((a, b) => ratio(b) - ratio(a)), ...out];
}
