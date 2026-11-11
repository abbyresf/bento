/* The shorter setup's steps, decided by the picks on "What brings you here?".
 * - Hit my goals or Train for a sport adds the body details (skippable) and, with them, the review of targets.
 * - Eat safely adds dietary restrictions.
 * - Rate a few staples and Foods you like are always offered, both optional.
 * - The research study question stays wherever the app asks it today (the iPhone app). */
export const DETAIL_STEPS = ['basics', 'activity', 'goals'];

export function setupSteps({ why = [], detailsSkipped = false, research = false }) {
  const withDetails = (why.includes('goals') || why.includes('sport')) && !detailsSkipped;
  return [
    'university', 'why',
    ...(withDetails ? DETAIL_STEPS : []),
    ...(why.includes('safe') ? ['dietary'] : []),
    'swipe', 'likes',
    ...(research ? ['study'] : []),
    ...(withDetails ? ['review'] : []),
  ];
}
