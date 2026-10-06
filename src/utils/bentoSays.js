/* What Bento says on the Today screen, and how it looks while saying it.
 *
 * A pure function of the moment: what time it is, which meals are confirmed and
 * where the streak stands. No clock reads, no storage, so every line can be
 * tested.
 *
 * Rules, the same ones the reminders follow (api/reminderMessages.js):
 *   1. Never at the student's expense. Nothing here mentions food eaten, food
 *      skipped or a number missed. A streak is about confirming, and the line
 *      says the streak is still going, never that it is in danger.
 *   2. Never promise the food is good. Say the plate is ready.
 *   3. No em dashes, no semicolons, short enough for a bubble.
 */
const GENERIC = [
  'Your plates are ready when you are.',
  'Tap a meal to see what Bento picked.',
  'Hungry? Same.',
  'Plates are built. Go get them.',
  'Confirm a meal and watch the streak grow.',
];

const pick = (list, seed) => list[Math.abs(seed) % list.length];

// A number from a date string, so the line changes daily but not on every render.
const seedOf = (iso) => [...iso].reduce((n, c) => n + c.charCodeAt(0), 0);

export function bentoSays({ hour, today, confirmed, streak }) {
  const done = ['breakfast', 'lunch', 'dinner'].filter((m) => confirmed?.[m]).length;
  const current = streak?.currentStreak ?? 0;
  const confirmedToday = streak?.lastConfirmedDate === today;

  if (done === 3) {
    return { mood: 'cheer', text: 'All three meals logged. Nice work.' };
  }

  // The streak is alive, nothing has counted today, and it is evening.
  if (current > 0 && !confirmedToday && done === 0 && hour >= 17) {
    return { mood: 'happy', text: `Your ${current}-day streak is still going. One tap keeps it.` };
  }

  if (done > 0 && current > 0 && confirmedToday) {
    return { mood: 'cheer', text: `${current} day${current === 1 ? '' : 's'} and counting.` };
  }

  if (done === 0 && hour < 11) {
    return { mood: 'happy', text: 'Morning! Your plates are ready.' };
  }
  if (!confirmed?.lunch && hour >= 11 && hour < 15) {
    return { mood: 'happy', text: "Lunch is up. Plate's ready." };
  }
  if (!confirmed?.dinner && hour >= 16 && hour < 21) {
    return { mood: 'happy', text: "Dinner's coming up. Plate's ready." };
  }
  if (hour >= 22 || hour < 5) {
    return { mood: 'sleepy', text: 'Late one. See you tomorrow.' };
  }
  return { mood: 'happy', text: pick(GENERIC, seedOf(today)) };
}

/* What the "Your voice" card says under the numbers.
 *
 * It is only allowed to say what is true. At a partner school the dining team
 * works with Bento and sees Pulse, so it may say they see what students confirm
 * and rate. Everywhere else the honest claim is the one that is always true:
 * ratings feed the plates Bento builds for that campus. */
export function voiceMessage({ diningPartner, diningTeamName, universityName }) {
  if (diningPartner) {
    return `${diningTeamName ?? 'The dining team'} sees what students confirm and rate. That includes you.`;
  }
  return `Your ratings shape the plates Bento builds for everyone at ${universityName ?? 'your school'}.`;
}
