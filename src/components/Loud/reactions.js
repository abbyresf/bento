/* The three rating choices save as stars, so Top rated and every average keep working with no database change:
 * Not good is 1, Fine is 3, Loved it is 5. The best answer sits on the right, under the thumb. */
export const REACTIONS = [
  { stars: 1, label: 'Not good', cls: 'is-c' },
  { stars: 3, label: 'Fine',     cls: 'is-b' },
  { stars: 5, label: 'Loved it', cls: 'is-a' },
];

/* An older 1 to 5 star rating shows on the nearest choice. 0 or empty means not rated. */
export const reactionFor = (stars) => (!stars ? 0 : stars <= 2 ? 1 : stars === 3 ? 3 : 5);
