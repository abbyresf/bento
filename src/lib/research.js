/* Research study: the calls behind joining, checking and leaving.
 *
 * The database side is migration 054 and the design is RESEARCH_DASHBOARD_SPEC.md.
 * The study is part of the iOS app only. Every function here answers
 * "unavailable" on the web and on Android without touching the network, and the
 * database refuses a call that does not say it came from iOS. Pure helpers
 * (wording, code cleanup) live in src/data/research.js so they can be tested.
 *
 * Nothing is cached on the device. A stale "you are in the study" on a shared
 * phone would be worse than a short wait, so the status is always asked for. */
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import {
  STUDY_PLATFORM, researchEnabledFor, normalizeStudyCode, studyCodeProblem,
  studyText, summarizeStudy, summarizeSurvey, isMissingFeature,
} from '../data/research';

export function researchEnabled() {
  return researchEnabledFor(Capacitor.getPlatform());
}

const OFF = { ok: false, status: 'ios_only', message: studyText('ios_only') };

const firstRow = (data) => (Array.isArray(data) ? data[0] : data);

/* The email on the signed-in account, shown so a student can see which one the
 * research team will match against. */
export async function getAccountEmail() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email ?? '';
}

/* Step 1. { ok: true, studyName } or { ok: false, status, message }.
 * status is the database's word: invalid_code, not_on_list, too_many_attempts,
 * already_enrolled. Nothing is recorded about the student, except a wrong code. */
export async function checkStudyCode(code) {
  if (!researchEnabled()) return OFF;
  const problem = studyCodeProblem(code);
  if (problem) return { ok: false, status: 'invalid_code', message: problem, local: true };
  const { data, error } = await supabase.rpc('research_check_code', {
    p_code: normalizeStudyCode(code), p_platform: STUDY_PLATFORM,
  });
  if (error) {
    if (isMissingFeature(error)) return { ok: false, status: 'unavailable', message: studyText('unavailable') };
    return { ok: false, status: 'error', message: studyText(error) };
  }
  const row = firstRow(data);
  if (!row || row.status !== 'ok') {
    return { ok: false, status: row?.status ?? 'error', message: studyText(row?.status) };
  }
  return { ok: true, studyName: row.study_name ?? '' };
}

/* Step 2, after the student ticks the acknowledgement.
 * { ok: true, participantCode, endsAt } or { ok: false, status, message }.
 * The group is decided by the research team and never comes back to the app. */
export async function enrollInStudy(code, acknowledged) {
  if (!researchEnabled()) return OFF;
  const { data, error } = await supabase.rpc('research_enroll', {
    p_code: normalizeStudyCode(code), p_acknowledged: acknowledged === true, p_platform: STUDY_PLATFORM,
  });
  if (error) {
    if (isMissingFeature(error)) return { ok: false, status: 'unavailable', message: studyText('unavailable') };
    return { ok: false, status: 'error', message: studyText(error) };
  }
  const row = firstRow(data);
  if (!row || row.status !== 'ok') {
    return { ok: false, status: row?.status ?? 'error', message: studyText(row?.status) };
  }
  return { ok: true, participantCode: row.participant_code, endsAt: row.window_ends_at };
}

/* { status: 'ok' | 'unavailable' | 'offline', study } where study is
 * { enrolled, state, participantCode, endsAt, daysLeft }. */
export async function getStudyStatus() {
  if (!researchEnabled()) return { status: 'unavailable', study: summarizeStudy(null) };
  const { data, error } = await supabase.rpc('research_my_status');
  if (error) {
    return { status: isMissingFeature(error) ? 'unavailable' : 'offline', study: summarizeStudy(null) };
  }
  return { status: 'ok', study: summarizeStudy(firstRow(data)) };
}

/* Leaves the study. Collection stops, regular reminders return, rows are kept.
 * { ok, study } or { ok: false, message }. */
export async function leaveStudy() {
  if (!researchEnabled()) return OFF;
  const { error } = await supabase.rpc('research_leave');
  if (error) return { ok: false, message: studyText(error) };
  const { study } = await getStudyStatus();
  return { ok: true, study };
}

/* What is waiting for this student, from the schedule alone, so notifications
 * being off never hides it.
 * { status: 'ok' | 'unavailable' | 'offline', survey } where survey is
 * { state: 'none' | 'pending' | 'unavailable', forDate, late, questions, nextDueAt }. */
export async function getPendingSurvey() {
  if (!researchEnabled()) return { status: 'unavailable', survey: summarizeSurvey(null) };
  const { data, error } = await supabase.rpc('research_pending_survey', { p_platform: STUDY_PLATFORM });
  if (error) {
    return { status: isMissingFeature(error) ? 'unavailable' : 'offline', survey: summarizeSurvey(null) };
  }
  return { status: 'ok', survey: summarizeSurvey(firstRow(data)) };
}

/* answers is an object keyed by question id (see buildAnswers).
 * { ok: true } or { ok: false, status, message }. */
export async function submitSurvey(forDate, answers) {
  if (!researchEnabled()) return OFF;
  const { data, error } = await supabase.rpc('research_submit_survey', {
    p_for_date: forDate, p_answers: answers, p_platform: STUDY_PLATFORM,
  });
  if (error) {
    if (isMissingFeature(error)) return { ok: false, status: 'unavailable', message: studyText('unavailable') };
    return { ok: false, status: 'error', message: studyText(error) };
  }
  const row = firstRow(data);
  if (row?.status !== 'ok') return { ok: false, status: row?.status ?? 'error', message: studyText(row?.status) };
  return { ok: true };
}

/* Tells the research team the app was opened. Fire and forget: the database
 * keeps at most one every 20 minutes and ignores anyone not in a study. */
export function logAppOpen() {
  if (!researchEnabled()) return;
  supabase.rpc('research_log_event', { p_kind: 'app_open', p_platform: STUDY_PLATFORM }).then(() => {}, () => {});
}
