import test from 'node:test';
import assert from 'node:assert/strict';
import {
  daysLabel, timeInput, timeText, groupLabel, groupsLabel, kindLabel, zonedInput, fromZonedInput,
  studyForm, validateStudyForm, studyChanges, enrolmentState,
  scheduleForm, validateScheduleForm, scheduleChanges, lateText,
  parseOptionLines, emptyQuestionForm, formFromQuestion, nextPosition, answerChoices, validateQuestionForm,
  buildQuestionArgs, answerText, describeShowIf, changeWarning, retireWarning, setupProblem, FORMATS,
  followUpsOf, changeBreaks,
} from '../src/research/setup.js';

// ── Days, times and Eastern ──────────────────────────────────────────────────

test('days read the way a person says them', () => {
  assert.equal(daysLabel([1, 2, 3, 4, 5, 6, 7]), 'Every day');
  assert.equal(daysLabel([5, 4, 3, 2, 1]), 'Weekdays');
  assert.equal(daysLabel([7, 6]), 'Weekends');
  assert.equal(daysLabel([1, 3, 5]), 'Mon, Wed, Fri');
  assert.equal(daysLabel([2, 2]), 'Tue');
  assert.equal(daysLabel([]), 'No days');
  assert.equal(daysLabel(null), 'No days');
});

test('times convert both ways, including midnight and noon', () => {
  assert.equal(timeInput('10:30:00'), '10:30');
  assert.equal(timeInput('09:05'), '09:05');
  assert.equal(timeInput(null), '');
  assert.equal(timeText('10:30:00'), '10:30 am');
  assert.equal(timeText('20:00:00'), '8:00 pm');
  assert.equal(timeText('00:15:00'), '12:15 am');
  assert.equal(timeText('12:00:00'), '12:00 pm');
  assert.equal(timeText('nope'), '');
});

test('labels for groups and kinds', () => {
  assert.equal(groupLabel('S'), 'Group S'); assert.equal(groupLabel(null), 'Everyone');
  assert.equal(groupsLabel([]), 'Everyone'); assert.equal(groupsLabel(['S', 'L']), 'Group S and Group L');
  assert.equal(kindLabel('survey'), 'End-of-day questions'); assert.equal(kindLabel('reminder'), 'Reminder');
});

test('Eastern time converts through daylight saving in both directions', () => {
  // EDT (UTC minus 4) in October, EST (minus 5) in November.
  assert.equal(zonedInput('2026-10-13T14:30:00Z'), '2026-10-13T10:30');
  assert.equal(zonedInput('2026-11-02T15:30:00Z'), '2026-11-02T10:30');
  assert.equal(fromZonedInput('2026-10-13T10:30'), '2026-10-13T14:30:00.000Z');
  assert.equal(fromZonedInput('2026-11-02T10:30'), '2026-11-02T15:30:00.000Z');
  assert.equal(zonedInput('2026-10-14T03:30:00Z'), '2026-10-13T23:30', 'late evening is still the day before in UTC');
  for (const iso of ['2026-10-13T14:30:00.000Z', '2026-11-01T05:30:00.000Z', '2026-03-08T12:00:00.000Z', '2026-12-25T00:00:00.000Z']) {
    assert.equal(fromZonedInput(zonedInput(iso)), iso, `round trip ${iso}`);
  }
  assert.equal(zonedInput(null), ''); assert.equal(zonedInput('x'), '');
  assert.equal(fromZonedInput(''), null); assert.equal(fromZonedInput('2026-10-13'), null);
});

// ── The study ────────────────────────────────────────────────────────────────

const STUDY = { cap: 40, window_days: 21, is_open: true, starts_at: null, ends_at: null, survey_intro: 'Hello.' };

test('the study form starts from what is saved, and saving nothing is nothing', () => {
  const f = studyForm(STUDY);
  assert.deepEqual(f, { cap: '40', window_days: '21', is_open: true, starts_at: '', ends_at: '', survey_intro: 'Hello.' });
  assert.deepEqual(studyChanges(STUDY, f), {});
});

test('only what changed is sent', () => {
  const f = { ...studyForm(STUDY), cap: '50', is_open: false, window_days: '28' };
  assert.deepEqual(studyChanges(STUDY, f), { cap: 50, window_days: 28, is_open: false });
  assert.deepEqual(studyChanges(STUDY, { ...studyForm(STUDY), survey_intro: '   ' }), { survey_intro: null }, 'a blank intro clears it');
  assert.deepEqual(studyChanges(STUDY, { ...studyForm(STUDY), survey_intro: ' Hello. ' }), {}, 'spaces alone are not a change');
  assert.deepEqual(studyChanges(STUDY, { ...studyForm(STUDY), starts_at: '2026-10-12T09:00' }), { starts_at: '2026-10-12T13:00:00.000Z' });
  const dated = { ...STUDY, starts_at: '2026-10-12T13:00:00+00:00', ends_at: '2026-12-01T05:00:00Z' };
  assert.deepEqual(studyChanges(dated, studyForm(dated)), {}, 'a saved date that has not been touched is not a change');
  assert.deepEqual(studyChanges(dated, { ...studyForm(dated), ends_at: '' }), { ends_at: null });
});

test('the study form says what is wrong before the database does', () => {
  const ok = studyForm(STUDY);
  assert.deepEqual(validateStudyForm(ok, { enrolled: 12 }), []);
  assert.match(validateStudyForm({ ...ok, cap: '10' }, { enrolled: 12 })[0], /12 people have already enrolled/);
  assert.match(validateStudyForm({ ...ok, cap: '1' }, { enrolled: 1 }).join(' ') || 'fine', /fine/);
  assert.match(validateStudyForm({ ...ok, cap: '1' }, { enrolled: 2 })[0], /2 people/);
  assert.match(validateStudyForm({ ...ok, cap: '0' })[0], /whole number from 1 to 1000/);
  assert.match(validateStudyForm({ ...ok, cap: '2.5' })[0], /whole number/);
  assert.match(validateStudyForm({ ...ok, cap: 'abc' })[0], /whole number/);
  assert.match(validateStudyForm({ ...ok, cap: '1001' })[0], /1000/);
  assert.match(validateStudyForm({ ...ok, window_days: '0' })[0], /1 to 120/);
  assert.match(validateStudyForm({ ...ok, window_days: '121' })[0], /1 to 120/);
  assert.match(validateStudyForm({ ...ok, starts_at: '2026-11-02T09:00', ends_at: '2026-11-01T09:00' })[0], /end after it starts/);
  assert.match(validateStudyForm({ ...ok, survey_intro: 'x'.repeat(601) })[0], /600/);
  assert.equal(validateStudyForm({ ...ok, cap: '', window_days: '' }).length, 2);
});

test('the study says whether anyone can join right now, and why not', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  assert.equal(enrolmentState(null).open, false);
  assert.equal(enrolmentState({ is_open: true }, now).open, true);
  assert.match(enrolmentState({ is_open: false }, now).text, /Closed/);
  assert.match(enrolmentState({ is_open: true, starts_at: '2026-10-20T00:00:00Z' }, now).text, /start date/);
  assert.match(enrolmentState({ is_open: true, ends_at: '2026-10-01T00:00:00Z' }, now).text, /end date has passed/);
  assert.equal(enrolmentState({ is_open: true, starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-11-01T00:00:00Z' }, now).open, true);
});

// ── Times ────────────────────────────────────────────────────────────────────

const SCHED = { send_time: '10:30:00', days: [1, 2, 3, 4, 5, 6, 7], late_minutes: 30, title: 'Snack time', body: 'Eat your snack now.', is_active: true, kind: 'reminder' };

test('a schedule form starts from what is saved, and an untouched one changes nothing', () => {
  const f = scheduleForm(SCHED);
  assert.deepEqual(f, { send_time: '10:30', days: [1, 2, 3, 4, 5, 6, 7], late_minutes: '30', title: 'Snack time', body: 'Eat your snack now.', is_active: true });
  assert.deepEqual(scheduleChanges(SCHED, f), {});
  assert.deepEqual(scheduleChanges(SCHED, { ...f, days: [7, 6, 5, 4, 3, 2, 1, 1] }), {}, 'order and repeats do not count');
});

test('a schedule edit sends only what changed', () => {
  const f = { ...scheduleForm(SCHED), send_time: '11:00', days: [5, 1, 3], title: ' New title ', late_minutes: '15', is_active: false, body: '' };
  assert.deepEqual(scheduleChanges(SCHED, f), { send_time: '11:00', days: [1, 3, 5], title: 'New title', late_minutes: 15, is_active: false, body: '' });
});

test('a schedule form says what is wrong', () => {
  const ok = scheduleForm(SCHED);
  assert.deepEqual(validateScheduleForm(ok), []);
  assert.match(validateScheduleForm({ ...ok, send_time: '' })[0], /time/);
  assert.match(validateScheduleForm({ ...ok, send_time: '25:00' })[0], /time/);
  assert.match(validateScheduleForm({ ...ok, days: [] })[0], /at least one day/);
  assert.match(validateScheduleForm({ ...ok, late_minutes: '0' })[0], /1 to 1440/);
  assert.match(validateScheduleForm({ ...ok, late_minutes: '1441' })[0], /1 to 1440/);
  assert.match(validateScheduleForm({ ...ok, title: '  ' })[0], /title/);
  assert.match(validateScheduleForm({ ...ok, title: 'x'.repeat(81) })[0], /title/);
  assert.match(validateScheduleForm({ ...ok, body: 'x'.repeat(201) })[0], /200/);
});

test('the late window is explained in words', () => {
  assert.match(lateText(30, 'reminder'), /more than 30 minutes late/);
  assert.match(lateText(60, 'reminder'), /1 hour/);
  assert.match(lateText(180, 'survey'), /3 hours/);
  assert.match(lateText(90, 'survey'), /90 minutes/);
});

// ── Questions ────────────────────────────────────────────────────────────────

const Q = (over) => ({ id: 'q', text: 'Q', format: 'yes_no', options: [], grps: [], position: 10, is_active: true, show_if: null, ...over });
const SNACK = Q({ id: 'snack', text: 'Did you eat the snack given to you before lunch today?', format: 'yes_no', grps: ['S'], position: 20 });
const HOW = Q({ id: 'how', text: 'How long before lunch did you eat the snack?', format: 'multiple_choice', grps: ['S'], position: 21,
  options: ['0-20 min before lunch', '21-60 min before lunch', 'More than 1 hour before lunch'], show_if: { question: 'snack', any_of: [true] } });
const GOALS = Q({ id: 'goals', text: 'To what extent were your lunch choices today consistent with your eating goals?', format: 'rating', options: ['Not at all', 'Completely'], position: 30 });
const ALL = [SNACK, HOW, GOALS];

test('answer options are read one per line, trimmed, with no blanks or repeats', () => {
  assert.deepEqual(parseOptionLines(' A \n\nB\r\nA\n  \nC '), ['A', 'B', 'C']);
  assert.deepEqual(parseOptionLines(''), []);
  assert.deepEqual(parseOptionLines(null), []);
});

test('a new question goes at the end, in steps of ten', () => {
  assert.equal(nextPosition([]), 10);
  assert.equal(nextPosition(ALL), 40);
  assert.equal(nextPosition([Q({ position: 5 }), Q({ position: 1000 })]), 1000);
  assert.equal(nextPosition([Q({ position: 70, is_active: false }), Q({ position: 20 })]), 30, 'a retired question does not push it');
  assert.equal(emptyQuestionForm(ALL).position, '40');
});

test('a follow-up can depend on the answers the question before it can give', () => {
  assert.deepEqual(answerChoices(SNACK), [{ value: true, label: 'Yes' }, { value: false, label: 'No' }]);
  assert.deepEqual(answerChoices(GOALS).map((c) => c.value), [1, 2, 3, 4, 5]);
  assert.deepEqual(answerChoices(HOW).map((c) => c.label), HOW.options);
  assert.deepEqual(answerChoices(Q({ format: 'short_answer' })), [], 'free text has nothing to match');
  assert.deepEqual(answerChoices(null), []);
});

test('the question form says what is wrong', () => {
  const base = { ...emptyQuestionForm(ALL), text: 'A good question?' };
  const check = (patch) => validateQuestionForm({ ...base, ...patch }, { questions: ALL });
  assert.deepEqual(check({}), []);
  assert.match(check({ text: '  ' })[0], /1 to 300/);
  assert.match(check({ text: 'x'.repeat(301) })[0], /1 to 300/);
  assert.match(check({ format: 'banana' })[0], /kind of answer/);
  assert.match(check({ format: 'multiple_choice', optionsText: 'Only one' })[0], /2 to 8/);
  assert.match(check({ format: 'multiple_choice', optionsText: Array.from({ length: 9 }, (_, i) => `o${i}`).join('\n') })[0], /2 to 8/);
  assert.deepEqual(check({ format: 'multiple_choice', optionsText: 'A\nB' }), []);
  assert.match(check({ format: 'multiple_choice', optionsText: `A\n${'x'.repeat(121)}` })[0], /120/);
  assert.match(check({ format: 'rating', low: 'Not at all' })[0], /both end labels/);
  assert.match(check({ format: 'rating', high: 'Completely' })[0], /both end labels/);
  assert.deepEqual(check({ format: 'rating', low: 'Low', high: 'High' }), []);
  assert.deepEqual(check({ format: 'rating' }), [], 'no labels is fine');
  assert.match(check({ position: '-1' })[0], /position/); assert.match(check({ position: '1001' })[0], /position/); assert.match(check({ position: 'x' })[0], /position/);
  assert.match(validateQuestionForm({ ...base, grps: ['Z'] }, { questions: ALL, groups: ['S', 'L'] })[0], /group/);
});

test('a follow-up must follow an earlier question that can be matched, with an answer chosen', () => {
  const base = { ...emptyQuestionForm(ALL), text: 'Follow up?', followUp: true, position: '25', parent: 'snack', answers: [true] };
  const check = (patch) => validateQuestionForm({ ...base, ...patch }, { questions: ALL });
  assert.deepEqual(check({}), []);
  assert.match(check({ parent: '' })[0], /Pick the question/);
  assert.match(check({ parent: 'nope' })[0], /Pick the question/);
  assert.match(check({ position: '20' })[0], /higher position/, 'the same place is not after');
  assert.match(check({ position: '15' })[0], /higher position/);
  assert.match(check({ answers: [] })[0], /Pick the answer/);
  assert.match(validateQuestionForm({ ...base, parent: 'free' }, { questions: [...ALL, Q({ id: 'free', format: 'short_answer', position: 5 })] })[0], /yes or no, a rating or a pick-one/);
});

test('the form becomes exactly the arguments the database wants', () => {
  const f = { ...emptyQuestionForm(ALL), text: '  How was lunch?  ', format: 'multiple_choice', optionsText: 'Good\nOkay\n\nBad', grps: ['L'], position: '50' };
  assert.deepEqual(buildQuestionArgs('study-1', f), {
    p_study: 'study-1', p_text: 'How was lunch?', p_format: 'multiple_choice', p_options: ['Good', 'Okay', 'Bad'], p_grps: ['L'], p_position: 50, p_replaces: null, p_show_if: null,
  });
  assert.deepEqual(buildQuestionArgs('s', { ...f, format: 'rating', low: ' Not at all ', high: 'Completely' }).p_options, ['Not at all', 'Completely']);
  assert.deepEqual(buildQuestionArgs('s', { ...f, format: 'rating' }).p_options, [], 'a rating with no labels has no options');
  assert.deepEqual(buildQuestionArgs('s', { ...f, format: 'yes_no', optionsText: 'left over' }).p_options, [], 'options belong only to a pick-one');
  const follow = buildQuestionArgs('s', { ...f, followUp: true, parent: 'snack', mode: 'any_of', answers: [true] }, 'old-id');
  assert.deepEqual(follow.p_show_if, { question: 'snack', any_of: [true] });
  assert.equal(follow.p_replaces, 'old-id');
  assert.deepEqual(buildQuestionArgs('s', { ...f, followUp: true, parent: 'where', mode: 'none_of', answers: ['No'] }).p_show_if, { question: 'where', none_of: ['No'] });
  assert.equal(buildQuestionArgs('s', { ...f, followUp: false, parent: 'snack', answers: [true] }).p_show_if, null, 'a switched-off follow-up sends no condition');
});

test('changing a question loads it back into the form and rebuilds the same question', () => {
  for (const q of ALL) {
    const f = formFromQuestion(q);
    assert.deepEqual(validateQuestionForm(f, { questions: ALL.filter((x) => x.id !== q.id) }), [], q.id);
    const args = buildQuestionArgs('s', f, q.id);
    assert.equal(args.p_text, q.text);
    assert.equal(args.p_format, q.format);
    assert.deepEqual(args.p_options, q.options);
    assert.deepEqual(args.p_grps, q.grps);
    assert.equal(args.p_position, q.position);
    assert.deepEqual(args.p_show_if, q.show_if);
    assert.equal(args.p_replaces, q.id);
  }
  assert.deepEqual(formFromQuestion(HOW).answers, [true]);
  assert.equal(formFromQuestion(HOW).parent, 'snack');
  assert.equal(formFromQuestion(GOALS).low, 'Not at all');
  assert.equal(formFromQuestion(SNACK).followUp, false);
  const none = formFromQuestion(Q({ show_if: { question: 'x', none_of: ['No'] } }));
  assert.deepEqual([none.mode, none.answers], ['none_of', ['No']]);
});

test('a follow-up is described by the question and the answer that shows it', () => {
  const byId = new Map(ALL.map((q) => [q.id, q]));
  assert.equal(describeShowIf(HOW, byId), 'Only if \u201CDid you eat the snack given to you before lunch to\u2026\u201D is Yes', 'a long question is shortened to 50 characters');
  const short = new Map([['s', Q({ id: 's', text: 'Ate lunch?' })]]);
  assert.equal(describeShowIf(Q({ show_if: { question: 's', none_of: [false] } }), short), 'Only if \u201CAte lunch?\u201D is not No', 'a short one is shown whole');
  assert.match(describeShowIf(Q({ show_if: { question: 'gone', any_of: [1, 2] } }), byId), /an earlier question.*1 or 2/);
  assert.equal(describeShowIf(SNACK, byId), '');
  assert.equal(answerText(true), 'Yes'); assert.equal(answerText(false), 'No'); assert.equal(answerText(4), '4'); assert.equal(answerText('A'), 'A');
});

test('changing or retiring a question says what it touches before it is done', () => {
  assert.match(changeWarning(0), /Nobody has answered/);
  assert.match(changeWarning(1), /1 answer is recorded/);
  assert.match(changeWarning(1234), /1,234 answers are recorded/);
  assert.match(changeWarning(1234), /two different questions/);
  assert.match(retireWarning(0), /stop being asked/);
  assert.match(retireWarning(5), /5 answers stay/);
  assert.match(retireWarning(1), /1 answer stays/);
});

// ── Errors and voice ─────────────────────────────────────────────────────────

test('database errors become plain words, and anything unknown says nothing changed', () => {
  assert.match(setupProblem({ message: 'not_authorised' }), /sign in again/i);
  assert.match(setupProblem({ message: 'cap_below_enrolled' }), /already enrolled/);
  assert.match(setupProblem({ message: 'code_in_use' }), /Another study/);
  assert.match(setupProblem({ message: 'code_too_short' }), /at least 6/);
  assert.match(setupProblem({ message: 'show_if_needs_an_earlier_question' }), /higher position/);
  assert.match(setupProblem({ message: 'bad_value: late_minutes' }), /late minutes/);
  assert.match(setupProblem({ message: 'Failed to fetch' }), /Nothing was changed/);
  assert.match(setupProblem(null), /Nothing was changed/);
  assert.match(setupProblem({ message: 'xx something odd' }), /Nothing was changed/);
  assert.equal(setupProblem({ message: 'xx' }), setupProblem({ message: 'yy' }), 'unknown errors reveal nothing');
});

test('the page wording follows the Bento voice: no em dashes, no semicolons, no banned words', () => {
  const texts = [changeWarning(0), changeWarning(5), retireWarning(0), retireWarning(5), lateText(30, 'reminder'), lateText(180, 'survey'),
    ...['not_authorised', 'cap_below_enrolled', 'code_in_use', 'code_too_short', 'show_if_needs_an_earlier_question', 'x'].map((m) => setupProblem({ message: m })),
    ...validateStudyForm({ cap: '0', window_days: '0', starts_at: '2026-01-02T00:00', ends_at: '2026-01-01T00:00', survey_intro: 'x'.repeat(700) }),
    ...validateScheduleForm({ send_time: '', days: [], late_minutes: '0', title: '', body: 'x'.repeat(300) }),
    ...validateQuestionForm({ text: '', format: 'x', position: 'x', followUp: true, parent: '' }),
    enrolmentState({ is_open: false }).text, enrolmentState({ is_open: true }).text, ...FORMATS.map((f) => f.label)];
  for (const t of texts) {
    assert.doesNotMatch(t, /[—;!]/, t);
    assert.doesNotMatch(t, /\b(exciting|powerful|leverage|utilize|revolutionize|boost|seamless|cutting-edge|game-changer|just|actually|really|very)\b/i, t);
  }
});

// ── Follow-ups travel with their question ────────────────────────────────────

const CHAIN = [
  Q({ id: 'a', text: 'A', position: 10 }),
  Q({ id: 'b', text: 'B', position: 20, show_if: { question: 'a', any_of: [true] } }),
  Q({ id: 'c', text: 'C', position: 30, show_if: { question: 'b', any_of: [true] } }),
  Q({ id: 'd', text: 'D', position: 40 }),
  Q({ id: 'old', text: 'Old follow-up', position: 25, is_active: false, show_if: { question: 'a', any_of: [true] } }),
];

test('the follow-ups of a question are found, all the way down, and retired ones are not', () => {
  assert.deepEqual(followUpsOf(CHAIN, 'a').map((q) => q.id), ['b', 'c']);
  assert.deepEqual(followUpsOf(CHAIN, 'b').map((q) => q.id), ['c']);
  assert.deepEqual(followUpsOf(CHAIN, 'c'), []);
  assert.deepEqual(followUpsOf(CHAIN, 'd'), []);
  assert.deepEqual(followUpsOf(null, 'a'), []);
  assert.deepEqual(followUpsOf([SNACK, HOW], 'snack').map((q) => q.id), ['how']);
});

test('a change that would leave a follow-up with nothing to follow is refused with the reason', () => {
  const f = (patch) => ({ ...formFromQuestion(SNACK), ...patch });
  const fus = followUpsOf([SNACK, HOW], 'snack');
  assert.deepEqual(changeBreaks(SNACK, f({}), fus), [], 'rewording alone is fine');
  assert.deepEqual(changeBreaks(SNACK, f({ text: 'New words' }), fus), []);
  assert.match(changeBreaks(SNACK, f({ format: 'rating' }), fus)[0], /1 follow-up\. Changing the kind of answer/);
  assert.match(changeBreaks(SNACK, f({ position: '21' }), fus)[0], /position 21/);
  assert.match(changeBreaks(SNACK, f({ position: '40' }), fus)[0], /lower position/);
  assert.deepEqual(changeBreaks(SNACK, f({ position: '10' }), fus), []);
  assert.deepEqual(changeBreaks(SNACK, f({ format: 'rating' }), []), [], 'with no follow-ups anything goes');
  assert.deepEqual(changeBreaks(SNACK, f({ format: 'rating' }), null), []);
});

test('a pick-one question cannot drop a choice a follow-up depends on', () => {
  const gate = Q({ id: 'gate', format: 'multiple_choice', options: ['Yes - in Usdan', 'Yes - in Sherman', 'No'], position: 50 });
  const dinner = Q({ id: 'dg', position: 70, format: 'rating', show_if: { question: 'gate', none_of: ['No'] } });
  const fus = followUpsOf([gate, dinner], 'gate');
  const f = (optionsText) => ({ ...formFromQuestion(gate), optionsText });
  assert.deepEqual(changeBreaks(gate, f('Yes - in Usdan\nYes - in Sherman\nNo\nSomewhere else'), fus), []);
  assert.match(changeBreaks(gate, f('Yes - in Usdan\nYes - in Sherman'), fus)[0], /choice \u201CNo\u201D/);
});

test('the warnings say how many follow-ups come along', () => {
  assert.match(changeWarning(0, 2), /2 follow-up questions move to the new question with it/);
  assert.match(changeWarning(0, 1), /1 follow-up question moves/);
  assert.match(changeWarning(40, 1), /40 answers are recorded.*1 follow-up question moves/);
  assert.doesNotMatch(changeWarning(40, 0), /follow-up/);
  assert.match(retireWarning(0, 2), /2 follow-up questions that depend on it will be retired with it/);
  assert.match(retireWarning(5, 1), /5 answers stay.*1 follow-up question that depends on it/);
  assert.doesNotMatch(retireWarning(5, 0), /follow-up/);
});

test('the new errors read as plain words', () => {
  assert.match(setupProblem({ message: 'follow_ups_would_break' }), /Retire the follow-up first/);
  assert.match(setupProblem({ message: 'parent_is_retired' }), /Bring that question back first/);
  const texts = [changeBreaks(SNACK, { ...formFromQuestion(SNACK), format: 'rating' }, [HOW])[0], changeWarning(3, 2), retireWarning(3, 2),
    setupProblem({ message: 'follow_ups_would_break' }), setupProblem({ message: 'parent_is_retired' }), setupProblem({ message: 'follow_ups_too_deep' })];
  for (const x of texts) {
    assert.doesNotMatch(x, /[\u2014;!]/, x);
    assert.doesNotMatch(x, /\b(just|actually|really|very|seamless|boost)\b/i, x);
  }
});
