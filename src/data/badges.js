// Streak badges.
//
// Ten tiers, and the top one is reachable inside a single semester. The old set
// ran to 365 days, which no student could reach: the streak treats a day with no
// dining_availability record as a missed day, and over winter break nobody opens
// the app to write one, so the gap reads as weeks of misses and the streak
// resets. A badge nobody can earn is worse than no badge.
//
// `fill` is the art state, 1 to 10, consumed by BentoBadge. Each tier adds one
// thing to the box in a physically coherent order: rice, then greens, then
// protein, then fruit, then the garnish, then the finished box. There is no
// emoji field any more. The art is drawn.

export const BADGES = [
  { id: 'd1',  days: 1,  fill: 1,  name: 'First Grain',    description: 'You confirmed a meal. The box is started.' },
  { id: 'd3',  days: 3,  fill: 2,  name: 'Rice Packed',    description: 'Three days running.' },
  { id: 'd7',  days: 7,  fill: 3,  name: 'Greens In',      description: 'A full week.' },
  { id: 'd14', days: 14, fill: 4,  name: 'Greens Packed',  description: 'Two weeks without a gap.' },
  { id: 'd21', days: 21, fill: 5,  name: 'Protein In',     description: 'Three weeks. Past the hard part.' },
  { id: 'd30', days: 30, fill: 6,  name: 'Protein Packed', description: 'A month of showing up.' },
  { id: 'd45', days: 45, fill: 7,  name: 'Fruit In',       description: 'Six and a half weeks.' },
  { id: 'd60', days: 60, fill: 8,  name: 'Fruit Packed',   description: 'Two months. Most of a term.' },
  { id: 'd75', days: 75, fill: 9,  name: 'Garnished',      description: 'Seventy five days.' },
  { id: 'd90', days: 90, fill: 10, name: 'Full Box',       description: 'Ninety days. The box is packed.' },
];

export const TOP_TIER = BADGES[BADGES.length - 1];

export function getEarnedBadges(longestStreak) {
  return BADGES.filter(b => longestStreak >= b.days);
}

export function getNewBadge(prevLongest, newLongest) {
  const crossed = BADGES.filter(b => b.days > prevLongest && b.days <= newLongest);
  return crossed.length > 0 ? crossed[crossed.length - 1] : null;
}

// How full the box should look for a given streak, 0 to 10. Used by the panel
// and the celebration so both read from the same rule.
export function fillForStreak(streak) {
  let fill = 0;
  for (const b of BADGES) if (streak >= b.days) fill = b.fill;
  return fill;
}

// The next tier to aim at, or null once the box is full.
export function nextBadge(streak) {
  return BADGES.find(b => streak < b.days) ?? null;
}
