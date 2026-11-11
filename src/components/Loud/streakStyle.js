/* Which look the streak moment uses. The four take turns by day count, so two days in a row never look the same. */
export const STREAK_STYLES = ['stripes', 'dots', 'confetti', 'gradient'];

export function streakStyle(streak) {
  const n = Math.max(1, Math.floor(streak || 1));
  return STREAK_STYLES[(n - 1) % STREAK_STYLES.length];
}

/* One short line under the number. Milestones get their own. */
export function streakLine(streak) {
  if (streak === 1) return 'Day one. Bento noticed.';
  if (streak === 7) return 'A full week. Lunch legend.';
  if (streak === 14) return 'Two weeks straight.';
  if (streak === 30) return 'A whole month of showing up.';
  if (streak > 0 && streak % 10 === 0) return `${streak} days. Keep it rolling.`;
  return 'Logged and counted.';
}
