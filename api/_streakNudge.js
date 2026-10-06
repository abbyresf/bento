// Who gets the evening streak nudge. A pure function, so it can be tested.
//
// A student is nudged when ALL of these hold:
//   - their streak is running: it has a count above zero and its last confirmed
//     day is yesterday or the day before. The day before counts because one
//     missed dining day is forgiven (see increment_streak), so that streak can
//     still be saved. Anything older has lapsed and is not nudged.
//   - nothing has counted today: the last confirmed day is not today.
//
// `rows` come from the streaks table. `today` is the Eastern date, YYYY-MM-DD.
// Returns [{ user_id, count }].

function addDays(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + delta * 86400000);
  return t.toISOString().slice(0, 10);
}

export function streakRecipients(rows, today) {
  const yesterday = addDays(today, -1);
  const dayBefore = addDays(today, -2);
  return (rows ?? [])
    .filter((r) => (r.current_streak ?? 0) > 0
      && r.last_confirmed_date
      && r.last_confirmed_date !== today
      && (r.last_confirmed_date === yesterday || r.last_confirmed_date === dayBefore))
    .map((r) => ({ user_id: r.user_id, count: r.current_streak }));
}
