import test from 'node:test';
import assert from 'node:assert/strict';
import {
  researchEnabledFor, normalizeStudyCode, studyCodeProblem, studyText, summarizeStudy,
  daysLeftText, endDateText, pushResultText, isMissingFeature,
  ACK_TEXT, LEAVE_NOTE, DELETE_NOTE, CODE_MAX,
  NOT_ON_LIST_BEFORE, NOT_ON_LIST_LINK, NOT_ON_LIST_AFTER,
  summarizeSurvey, answerProblem, answerFor, surveyReady, buildAnswers, msUntil, MAX_WAIT_MS,
  visibleQuestions, ratingAnchors, ratingHint,
  SURVEY_TODAY, SURVEY_LATE, SURVEY_INTRO, SURVEY_LATE_INTRO, SURVEY_RATING_HINT, SURVEY_THANKS,
} from '../src/data/research.js';

test('the study is on for iOS and nothing else', () => {
  assert.equal(researchEnabledFor('ios'), true);
  for (const p of ['web', 'android', 'IOS', '', null, undefined]) assert.equal(researchEnabledFor(p), false, String(p));
});

test('codes are normalized like the database does it', () => {
  assert.equal(normalizeStudyCode(' maple-2026 '), 'MAPLE2026');
  assert.equal(normalizeStudyCode('maple 2026'), normalizeStudyCode('MAPLE-2026'));
  assert.equal(normalizeStudyCode(null), '');
  assert.equal(normalizeStudyCode('a'.repeat(100)).length, CODE_MAX);
});

test('a code that is too short is caught before it costs a wrong guess', () => {
  assert.ok(studyCodeProblem(''));
  assert.ok(studyCodeProblem('  - '));
  assert.ok(studyCodeProblem('abc12'));
  assert.equal(studyCodeProblem('abc123'), '');
  assert.equal(studyCodeProblem('MAPLE-2026'), '');
});

test('a wrong code and an unlisted account get different words', () => {
  const wrong = studyText('invalid_code');
  const unlisted = studyText('not_on_list');
  assert.notEqual(wrong, unlisted);
  assert.match(unlisted, /not logged as a current participant in a study/);
  assert.match(unlisted, /contact us/);
  assert.doesNotMatch(wrong, /contact|participant/i);
});

test('the unlisted message never says the code was right', () => {
  assert.doesNotMatch(studyText('not_on_list'), /\b(right|correct|valid|good)\b/i);
});

test('the unlisted message is three parts with the link in the middle', () => {
  assert.equal(NOT_ON_LIST_BEFORE + NOT_ON_LIST_LINK + NOT_ON_LIST_AFTER, studyText('not_on_list'));
  assert.equal(NOT_ON_LIST_LINK, 'contact us');
  assert.ok(NOT_ON_LIST_BEFORE.endsWith(' '));
  assert.ok(NOT_ON_LIST_AFTER.startsWith(' '));
});

test('every status the database can return has its own wording', () => {
  const statuses = ['invalid_code', 'not_on_list', 'too_many_attempts', 'already_enrolled',
    'acknowledgement_required', 'ios_only', 'not_signed_in'];
  const texts = statuses.map(studyText);
  assert.equal(new Set(texts).size, statuses.length);
  for (const t of texts) assert.notEqual(t, studyText('nonsense'));
});

test('an error raised by the database reads the same as the status', () => {
  assert.equal(studyText({ message: 'not_signed_in' }), studyText('not_signed_in'));
  assert.equal(studyText(null), 'Something went wrong. Try again.');
});

test('the copy follows the Bento voice: no em dashes, no semicolons, no banned words', () => {
  const all = [ACK_TEXT, LEAVE_NOTE, DELETE_NOTE, pushResultText({ ok: true }), pushResultText({ reason: 'blocked' }),
    pushResultText({}), ...['invalid_code', 'not_on_list', 'too_many_attempts', 'already_enrolled',
      'acknowledgement_required', 'ios_only', 'not_signed_in', 'unavailable', 'x'].map(studyText), studyCodeProblem('')];
  for (const t of all) {
    assert.doesNotMatch(t, /[—;!]/, t);
    assert.doesNotMatch(t, /\b(exciting|powerful|leverage|utilize|revolutionize|boost|seamless|cutting-edge|game-changer|just|actually|really|very)\b/i, t);
  }
});

test('the status row becomes what the screens use', () => {
  assert.deepEqual(summarizeStudy(null), { enrolled: false, state: 'none' });
  assert.deepEqual(summarizeStudy({ enrolled: false }), { enrolled: false, state: 'none' });
  const s = summarizeStudy({ enrolled: true, status: 'active', participant_code: 'P-007', window_ends_at: '2026-11-03T15:00:00Z', days_left: 12 });
  assert.deepEqual(s, { enrolled: true, state: 'active', participantCode: 'P-007', endsAt: '2026-11-03T15:00:00Z', daysLeft: 12 });
  assert.equal(summarizeStudy({ enrolled: true, status: 'completed', days_left: 0 }).state, 'completed');
  assert.equal(summarizeStudy({ enrolled: true, status: 'withdrawn', days_left: 0 }).state, 'withdrawn');
  assert.equal(summarizeStudy({ enrolled: true, status: 'surprise', days_left: -3 }).daysLeft, 0);
});

test('days left reads naturally', () => {
  assert.equal(daysLeftText(21), '21 days left');
  assert.equal(daysLeftText(1), '1 day left');
  assert.equal(daysLeftText(0), 'Last day');
  assert.equal(daysLeftText(-2), 'Last day');
  assert.equal(daysLeftText('x'), 'Last day');
});

test('the end date is a readable day, or nothing', () => {
  assert.match(endDateText('2026-11-03T17:00:00Z'), /^November (2|3)$/);
  assert.equal(endDateText(null), '');
  assert.equal(endDateText('nope'), '');
});

test('turning reminders on reports what happened', () => {
  assert.match(pushResultText({ ok: true }), /on/i);
  assert.match(pushResultText({ ok: false, reason: 'blocked' }), /iOS Settings/);
  assert.match(pushResultText({ ok: false, reason: 'save-failed' }), /try again/i);
});

test('a build that ships before the migration is detected', () => {
  assert.equal(isMissingFeature({ code: 'PGRST202' }), true);
  assert.equal(isMissingFeature({ message: 'Could not find the function public.research_my_status' }), true);
  assert.equal(isMissingFeature({ code: '23505' }), false);
});

const QS = [
  { id: 'q1', format: 'yes_no', text: 'yn' },
  { id: 'q2', format: 'rating', text: 'rt' },
  { id: 'q3', format: 'multiple_choice', text: 'mc', options: ['Good', 'Bad'] },
  { id: 'q4', format: 'short_answer', text: 'sa' },
];

test('the pending-survey row becomes what the screens use', () => {
  assert.deepEqual(summarizeSurvey(null), { state: 'unavailable' });
  assert.deepEqual(summarizeSurvey({ status: 'ios_only' }), { state: 'unavailable' });
  assert.deepEqual(summarizeSurvey({ status: 'none', next_due_at: '2026-10-14T00:00:00Z' }), { state: 'none', nextDueAt: '2026-10-14T00:00:00Z' });
  assert.equal(summarizeSurvey({ status: 'pending', questions: [], for_date: '2026-10-13' }).state, 'none', 'no questions is nothing waiting');
  const s = summarizeSurvey({ status: 'pending', for_date: '2026-10-13T00:00:00.000Z', late: true, questions: QS, next_due_at: null });
  assert.deepEqual([s.state, s.forDate, s.late, s.questions.length], ['pending', '2026-10-13', true, 4]);
});

test('each kind of answer is checked the way the database checks it', () => {
  assert.equal(answerProblem(QS[0], true), '');
  assert.equal(answerProblem(QS[0], false), '');
  for (const bad of ['yes', 1, null, undefined]) assert.ok(answerProblem(QS[0], bad), String(bad));
  for (const good of [1, 2, 3, 4, 5]) assert.equal(answerProblem(QS[1], good), '');
  for (const bad of [0, 6, 2.5, '3', true, null]) assert.ok(answerProblem(QS[1], bad), String(bad));
  assert.equal(answerProblem(QS[2], 'Good'), '');
  for (const bad of ['Other', 1, ['Good'], undefined]) assert.ok(answerProblem(QS[2], bad), String(bad));
  assert.equal(answerProblem(QS[3], ''), '');
  assert.equal(answerProblem(QS[3], 'x'.repeat(500)), '');
  assert.ok(answerProblem(QS[3], 'x'.repeat(501)));
  assert.ok(answerProblem(QS[3], 5));
  assert.ok(answerProblem({ id: 'z', format: 'banana' }, 'x'));
});

test('an untouched free-text question counts as an empty answer, nothing else does', () => {
  assert.equal(answerFor(QS[3], {}), '');
  assert.equal(answerFor(QS[0], {}), undefined);
  assert.equal(surveyReady(QS, { q1: true, q2: 4, q3: 'Bad' }), true, 'free text may be left empty');
  assert.equal(surveyReady(QS, { q1: true, q2: 4 }), false);
  assert.equal(surveyReady(QS, { q1: true, q2: 9, q3: 'Bad' }), false);
  assert.equal(surveyReady([], {}), false);
  assert.equal(surveyReady(null, {}), false);
});

test('the answers sent are one per question keyed by its id', () => {
  assert.deepEqual(buildAnswers(QS, { q1: false, q2: 5, q3: 'Good', q4: 'ok' }), { q1: false, q2: 5, q3: 'Good', q4: 'ok' });
  assert.deepEqual(buildAnswers(QS, { q1: true, q2: 1, q3: 'Bad' }), { q1: true, q2: 1, q3: 'Bad', q4: '' });
  assert.deepEqual(buildAnswers(null, {}), {});
});

test('the app waits until the survey comes due, and not forever', () => {
  const now = Date.parse('2026-10-13T23:00:00Z');
  assert.equal(msUntil('2026-10-14T00:00:00Z', now), 3600 * 1000 + 1000);
  assert.equal(msUntil('2026-10-13T22:00:00Z', now), null, 'already due');
  assert.equal(msUntil(null, now), null);
  assert.equal(msUntil('nope', now), null);
  assert.equal(msUntil('2026-10-20T00:00:00Z', now), MAX_WAIT_MS, 'capped');
});

test('the survey wording follows the Bento voice', () => {
  for (const t of [SURVEY_TODAY, SURVEY_LATE, SURVEY_INTRO, SURVEY_LATE_INTRO, SURVEY_RATING_HINT, SURVEY_THANKS,
                   studyText('not_pending'), studyText('invalid_answers')]) {
    assert.doesNotMatch(t, /[\u2014;!]/, t);
    assert.doesNotMatch(t, /\b(exciting|powerful|leverage|utilize|revolutionize|boost|seamless|cutting-edge|game-changer|just|actually|really|very)\b/i, t);
  }
  assert.notEqual(SURVEY_TODAY, SURVEY_LATE);
  assert.notEqual(studyText('not_pending'), studyText('invalid_answers'));
});

// The researchers' lunch survey for the snack group: a gate, a snack question and a
// follow-up that only applies after yes, then two shared questions.
const SNACK = [
  { id: 'where', format: 'multiple_choice', options: ['Yes - in Usdan', 'Yes - in Sherman', 'No'], show_if: null },
  { id: 'snack', format: 'yes_no', show_if: null },
  { id: 'how', format: 'multiple_choice', options: ['0-20 min before lunch', '21-60 min before lunch'], show_if: { question: 'snack', any_of: [true] } },
  { id: 'goals', format: 'rating', options: ['Not at all', 'Completely'], show_if: null },
];
const DINNER = [
  { id: 'dgate', format: 'multiple_choice', options: ['Yes - in Usdan', 'Yes - in Sherman', 'No'], show_if: null },
  { id: 'dgoals', format: 'rating', show_if: { question: 'dgate', none_of: ['No'] } },
];

test('a follow-up appears only after the answer that calls for it', () => {
  const ids = (a) => visibleQuestions(SNACK, a).map((q) => q.id);
  assert.deepEqual(ids({}), ['where', 'snack', 'goals'], 'unanswered, so the follow-up is hidden');
  assert.deepEqual(ids({ snack: false }), ['where', 'snack', 'goals']);
  assert.deepEqual(ids({ snack: true }), ['where', 'snack', 'how', 'goals']);
});

test('none_of shows a question for any answer except the listed ones, once there is one', () => {
  const ids = (a) => visibleQuestions(DINNER, a).map((q) => q.id);
  assert.deepEqual(ids({}), ['dgate'], 'no answer yet');
  assert.deepEqual(ids({ dgate: 'No' }), ['dgate']);
  assert.deepEqual(ids({ dgate: 'Yes - in Usdan' }), ['dgate', 'dgoals']);
  assert.deepEqual(ids({ dgate: 'Yes - in Sherman' }), ['dgate', 'dgoals']);
});

test('a follow-up of a hidden question is hidden, and a bad condition hides rather than shows', () => {
  const chain = [{ id: 'a', format: 'yes_no' }, { id: 'b', format: 'yes_no', show_if: { question: 'a', any_of: [true] } },
                 { id: 'c', format: 'yes_no', show_if: { question: 'b', any_of: [true] } }];
  assert.deepEqual(visibleQuestions(chain, { a: false, b: true }).map((q) => q.id), ['a']);
  assert.deepEqual(visibleQuestions(chain, { a: true, b: true }).map((q) => q.id), ['a', 'b', 'c']);
  assert.deepEqual(visibleQuestions([{ id: 'x', format: 'yes_no', show_if: { question: 'zzz', any_of: [true] } }], { zzz: true }).map((q) => q.id), [], 'parent not in the survey');
  assert.deepEqual(visibleQuestions([{ id: 'a', format: 'yes_no' }, { id: 'x', format: 'yes_no', show_if: { question: 'a' } }], { a: true }).map((q) => q.id), ['a'], 'a condition with nothing to match');
  assert.deepEqual(visibleQuestions(null, {}), []);
});

test('only the shown questions need answers and only they are sent', () => {
  const answers = { where: 'No', snack: true, goals: 4 };
  assert.equal(surveyReady(SNACK, answers), false, 'the follow-up is now shown and unanswered');
  assert.equal(surveyReady(SNACK, { ...answers, how: '0-20 min before lunch' }), true);
  assert.equal(surveyReady(SNACK, { where: 'No', snack: false, goals: 4 }), true, 'no follow-up needed after no');
  assert.deepEqual(buildAnswers(SNACK, { where: 'No', snack: false, goals: 4 }), { where: 'No', snack: false, goals: 4 });
  // The student said yes, answered the follow-up, then changed to no: the old answer is dropped.
  assert.deepEqual(buildAnswers(SNACK, { where: 'No', snack: false, how: '0-20 min before lunch', goals: 4 }), { where: 'No', snack: false, goals: 4 });
  assert.deepEqual(buildAnswers(DINNER, { dgate: 'No', dgoals: 3 }), { dgate: 'No' });
});

test('a rating shows its own end labels, or the generic hint without them', () => {
  assert.deepEqual(ratingAnchors({ options: ['Not at all', 'Completely'] }), { low: 'Not at all', high: 'Completely' });
  assert.equal(ratingAnchors({ options: [] }), null);
  assert.equal(ratingAnchors({ options: ['One'] }), null);
  assert.equal(ratingAnchors({ options: ['', 'x'] }), null);
  assert.equal(ratingAnchors(null), null);
  assert.equal(ratingHint({ options: ['Not at all', 'Completely'] }), '1 is "Not at all" and 5 is "Completely".');
  assert.equal(ratingHint({ options: [] }), SURVEY_RATING_HINT);
});

test('the research team\'s intro is used when they gave one', () => {
  const row = { status: 'pending', for_date: '2026-10-13', late: false, questions: SNACK, intro: 'This is a 1-minute survey.' };
  assert.equal(summarizeSurvey(row).intro, 'This is a 1-minute survey.');
  assert.equal(summarizeSurvey({ ...row, intro: null }).intro, null);
  assert.equal(summarizeSurvey({ ...row, intro: '   ' }).intro, null);
  assert.equal(summarizeSurvey({ ...row, intro: undefined }).intro, null);
});
