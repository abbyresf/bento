export const BADGES = [
  { id: 'day1',   days: 1,   name: 'First Flame',         emoji: '🔥', description: 'Confirmed your first full day of meals' },
  { id: 'day3',   days: 3,   name: 'On a Roll',            emoji: '⚡', description: '3 days in a row' },
  { id: 'day5',   days: 5,   name: 'Heating Up',           emoji: '🌟', description: '5 consecutive days' },
  { id: 'day7',   days: 7,   name: 'Week Warrior',         emoji: '🏆', description: 'A full week without missing a day' },
  { id: 'day14',  days: 14,  name: 'Two Weeks Strong',     emoji: '💪', description: '14 days of consistency' },
  { id: 'day21',  days: 21,  name: 'Three Week Champ',     emoji: '🎯', description: '21 days — habit officially formed' },
  { id: 'day30',  days: 30,  name: 'Monthly Master',       emoji: '🥇', description: 'A full month of healthy eating' },
  { id: 'day60',  days: 60,  name: 'Two Month Legend',     emoji: '💎', description: 'Two months of dedication' },
  { id: 'day90',  days: 90,  name: 'Quarterly Champion',   emoji: '👑', description: 'Three months — truly elite' },
  { id: 'day180', days: 180, name: 'Half Year Hero',       emoji: '🌈', description: 'Six months of wellness' },
  { id: 'day365', days: 365, name: 'Year of Wellness',     emoji: '🎖️', description: 'A full year. Legendary.' },
];

export function getEarnedBadges(longestStreak) {
  return BADGES.filter(b => longestStreak >= b.days);
}

export function getNewBadge(prevLongest, newLongest) {
  const crossed = BADGES.filter(b => b.days > prevLongest && b.days <= newLongest);
  return crossed.length > 0 ? crossed[crossed.length - 1] : null;
}
