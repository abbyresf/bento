/* The numbers on the Live page, worked out from the rows the dashboard already
 * has. Pure, so they can be checked. */

/* Today in Eastern time as YYYY-MM-DD. The study runs on Eastern time. */
export function todayEastern(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

const rate = (answered, due) => (due > 0 ? Math.round((answered / due) * 1000) / 10 : null);

/* Survey response rate per group and overall: answered over due, summed across
 * participants. null when nothing has come due yet. This is the number that has to
 * be published beside every waste figure, and the one that drives compensation. */
export function responseRates(activityRows) {
  const out = { S: { answered: 0, due: 0 }, L: { answered: 0, due: 0 }, all: { answered: 0, due: 0 } };
  for (const r of activityRows ?? []) {
    const g = out[r.grp] ?? null;
    const answered = Number(r.surveys_answered) || 0;
    const due = Number(r.surveys_due) || 0;
    if (g) { g.answered += answered; g.due += due; }
    out.all.answered += answered; out.all.due += due;
  }
  for (const k of Object.keys(out)) out[k].rate = rate(out[k].answered, out[k].due);
  return out;
}

export function liveSummary({ participants = [], activity = [], prompts = [], events = [], cap = null, now = new Date() }) {
  const today = todayEastern(now);
  const by = (status) => participants.filter((p) => p.status === status).length;
  const active = participants.filter((p) => p.status === 'active');
  const todays = prompts.filter((p) => p.local_date === today);
  return {
    enrolled: participants.length,
    cap,
    active: active.length,
    completed: by('completed'),
    withdrawn: by('withdrawn'),
    groups: { S: active.filter((p) => p.grp === 'S').length, L: active.filter((p) => p.grp === 'L').length },
    pushOff: active.filter((p) => p.push_status !== 'on').length,
    prompts: {
      today: todays.length,
      sent: todays.filter((p) => p.status === 'sent').length,
      failed: todays.filter((p) => p.status === 'failed').length,
      noDevice: todays.filter((p) => p.status === 'no_device').length,
    },
    rates: responseRates(activity),
    recent: [...events].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 15),
  };
}

/* How far apart the two groups are, for the arm balance card. */
export function groupBalance(groups) { return Math.abs((groups?.S ?? 0) - (groups?.L ?? 0)); }
