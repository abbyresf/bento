/* The Setup page's logic, with no screen and no network, so it can be tested.
 *
 * The database checks everything again and has the last word. These checks exist so
 * a researcher hears about a mistake before pressing Save, in plain words, and so a
 * form turns into exactly the arguments the database functions want. */

export const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];
export const FORMATS = [
  { id: 'yes_no', label: 'Yes or no' },
  { id: 'rating', label: 'Rating from 1 to 5' },
  { id: 'multiple_choice', label: 'Pick one' },
  { id: 'short_answer', label: 'A few words' },
];
export const FORMAT_LABEL = Object.fromEntries(FORMATS.map((f) => [f.id, f.label]));
export const STUDY_TZ = 'America/New_York';

// ── Days, times, groups ──────────────────────────────────────────────────────

export function daysLabel(days) {
  const d = [...new Set(days ?? [])].sort((a, b) => a - b).join('');
  if (d === '1234567') return 'Every day';
  if (d === '12345') return 'Weekdays';
  if (d === '67') return 'Weekends';
  return WEEKDAYS.filter(([n]) => d.includes(String(n))).map(([, l]) => l).join(', ') || 'No days';
}

/* '10:30:00' or '10:30' to the HH:MM an input wants. */
export function timeInput(t) { const m = /^(\d{2}):(\d{2})/.exec(String(t ?? '')); return m ? `${m[1]}:${m[2]}` : ''; }

/* '22:30:00' to '10:30 pm', how a person reads it. */
export function timeText(t) {
  const m = /^(\d{2}):(\d{2})/.exec(String(t ?? ''));
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

export function groupLabel(grp) { return grp ? `Group ${grp}` : 'Everyone'; }
export function groupsLabel(grps) { return !grps || grps.length === 0 ? 'Everyone' : grps.map((g) => `Group ${g}`).join(' and '); }
export const kindLabel = (k) => (k === 'survey' ? 'End-of-day questions' : 'Reminder');

/* Eastern time in and out of a datetime-local box. The study runs on Eastern time. */
function offsetMinutes(utcMs, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}
export function zonedInput(iso, tz = STUDY_TZ) {
  const t = Date.parse(iso ?? '');
  if (Number.isNaN(t)) return '';
  const local = new Date(t + offsetMinutes(t, tz) * 60000);
  return local.toISOString().slice(0, 16);
}
export function fromZonedInput(text, tz = STUDY_TZ) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(text ?? ''));
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let utc = guess - offsetMinutes(guess, tz) * 60000;
  utc = guess - offsetMinutes(utc, tz) * 60000;   // once more, for a time near a clock change
  return new Date(utc).toISOString();
}

// ── The study ────────────────────────────────────────────────────────────────

export function studyForm(study) {
  return {
    cap: String(study?.cap ?? ''), window_days: String(study?.window_days ?? ''), is_open: Boolean(study?.is_open),
    starts_at: zonedInput(study?.starts_at), ends_at: zonedInput(study?.ends_at), survey_intro: study?.survey_intro ?? '',
  };
}

const isWhole = (s) => /^\d+$/.test(String(s).trim());

export function validateStudyForm(form, { enrolled = 0 } = {}) {
  const out = [];
  if (!isWhole(form.cap) || Number(form.cap) < 1 || Number(form.cap) > 1000) out.push('The cap is a whole number from 1 to 1000.');
  else if (Number(form.cap) < enrolled) out.push(`${enrolled} ${enrolled === 1 ? 'person has' : 'people have'} already enrolled, so the cap cannot be lower than that.`);
  if (!isWhole(form.window_days) || Number(form.window_days) < 1 || Number(form.window_days) > 120) out.push('The study window is a whole number of days from 1 to 120.');
  if (form.starts_at && form.ends_at && form.ends_at <= form.starts_at) out.push('Enrolment must end after it starts.');
  if (String(form.survey_intro ?? '').length > 600) out.push('The survey introduction can be 600 characters at most.');
  return out;
}

/* Only what differs from what is saved, in the shape research_set_study wants. An
 * empty object means there is nothing to save. */
export function studyChanges(study, form) {
  const out = {};
  if (Number(form.cap) !== study.cap) out.cap = Number(form.cap);
  if (Number(form.window_days) !== study.window_days) out.window_days = Number(form.window_days);
  if (Boolean(form.is_open) !== Boolean(study.is_open)) out.is_open = Boolean(form.is_open);
  const was = (iso) => (iso ? new Date(iso).toISOString() : null);
  const startsAt = form.starts_at ? fromZonedInput(form.starts_at) : null;
  const endsAt = form.ends_at ? fromZonedInput(form.ends_at) : null;
  if (startsAt !== was(study.starts_at)) out.starts_at = startsAt;
  if (endsAt !== was(study.ends_at)) out.ends_at = endsAt;
  const intro = String(form.survey_intro ?? '').trim();
  if (intro !== String(study.survey_intro ?? '').trim()) out.survey_intro = intro || null;
  return out;
}

export function enrolmentState(study, now = new Date()) {
  if (!study) return { open: false, text: '' };
  if (!study.is_open) return { open: false, text: 'Closed. Nobody can join, whatever code they have.' };
  const t = now.getTime();
  if (study.starts_at && Date.parse(study.starts_at) > t) return { open: false, text: 'Open, but not until its start date.' };
  if (study.ends_at && Date.parse(study.ends_at) <= t) return { open: false, text: 'Open, but its end date has passed.' };
  return { open: true, text: 'Open. Students with the code and on the list can join.' };
}

// ── Reminder and survey times ────────────────────────────────────────────────

export function scheduleForm(s) {
  return { send_time: timeInput(s?.send_time ?? '10:30'), days: [...(s?.days ?? [1, 2, 3, 4, 5, 6, 7])], late_minutes: String(s?.late_minutes ?? 30), title: s?.title ?? '', body: s?.body ?? '', is_active: s?.is_active ?? true };
}

export function validateScheduleForm(form) {
  const out = [];
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.send_time ?? '')) out.push('Pick a time.');
  if (!form.days || form.days.length === 0) out.push('Pick at least one day.');
  if (!isWhole(form.late_minutes) || Number(form.late_minutes) < 1 || Number(form.late_minutes) > 1440) out.push('How long it can arrive late is a whole number of minutes from 1 to 1440.');
  const title = String(form.title ?? '').trim();
  if (title.length < 1 || title.length > 80) out.push('The title is 1 to 80 characters.');
  if (String(form.body ?? '').length > 200) out.push('The message can be 200 characters at most.');
  return out;
}

export function scheduleChanges(s, form) {
  const out = {};
  if (form.send_time !== timeInput(s.send_time)) out.send_time = form.send_time;
  if (JSON.stringify([...new Set(form.days)].sort((a, b) => a - b)) !== JSON.stringify([...s.days].sort((a, b) => a - b))) out.days = [...new Set(form.days)].sort((a, b) => a - b);
  if (Number(form.late_minutes) !== s.late_minutes) out.late_minutes = Number(form.late_minutes);
  if (String(form.title).trim() !== s.title) out.title = String(form.title).trim();
  if (String(form.body ?? '').trim() !== (s.body ?? '')) out.body = String(form.body ?? '').trim();
  if (Boolean(form.is_active) !== Boolean(s.is_active)) out.is_active = Boolean(form.is_active);
  return out;
}

/* A reminder only counts for a student if it can still arrive before it is useless:
 * say how long it has, in words. */
export function lateText(minutes, kind) {
  const m = Number(minutes);
  const span = m >= 120 && m % 60 === 0 ? `${m / 60} hours` : m === 60 ? '1 hour' : `${m} minutes`;
  return kind === 'survey' ? `A push can still go out up to ${span} after.` : `Dropped, not sent, if it would arrive more than ${span} late.`;
}

// ── Questions ────────────────────────────────────────────────────────────────

export function parseOptionLines(text) {
  const seen = new Set();
  return String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !seen.has(l) && seen.add(l));
}

export function emptyQuestionForm(questions = []) {
  return { text: '', format: 'yes_no', optionsText: '', low: '', high: '', grps: [], position: String(nextPosition(questions)), followUp: false, parent: '', mode: 'any_of', answers: [] };
}

/* The form for changing a question. Saving it adds a new question that replaces
 * this one, which stays, retired, with its answers. */
export function formFromQuestion(q) {
  const f = emptyQuestionForm([]);
  const cond = q.show_if;
  return {
    ...f, text: q.text, format: q.format, grps: [...(q.grps ?? [])], position: String(q.position),
    optionsText: q.format === 'multiple_choice' ? (q.options ?? []).join('\n') : '',
    low: q.format === 'rating' && q.options?.length === 2 ? q.options[0] : '', high: q.format === 'rating' && q.options?.length === 2 ? q.options[1] : '',
    followUp: Boolean(cond), parent: cond?.question ?? '', mode: cond?.none_of ? 'none_of' : 'any_of', answers: [...(cond?.any_of ?? cond?.none_of ?? [])],
  };
}

export function nextPosition(questions) {
  const top = Math.max(0, ...(questions ?? []).filter((q) => q.is_active).map((q) => Number(q.position) || 0));
  return Math.min(1000, Math.floor(top / 10) * 10 + 10);
}

/* The answers a follow-up can depend on, for the question it follows. */
export function answerChoices(parent) {
  if (!parent) return [];
  if (parent.format === 'yes_no') return [{ value: true, label: 'Yes' }, { value: false, label: 'No' }];
  if (parent.format === 'rating') return [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }));
  if (parent.format === 'multiple_choice') return (parent.options ?? []).map((o) => ({ value: o, label: o }));
  return [];
}

export function validateQuestionForm(form, { questions = [], groups = ['S', 'L'] } = {}) {
  const out = [];
  const text = String(form.text ?? '').trim();
  if (text.length < 1 || text.length > 300) out.push('The question is 1 to 300 characters.');
  if (!FORMAT_LABEL[form.format]) out.push('Pick what kind of answer it takes.');
  if (form.format === 'multiple_choice') {
    const opts = parseOptionLines(form.optionsText);
    if (opts.length < 2 || opts.length > 8) out.push('A pick-one question needs 2 to 8 choices, one per line.');
    if (opts.some((o) => o.length > 120)) out.push('Each choice can be 120 characters at most.');
  }
  if (form.format === 'rating') {
    const low = String(form.low ?? '').trim(), high = String(form.high ?? '').trim();
    if ((low && !high) || (!low && high)) out.push('Give both end labels for the rating, or neither.');
  }
  if (!isWhole(form.position) || Number(form.position) > 1000) out.push('The position is a whole number from 0 to 1000.');
  if ((form.grps ?? []).some((g) => !groups.includes(g))) out.push('That group does not exist in this study.');
  if (form.followUp) {
    const parent = questions.find((q) => q.id === form.parent);
    if (!parent) out.push('Pick the question this one follows.');
    else {
      if (isWhole(form.position) && Number(parent.position) >= Number(form.position)) out.push('A follow-up has to come after the question it follows. Give it a higher position.');
      if (answerChoices(parent).length === 0) out.push('Only a yes or no, a rating or a pick-one question can have a follow-up.');
      if ((form.answers ?? []).length === 0) out.push('Pick the answer that shows this follow-up.');
    }
  }
  return out;
}

/* The arguments research_add_question wants. replaces is the question being
 * changed, or null for a new one. */
export function buildQuestionArgs(studyId, form, replaces = null) {
  const options = form.format === 'multiple_choice' ? parseOptionLines(form.optionsText)
    : form.format === 'rating' && String(form.low ?? '').trim() ? [String(form.low).trim(), String(form.high).trim()] : [];
  return {
    p_study: studyId,
    p_text: String(form.text).trim(),
    p_format: form.format,
    p_options: options,
    p_grps: [...(form.grps ?? [])],
    p_position: Number(form.position),
    p_replaces: replaces,
    p_show_if: form.followUp ? { question: form.parent, [form.mode === 'none_of' ? 'none_of' : 'any_of']: form.answers } : null,
  };
}

export const answerText = (v) => (v === true ? 'Yes' : v === false ? 'No' : String(v));

export function describeShowIf(q, byId) {
  const c = q.show_if;
  if (!c) return '';
  const parent = byId.get(c.question);
  const name = parent ? `“${parent.text.length > 50 ? `${parent.text.slice(0, 50)}…` : parent.text}”` : 'an earlier question';
  const list = (c.any_of ?? c.none_of ?? []).map(answerText).join(' or ');
  return c.none_of ? `Only if ${name} is not ${list}` : `Only if ${name} is ${list}`;
}

/* The questions that depend on this one, and the ones that depend on those, that are
 * still being asked. Changing or retiring this question moves or retires them too. */
export function followUpsOf(questions, id) {
  const out = [];
  const visit = (parent) => {
    for (const q of questions ?? []) if (q.is_active && q.show_if?.question === parent) { out.push(q); visit(q.id); }
  };
  visit(id);
  return out;
}

const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/* Why a change to this question cannot be saved, when its follow-ups could not
 * survive it. The database refuses the same changes. This says so first, in words. */
export function changeBreaks(old, form, followUps) {
  const direct = (followUps ?? []).filter((f) => f.show_if?.question === old.id);
  if (direct.length === 0) return [];
  const n = plural(direct.length, 'follow-up', 'follow-ups');
  if (form.format !== old.format) {
    return [`This question has ${n}. Changing the kind of answer would leave them with nothing to follow. Keep the kind of answer, or retire the follow-ups first.`];
  }
  const out = [];
  if (form.format === 'multiple_choice') {
    const offered = parseOptionLines(form.optionsText);
    const gone = direct.flatMap((f) => f.show_if.any_of ?? f.show_if.none_of ?? []).find((v) => !offered.includes(v));
    if (gone !== undefined) out.push(`A follow-up depends on the choice \u201C${answerText(gone)}\u201D. Keep that choice, or retire the follow-up first.`);
  }
  const first = Math.min(...direct.map((f) => Number(f.position)));
  if (isWhole(form.position) && Number(form.position) >= first) out.push(`A follow-up sits at position ${first}. Give this question a lower position, so the follow-up still comes after it.`);
  return out;
}

/* What changing this question would touch, said before anyone does it. */
export function changeWarning(answers, followUps = 0) {
  const n = Number(answers) || 0;
  const moved = followUps > 0 ? ` ${plural(followUps, 'follow-up question moves', 'follow-up questions move')} to the new question with it.` : '';
  if (n === 0) return `Nobody has answered this yet.${moved}`;
  return `${plural(n, 'answer is', 'answers are')} recorded for this wording. Changing the question adds a new one and retires this one. Those answers stay with the old wording. From then on, students are asked the new question, so a column in the data will hold two different questions.${moved}`;
}

export function retireWarning(answers, followUps = 0) {
  const n = Number(answers) || 0;
  const also = followUps > 0 ? ` ${plural(followUps, 'follow-up question that depends', 'follow-up questions that depend')} on it will be retired with it.` : '';
  return (n === 0 ? 'It will stop being asked.' : `It will stop being asked. Its ${plural(n, 'answer stays', 'answers stay')} in the data.`) + also;
}

// ── Errors ───────────────────────────────────────────────────────────────────

const PROBLEMS = {
  not_authorised: 'You are not signed in as a researcher with an authenticator code. Sign in again.',
  unknown_study: 'That study could not be found.',
  unknown_schedule: 'That time could not be found. Reload the page.',
  unknown_question: 'That question could not be found. Reload the page.',
  cap_below_enrolled: 'More people than that have already enrolled.',
  code_in_use: 'Another study already uses that code. Pick a different one.',
  code_too_short: 'The code needs at least 6 letters or numbers.',
  column_name_in_use: 'Another question being asked already uses that column name. Pick a different one.',
  codes_need_one_per_choice: 'Give one number for each choice, in the same order as the choices.',
  codes_not_for_this_question: 'Only a yes or no, or a pick-one question, has codes. A rating is written as its own number.',
  show_if_needs_an_earlier_question: 'A follow-up has to come after the question it follows. Give it a higher position.',
  questions_rating_labels: 'Give both end labels for the rating, or neither.',
  unknown_group: 'That group does not exist in this study.',
  follow_ups_would_break: 'A follow-up depends on this question and could not survive that change. Retire the follow-up first.',
  parent_is_retired: 'That follow-up cannot come back while the question it follows is retired. Bring that question back first.',
  follow_ups_too_deep: 'There are too many follow-ups in a row to move.',
};

export function setupProblem(error) {
  const m = String(error?.message ?? error ?? '');
  for (const [k, v] of Object.entries(PROBLEMS)) if (m.includes(k)) return v;
  const bad = /bad_value: (\w+)/.exec(m);
  if (bad) return `That value for ${bad[1].replace(/_/g, ' ')} is not allowed.`;
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Could not reach the server. Nothing was changed. Try again.';
  return 'That did not save. Nothing was changed.';
}

/* The column name and codes of a question in the wide survey sheet. Codes are one
 * whole number per choice (yes then no for a yes or no question), typed with
 * commas. Blank codes mean the defaults: 1, 2, 3 ... for choices and 1, 0 for yes
 * and no. */
export const wantsCodes = (q) => q.format === 'yes_no' || q.format === 'multiple_choice';
export const codesText = (q) => (Array.isArray(q.codes) ? q.codes.join(', ') : '');
export const defaultCodesText = (q) => (q.format === 'yes_no' ? '1, 0' : (q.options ?? []).map((_, i) => i + 1).join(', '));

export function validateColumn({ key, codes }, q) {
  const out = [];
  const k = String(key ?? '').trim();
  if (k && !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k)) out.push('The column name starts with a letter and uses letters, numbers and underscores, up to 40.');
  const text = String(codes ?? '').trim();
  if (text) {
    if (!wantsCodes(q)) { out.push('Only a yes or no, or a pick-one question, has codes.'); return out; }
    const parts = text.split(',').map((x) => x.trim());
    const want = q.format === 'yes_no' ? 2 : (q.options ?? []).length;
    if (parts.length !== want) out.push(`Give ${want} numbers, one for each choice, separated by commas.`);
    else if (!parts.every((x) => /^-?\d+$/.test(x))) out.push('Codes are whole numbers.');
    else if (new Set(parts).size !== parts.length) out.push('Each choice needs a different number.');
  }
  return out;
}

export const columnArgs = ({ key, codes }, q) => ({
  p_id: q.id,
  p_key: String(key ?? '').trim() || null,
  p_codes: String(codes ?? '').trim() ? String(codes).split(',').map((x) => Number(x.trim())) : null,
});
