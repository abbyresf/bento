/* eslint-env node */
// Copy for the daily meal reminders.
//
// One line each. The notification puts "Bento" in the bold title and the line
// underneath as the body, the way LinkedIn and most native apps do it. Leaving
// the body empty is not neutral on iOS: it fills the gap with its own
// "from Bento" attribution, which reads as a sign off nobody wrote.
//
// Three rules hold every line together.
//
// 1. Never at the student's expense. The joke lands on the dining hall, the
//    food, or Bento. Students with a history of disordered eating use this app,
//    and guilt about eating is the one thing a food reminder must never do.
//
// 2. Never promise the food is good. Bento does not know that, and a reminder
//    that oversells gets distrusted the first time the plate disappoints.
//    Claim the plate is ready, not that it is delicious.
//
// 3. No em dashes, and short enough to sit on one body line. Checked by the
//    audit rather than by eye.
//
// No dining hall is named: it reads wrong to a student who eats elsewhere, and
// breaks outright once a second university is on.

const LUNCH = [
  'Stop scrolling go eat',
  'The dining hall is open. Go.',
  'Your plate is ready. Come get it.',
  'We already picked your lunch',
  "Lunch is sorted. You're welcome.",
  'Food is happening. Go get some.',
  "Plate's ready. Walk there.",
  'This is your lunch reminder',
  'Go eat. We did the thinking.',
  'Lunch has been handled',
  'Food exists. Act accordingly.',
  'Hey. Lunch.',
  'Your plate will not eat itself',
  'Lunch: planned. You: hungry.',
  'We made the lunch call already',
  'Lunch is served. By someone else.',
];

const DINNER = [
  'Stop scrolling go eat',
  'Dinner is ready. Come get it.',
  'We already picked your dinner',
  "Dinner is sorted. You're welcome.",
  'Last meal of the day. Go.',
  'The hall closes eventually',
  "Plate's ready. Walk there.",
  'This is your dinner reminder',
  'Go eat. We did the thinking.',
  'Dinner has been handled',
  "Food is available. That's the news.",
  'Hey. Dinner.',
  'Your plate will not eat itself',
  'Dinner: planned. You: hungry.',
  'We made the dinner call already',
  'Dinner is served. By someone else.',
];

// Rotates by day so consecutive days differ and the pool cycles rather than
// repeating at random. The same date always yields the same line, so a student
// who looks twice does not see it change underneath them.
function dayIndex(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function reminderMessage(meal, dateStr) {
  const i = Math.abs(dayIndex(dateStr));
  // Dinner is offset so the two meals never land on the same line on the same
  // day, which would read as a bug rather than a rotation.
  return meal === 'dinner'
    ? DINNER[(i + 5) % DINNER.length]
    : LUNCH[i % LUNCH.length];
}

export const POOLS = { lunch: LUNCH, dinner: DINNER };
