/* The numbers on the Live page, worked out from the rows the dashboard already
 * has. Pure, so they can be checked. */

/* Today in Eastern time as YYYY-MM-DD. The study runs on Eastern time. */
export function todayEastern(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

const rate = (answered, due) => (due > 0 ? Math.round((answered / due) * 1000) / 10 : null);

/* Survey response rate: answered over due, summed across participants. null when
 * nothing has come due yet. The study has one group (everyone takes the snack), so
 * there is one rate. This is the number that drives compensation. */
export function responseRates(activityRows) {
  const all = { answered: 0, due: 0 };
  for (const r of activityRows ?? []) {
    all.answered += Number(r.surveys_answered) || 0;
    all.due += Number(r.surveys_due) || 0;
  }
  all.rate = rate(all.answered, all.due);
  return { all };
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
    // Active people who have entered the start code at the snack pickup, and those
    // who joined but have not yet. Nothing is sent or collected before it.
    started: active.filter((p) => p.activated_at).length,
    waiting: active.filter((p) => !p.activated_at).length,
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

