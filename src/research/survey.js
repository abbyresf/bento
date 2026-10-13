/* The wide survey sheet: one row per participant per day, one column per question,
 * answers written as numeric codes. This is the shape of the researchers' May
 * export (lunchYN, lunch_loop, lunch_waste ...), which their analysis expects.
 *
 * The database sends each day's raw answers keyed by question id (the
 * grid_survey_wide view). Everything here is done in the browser from those and
 * the list of questions, so changing a question's column name or codes in Setup
 * re-labels past rows the next time they are read, and a new question needs no
 * database change. */

/* The column a question belongs to. Its own name when it has one, otherwise
 * q<position>, with the group appended when it is for one group only, so the two
 * versions of a question at one position do not share a column by accident. */
export function columnName(q) {
  const own = typeof q.column_key === 'string' ? q.column_key.trim() : '';
  if (own) return own;
  const g = Array.isArray(q.grps) && q.grps.length === 1 ? `_${String(q.grps[0]).toLowerCase()}` : '';
  return `q${q.position}${g}`;
}

/* The number an answer is written as. A pick-one answer is its choice's code (the
 * choice's place, from 1, when no codes are set). Yes is 1 and no is 0 unless set.
 * A rating is itself. Typed text stays text. An answer the question does not
 * recognise comes out empty rather than as a wrong number. */
export function codeFor(q, answer) {
  if (answer === null || answer === undefined) return null;
  const codes = Array.isArray(q.codes) ? q.codes : null;
  switch (q.format) {
    case 'yes_no': {
      if (typeof answer !== 'boolean') return null;
      return answer ? (codes?.[0] ?? 1) : (codes?.[1] ?? 0);
    }
    case 'multiple_choice': {
      const i = (q.options ?? []).indexOf(answer);
      return i < 0 ? null : (codes?.[i] ?? i + 1);
    }
    case 'rating': return typeof answer === 'number' ? answer : null;
    default: return typeof answer === 'string' ? answer : null;
  }
}

/* The columns, in the order the questions are asked. Questions that share a name
 * (a reworded question carries its name on) are one column. A retired question with
 * no answers is left out. */
export function questionColumns(questions, rows = []) {
  const answered = new Set();
  for (const r of rows) for (const id of Object.keys(r.answers ?? {})) answered.add(id);
  const by = new Map();
  for (const q of [...questions].sort((a, b) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)))) {
    if (!q.is_active && !answered.has(q.id)) continue;
    const name = columnName(q);
    const key = name.toLowerCase();
    if (!by.has(key)) by.set(key, { field: name, questions: [] });
    by.get(key).questions.push(q);
  }
  return [...by.values()].map(({ field, questions: qs }) => ({
    field,
    header: field,
    type: qs.every((q) => q.format !== 'short_answer') ? 'number' : 'text',
    width: Math.max(110, Math.min(220, field.length * 9 + 40)),
    questions: qs,
  }));
}

/* Flattens the view's rows into the sheet's rows. */
export function wideRows(rows, questions) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const nameOf = new Map(questions.map((q) => [q.id, columnName(q)]));
  return rows.map((r) => {
    const out = { ...r };
    for (const [id, answer] of Object.entries(r.answers ?? {})) {
      const q = byId.get(id);
      if (!q) continue;
      const v = codeFor(q, answer);
      if (v !== null) out[nameOf.get(id)] = v;
    }
    delete out.answers;
    return out;
  });
}

/* What a column holds, for the data dictionary: the wording (all versions, if it
 * changed) and what each number means. */
export function columnMeaning(col) {
  const parts = col.questions.map((q) => {
    const who = Array.isArray(q.grps) && q.grps.length ? ` Asked of group ${q.grps.join(' and ')} only.` : '';
    const legend = q.format === 'yes_no'
      ? ` ${codeFor(q, true)} = Yes, ${codeFor(q, false)} = No.`
      : q.format === 'multiple_choice'
        ? ` ${(q.options ?? []).map((o) => `${codeFor(q, o)} = ${o}`).join(', ')}.`
        : q.format === 'rating'
          ? ` 1 to 5${(q.options ?? []).length === 2 ? `, 1 = ${q.options[0]}, 5 = ${q.options[1]}` : ''}.`
          : ' Typed by the participant.';
    return `${q.text}${legend}${who}${q.is_active ? '' : ' (no longer asked)'}`;
  });
  return parts.join(' | ');
}

/* The sheet with its question columns and a dictionary for them. */
export function withQuestions(sheet, questions, rows = []) {
  const cols = questionColumns(questions, rows);
  const dictionary = {};
  for (const c of cols) dictionary[c.field] = { source: 'App, end-of-day survey', meaning: columnMeaning(c) };
  return { ...sheet, columns: [...sheet.columns, ...cols.map((c) => ({ field: c.field, header: c.header, type: c.type, width: c.width }))], dictionary };
}

/* A few numbers to read before the grid. */
export function highlights(rows, questions) {
  const people = new Set(rows.map((r) => r.participant_code));
  const late = rows.filter((r) => r.late === true).length;
  const groups = {};
  for (const r of rows) groups[r.grp] = (groups[r.grp] ?? 0) + 1;
  const out = [
    { label: 'Submissions', value: rows.length.toLocaleString() },
    { label: 'Participants answering', value: people.size.toLocaleString() },
    { label: 'Answered late', value: rows.length ? `${Math.round((late / rows.length) * 100)}%` : '0%' },
    ...Object.keys(groups).sort().map((g) => ({ label: `Group ${g}`, value: groups[g].toLocaleString() })),
  ];
  const byId = new Map(questions.map((q) => [q.id, q]));
  const sums = new Map();
  for (const r of rows) {
    for (const [id, answer] of Object.entries(r.answers ?? {})) {
      const q = byId.get(id);
      if (!q || q.format !== 'rating' || typeof answer !== 'number') continue;
      const k = columnName(q);
      const s = sums.get(k) ?? { n: 0, sum: 0 };
      s.n += 1; s.sum += answer; sums.set(k, s);
    }
  }
  for (const [k, s] of sums) out.push({ label: `${k}, average`, value: (s.sum / s.n).toFixed(2) });
  return out;
}
