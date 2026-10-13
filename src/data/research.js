/* Research study: the pure parts of enrolment.
 *
 * Nothing here touches the network or the screen, so it can be tested. The
 * database side is supabase/migrations/054_research_foundation.sql and the design
 * is RESEARCH_DASHBOARD_SPEC.md. Copy follows the Bento voice: short, active, no
 * exclamation marks.
 *
 * The study lives in the iOS app only. The web app (the PWA) shows none of it,
 * and the database refuses a call that does not say it came from iOS. */
export { isMissingFeature } from './duo.js';

export const STUDY_PLATFORM = 'ios';

/* The research features belong to the iOS build and nothing else. Capacitor
 * reports 'ios', 'android' or 'web'. */
export function researchEnabledFor(platform) {
  return platform === STUDY_PLATFORM;
}

/* The one thing Bento asks of a student. The consent form itself is the research
 * team's, signed in their survey. */
export const ACK_TEXT = 'I completed the study consent form and I am 18 or over.';

/* The database refuses codes shorter than this at creation. Checking here means
 * an empty field never costs a wrong guess. */
export const CODE_MIN = 6;
export const CODE_MAX = 40;

/* Typed codes come in with spaces, dashes and any case. Matches the database. */
export function normalizeStudyCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_MAX);
}

/* '' when the code is fine to send, otherwise what to tell the student. */
export function studyCodeProblem(raw) {
  return normalizeStudyCode(raw).length < CODE_MIN ? 'Enter the study code the research team gave you.' : '';
}

/* An account that is not on the research team's list. The words "contact us" are
 * a link to the Contact page, so the sentence comes in three parts and the screen
 * puts the link in the middle. It does not say the code was right. The usual cause
 * is a different email, so the screen also shows which one is signed in. */
export const NOT_ON_LIST_BEFORE = 'You are not logged as a current participant in a study. Please ';
export const NOT_ON_LIST_LINK = 'contact us';
export const NOT_ON_LIST_AFTER = ' if you think this is a mistake.';

const TEXT = {
  invalid_code: 'That code did not work. Check it and try again.',
  not_on_list: NOT_ON_LIST_BEFORE + NOT_ON_LIST_LINK + NOT_ON_LIST_AFTER,
  too_many_attempts: 'Too many tries. Wait an hour and try again.',
  already_enrolled: 'You are already in this study.',
  acknowledgement_required: 'Tick the box to join.',
  ios_only: 'The study runs in the Bento iOS app.',
  not_signed_in: 'Sign in first.',
  unavailable: 'Studies are not available yet. Try again later.',
  not_pending: 'These questions are no longer open.',
  invalid_answers: 'Check your answers and try again.',
};

/* What to show for a status the database returned, or an error it raised. */
export function studyText(statusOrError) {
  const raw = String(statusOrError?.message ?? statusOrError ?? '');
  for (const [key, text] of Object.entries(TEXT)) if (raw.includes(key)) return text;
  return 'Something went wrong. Try again.';
}

/* research_my_status returns one row. This turns it into what the screens use.
 * state: 'none' | 'active' | 'completed' | 'withdrawn'. */
export function summarizeStudy(row) {
  if (!row || row.enrolled !== true) return { enrolled: false, state: 'none' };
  const state = ['active', 'completed', 'withdrawn'].includes(row.status) ? row.status : 'active';
  return {
    enrolled: true,
    state,
    participantCode: row.participant_code ?? '',
    endsAt: row.window_ends_at ?? null,
    daysLeft: Math.max(0, Number(row.days_left) || 0),
  };
}

export function daysLeftText(n) {
  const d = Math.max(0, Math.floor(Number(n) || 0));
  if (d === 0) return 'Last day';
  return d === 1 ? '1 day left' : `${d} days left`;
}

/* "November 3". Local time, because the student reads it on their own phone. */
export function endDateText(iso) {
  const t = Date.parse(iso ?? '');
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export const LEAVE_NOTE = 'Leaving stops the study reminders and your regular Bento reminders come back. The research team keeps what was collected up to now.';

export const DELETE_NOTE = 'You are in a research study. Deleting your account does not delete your study data. The research team keeps it under the study consent form.';

/* The push step after joining. reason comes from subscribeToPush in push.js. */
export function pushResultText(result) {
  if (result?.ok) return 'Study reminders are on.';
  if (result?.reason === 'blocked') return 'Notifications are blocked. Turn them on for Bento Dining in iOS Settings.';
  return 'Could not turn reminders on. You can try again from Settings.';
}

// ── The end-of-day questions ─────────────────────────────────────────────────
// The questions come from the research team and are stored in the database, so
// nothing here knows what they ask. This is the shape of an answer, the checks
// that match the database's own, and the wording around them.

export const SURVEY_TODAY = "Today's questions";
export const SURVEY_LATE = "Yesterday's questions";
export const SURVEY_INTRO = 'A few questions about your day. Your answers go to the research team.';
export const SURVEY_LATE_INTRO = 'You did not get to these yesterday. You can answer them now.';
export const SURVEY_RATING_HINT = '1 is the lowest and 5 is the highest.';
export const SURVEY_THANKS = 'Thank you. Your answers are sent.';
export const SURVEY_MAX_TEXT = 500;

/* research_pending_survey returns one row. state: 'none' | 'pending' | 'unavailable'. */
export function summarizeSurvey(row) {
  if (!row || row.status === 'ios_only') return { state: 'unavailable' };
  if (row.status !== 'pending' || !Array.isArray(row.questions) || row.questions.length === 0) {
    return { state: 'none', nextDueAt: row.next_due_at ?? null };
  }
  return {
    state: 'pending',
    forDate: String(row.for_date ?? '').slice(0, 10),
    late: row.late === true,
    questions: row.questions,
    nextDueAt: row.next_due_at ?? null,
    // The research team's own line above the questions, when they gave one.
    intro: typeof row.intro === 'string' && row.intro.trim() ? row.intro : null,
  };
}

/* '' when the answer is fine, otherwise a reason. Mirrors the database, which has
 * the final say. */
export function answerProblem(question, value) {
  const f = question?.format;
  if (f === 'yes_no') return typeof value === 'boolean' ? '' : 'Pick yes or no.';
  if (f === 'rating') return Number.isInteger(value) && value >= 1 && value <= 5 ? '' : 'Pick a number from 1 to 5.';
  if (f === 'multiple_choice') return Array.isArray(question.options) && question.options.includes(value) ? '' : 'Pick one.';
  if (f === 'short_answer') return typeof value === 'string' && value.length <= SURVEY_MAX_TEXT ? '' : 'Keep it under 500 characters.';
  return 'This question cannot be answered here.';
}

/* A free-text answer may be left empty, so an untouched one counts as an empty
 * string. Every other kind needs a pick. */
export function answerFor(question, answers) {
  const v = answers?.[question.id];
  return v === undefined && question.format === 'short_answer' ? '' : v;
}

/* A follow-up question carries show_if: {question, any_of} shows it when the answer
 * to that earlier question is one of the listed values, and {question, none_of}
 * shows it for any other answer. Questions come in order and a follow-up always
 * follows the one it depends on, so one pass settles which are shown. A follow-up
 * of a hidden question is hidden too. Mirrors the database, which has the final
 * say and refuses an answer to a question that was not shown. */
export function visibleQuestions(questions, answers) {
  const shown = {};
  const out = [];
  for (const q of Array.isArray(questions) ? questions : []) {
    const cond = q.show_if;
    let show = true;
    if (cond && typeof cond === 'object') {
      const parentAnswer = answers?.[cond.question];
      if (!shown[cond.question] || parentAnswer === undefined) show = false;
      else if (Array.isArray(cond.any_of)) show = cond.any_of.includes(parentAnswer);
      else if (Array.isArray(cond.none_of)) show = !cond.none_of.includes(parentAnswer);
      else show = false;
    }
    shown[q.id] = show;
    if (show) out.push(q);
  }
  return out;
}

export function surveyReady(questions, answers) {
  const shown = visibleQuestions(questions, answers);
  return shown.length > 0 && shown.every((q) => answerProblem(q, answerFor(q, answers)) === '');
}

/* The object the database wants: one answer per question that is shown, keyed by
 * question id. An answer left over from a question that has since been hidden (the
 * student changed an earlier answer) is dropped, not sent. */
export function buildAnswers(questions, answers) {
  return Object.fromEntries(visibleQuestions(questions, answers).map((q) => [q.id, answerFor(q, answers)]));
}

/* A rating may carry labels for its two ends, as ["Not at all", "Completely"]. */
export function ratingAnchors(question) {
  const o = question?.options;
  return Array.isArray(o) && o.length === 2 && o.every((x) => typeof x === 'string' && x.trim())
    ? { low: o[0], high: o[1] } : null;
}

export function ratingHint(question) {
  const a = ratingAnchors(question);
  return a ? `1 is "${a.low}" and 5 is "${a.high}".` : SURVEY_RATING_HINT;
}

/* Milliseconds to wait before asking again, so the survey opens by itself when
 * today's comes due while the app is open. null when there is nothing to wait for.
 * Capped, because a very long timer is not worth trusting: the app also asks
 * whenever it comes back to the front. */
export const MAX_WAIT_MS = 6 * 60 * 60 * 1000;
export function msUntil(iso, now = Date.now()) {
  const t = Date.parse(iso ?? '');
  if (Number.isNaN(t)) return null;
  const ms = t - now;
  if (ms <= 0) return null;
  return Math.min(ms + 1000, MAX_WAIT_MS);
}
