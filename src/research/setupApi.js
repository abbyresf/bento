import { supabase as defaultClient } from './supabase.js';
import { setupProblem } from './setup.js';

/* Reading and changing the study's setup. Reads go straight to the research tables,
 * which a researcher may read. Every change goes through a database function, which
 * checks who is asking, checks the values, and writes the audit entry. */

/* The study (the newest real one), its times and questions, how many answers each
 * question has, and how the researchers' list is doing. Throws with a message. */
export async function loadSetup(client = defaultClient) {
  const r = client.schema('research');
  const { data: studies, error: e1 } = await r.from('studies')
    .select('id,name,cap,is_open,window_days,starts_at,ends_at,survey_intro,groups,timezone')
    .order('created_at', { ascending: false }).limit(1);
  if (e1) throw new Error(e1.message || 'Could not read the study.');
  const study = studies?.[0];
  if (!study) return { study: null, schedules: [], questions: [], usage: {}, enrolled: 0, onList: 0, notYet: 0 };

  const [sch, qs, use, people, roster] = await Promise.all([
    r.from('reminder_schedules').select('*').eq('study_id', study.id).order('kind').order('send_time'),
    r.from('questions').select('*').eq('study_id', study.id).order('position').order('created_at'),
    r.from('question_usage').select('question_id,answers'),
    r.from('grid_participants').select('row_id'),
    r.from('grid_roster').select('row_id,enrolled'),
  ]);
  for (const x of [sch, qs, use, people, roster]) if (x.error) throw new Error(x.error.message || 'Could not read the setup.');
  const rosterRows = roster.data ?? [];
  return {
    study,
    schedules: sch.data ?? [],
    questions: qs.data ?? [],
    usage: Object.fromEntries((use.data ?? []).map((u) => [u.question_id, u.answers])),
    enrolled: (people.data ?? []).length,
    onList: rosterRows.length,
    notYet: rosterRows.filter((x) => !x.enrolled).length,
  };
}

async function call(name, args, client = defaultClient) {
  const { data, error } = await client.rpc(name, args);
  return error ? { ok: false, message: setupProblem(error) } : { ok: true, data };
}

export const saveStudy = (studyId, changes, client) => call('research_set_study', { p_study: studyId, p_changes: changes }, client);
export const saveStudyCode = (studyId, code, client) => call('research_set_study_code', { p_study: studyId, p_code: code }, client);
export const saveSchedule = (id, changes, client) => call('research_save_schedule', { p_id: id, p_changes: changes }, client);
export const addSchedule = (studyId, s, client) => call('research_add_schedule', {
  p_study: studyId, p_grp: s.grp || null, p_kind: s.kind, p_time: s.send_time, p_title: s.title, p_body: s.body ?? '', p_days: s.days, p_late: Number(s.late_minutes),
}, client);
export const addQuestion = (args, client) => call('research_add_question', args, client);
export const setQuestion = (id, { active = null, position = null } = {}, client) => call('research_set_question', { p_id: id, p_active: active, p_position: position }, client);
