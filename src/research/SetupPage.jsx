import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadSetup, saveStudy, saveStudyCode, saveSchedule, addSchedule, addQuestion, setQuestion } from './setupApi.js';
import {
  WEEKDAYS, FORMATS, FORMAT_LABEL, daysLabel, timeText, groupLabel, groupsLabel, kindLabel, lateText, enrolmentState,
  studyForm, validateStudyForm, studyChanges, scheduleForm, validateScheduleForm, scheduleChanges,
  emptyQuestionForm, formFromQuestion, validateQuestionForm, buildQuestionArgs, answerChoices, describeShowIf, changeWarning, retireWarning,
  followUpsOf, changeBreaks,
} from './setup.js';

/* The Setup page: the study's settings, its reminder and survey times, and its
 * questions. Everything saved here goes through checked database functions and is
 * written to the audit log with who changed what. The page says what a change will
 * touch before it is made, and what is not changed here (the list, a participant's
 * group, the wording of a question already asked). */

/* One save at a time: busy, a message when it worked, an error when it did not. */
function useSave(after) {
  const [state, setState] = useState({ busy: false, note: '', error: '' });
  const run = async (work, note) => {
    setState({ busy: true, note: '', error: '' });
    const res = await work();
    if (!res.ok) { setState({ busy: false, note: '', error: res.message }); return false; }
    setState({ busy: false, note, error: '' });
    await after(note);
    return true;
  };
  return [state, run, () => setState({ busy: false, note: '', error: '' })];
}

function Feedback({ state, problems }) {
  return (
    <>
      {problems?.length > 0 && <ul className="rs-problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {state.error && <p className="rs-error" role="alert">{state.error}</p>}
      {state.note && <p className="rs-ok" role="status">{state.note}</p>}
    </>
  );
}

/* A button that asks once more before doing something that matters. */
function Confirm({ label, question, onConfirm, danger, disabled }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className={`rs-btn${danger ? ' rs-danger' : ''}`} disabled={disabled} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="rs-confirm" role="alertdialog" aria-label={question}>
      <span>{question}</span>
      <button type="button" className={`rs-btn rs-primary${danger ? ' rs-danger-solid' : ''}`} onClick={() => { setAsking(false); onConfirm(); }}>Yes, do it</button>
      <button type="button" className="rs-btn rs-quiet" onClick={() => setAsking(false)}>Cancel</button>
    </span>
  );
}

function Panel({ title, intro, children }) {
  return (
    <section className="rs-panel">
      <h2>{title}</h2>
      {intro && <p className="rs-sub rs-panelintro">{intro}</p>}
      {children}
    </section>
  );
}

// ── The study ────────────────────────────────────────────────────────────────

function StudyPanel({ data, reload }) {
  const { study, enrolled } = data;
  const [form, setForm] = useState(() => studyForm(study));
  const [state, run, reset] = useSave(reload);
  const [code, setCode] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeState, runCode, resetCode] = useSave(reload);

  const problems = validateStudyForm(form, { enrolled });
  const changes = studyChanges(study, form);
  const dirty = Object.keys(changes).length > 0;
  const status = enrolmentState(study);
  const set = (patch) => { setForm({ ...form, ...patch }); reset(); };

  const toggleOpen = (open) => runSave({ is_open: open }, open ? 'Enrolment is open.' : 'Enrolment is closed.');
  const runSave = (c, note) => run(() => saveStudy(study.id, c), note);

  return (
    <Panel title="The study" intro={study.name}>
      <div className="rs-statusrow">
        <span className={`rs-pill ${status.open ? 'rs-pill-on' : 'rs-pill-off'}`}>{study.is_open ? 'Open' : 'Closed'}</span>
        <span>{status.text}</span>
        {study.is_open
          ? <Confirm label="Close enrolment" danger question="Students who try to join will be told the code did not work. Close it?" onConfirm={() => toggleOpen(false)} disabled={state.busy} />
          : <Confirm label="Open enrolment" question="Students with the code, who are on the list, will be able to join. Open it?" onConfirm={() => toggleOpen(true)} disabled={state.busy} />}
      </div>

      <div className="rs-fields">
        <label>
          <span>Most people who can join</span>
          <input inputMode="numeric" value={form.cap} onChange={(e) => set({ cap: e.target.value })} />
          <small>{enrolled} enrolled so far. It cannot go below that.</small>
        </label>
        <label>
          <span>Days in the study</span>
          <input inputMode="numeric" value={form.window_days} onChange={(e) => set({ window_days: e.target.value })} />
          <small>Counted from each person's own enrolment. A change applies to people who join after it. Everyone already in keeps the end date they were given.</small>
        </label>
        <label>
          <span>Enrolment opens (Eastern time)</span>
          <input type="datetime-local" value={form.starts_at} onChange={(e) => set({ starts_at: e.target.value })} />
          <small>Leave empty for no start date.</small>
        </label>
        <label>
          <span>Enrolment ends (Eastern time)</span>
          <input type="datetime-local" value={form.ends_at} onChange={(e) => set({ ends_at: e.target.value })} />
          <small>Leave empty for no end date.</small>
        </label>
      </div>

      <label className="rs-fullfield">
        <span>Introduction above the end-of-day questions</span>
        <textarea rows={3} value={form.survey_intro} maxLength={620} onChange={(e) => set({ survey_intro: e.target.value })} />
        <small>{form.survey_intro.length} of 600. Leave empty to use the app's own line.</small>
      </label>

      <div className="rs-actions">
        <button type="button" className="rs-btn rs-primary" disabled={!dirty || problems.length > 0 || state.busy}
                onClick={() => runSave(changes, 'Saved.')}>{state.busy ? 'Saving…' : 'Save'}</button>
        {dirty && <button type="button" className="rs-btn rs-quiet" onClick={() => { setForm(studyForm(study)); reset(); }}>Undo changes</button>}
      </div>
      <Feedback state={state} problems={dirty ? problems : []} />

      <div className="rs-sep" />
      <h3>Study code</h3>
      <p className="rs-sub">Students type this code to join. It is stored scrambled, so nobody can read it back, including here. Changing it stops the old one at once. People already in are not affected.</p>
      {!codeOpen ? (
        <button type="button" className="rs-btn" onClick={() => { setCodeOpen(true); resetCode(); }}>Change the code</button>
      ) : (
        <div className="rs-codebox">
          <label>
            <span>New code</span>
            <input value={code} autoComplete="off" spellCheck={false} onChange={(e) => { setCode(e.target.value); resetCode(); }} placeholder="At least 6 letters or numbers" />
            <small>Spaces and dashes are ignored, and capitals do not matter. Tell participants the new code yourself. It is not shown again.</small>
          </label>
          <div className="rs-actions">
            <Confirm label="Save the new code" danger question="The old code stops working now. Change it?" disabled={codeState.busy || code.replace(/[^A-Za-z0-9]/g, '').length < 6}
                     onConfirm={async () => { if (await runCode(() => saveStudyCode(study.id, code), 'The code is changed. The old one no longer works.')) { setCode(''); setCodeOpen(false); } }} />
            <button type="button" className="rs-btn rs-quiet" onClick={() => { setCode(''); setCodeOpen(false); resetCode(); }}>Cancel</button>
          </div>
        </div>
      )}
      <Feedback state={codeState} />
    </Panel>
  );
}

// ── Reminder and survey times ────────────────────────────────────────────────

function DayChips({ days, onChange }) {
  return (
    <div className="rs-chips" role="group" aria-label="Days">
      {WEEKDAYS.map(([n, label]) => (
        <button key={n} type="button" className="rs-chip" aria-pressed={days.includes(n)}
                onClick={() => onChange(days.includes(n) ? days.filter((d) => d !== n) : [...days, n])}>{label}</button>
      ))}
    </div>
  );
}

function ScheduleFields({ form, set, kind }) {
  return (
    <>
      <div className="rs-fields">
        <label><span>Time (Eastern)</span><input type="time" value={form.send_time} onChange={(e) => set({ send_time: e.target.value })} /></label>
        <label>
          <span>{kind === 'survey' ? 'A push can go out up to' : 'Drop it if it would be more than'}</span>
          <input inputMode="numeric" value={form.late_minutes} onChange={(e) => set({ late_minutes: e.target.value })} />
          <small>minutes after the time. {lateText(Number(form.late_minutes) || 0, kind)}</small>
        </label>
      </div>
      <div className="rs-fullfield"><span className="rs-lbl">Days</span><DayChips days={form.days} onChange={(days) => set({ days })} /></div>
      <label className="rs-fullfield"><span>Title the student sees</span><input value={form.title} maxLength={90} onChange={(e) => set({ title: e.target.value })} /></label>
      <label className="rs-fullfield"><span>Message under it</span><input value={form.body} maxLength={210} onChange={(e) => set({ body: e.target.value })} /><small>Optional.</small></label>
    </>
  );
}

function ScheduleRow({ s, reload }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => scheduleForm(s));
  const [state, run, reset] = useSave(reload);
  const problems = validateScheduleForm(form);
  const changes = scheduleChanges(s, form);
  const dirty = Object.keys(changes).length > 0;
  const set = (patch) => { setForm({ ...form, ...patch }); reset(); };

  return (
    <li className={`rs-item-card${s.is_active ? '' : ' is-off'}`}>
      <div className="rs-itemhead">
        <div>
          <strong>{kindLabel(s.kind)}</strong> <span className="rs-chip-static">{groupLabel(s.grp)}</span>
          {!s.is_active && <span className="rs-chip-static rs-chip-warn">Off</span>}
          <div className="rs-sub">{timeText(s.send_time)}, {daysLabel(s.days)}. {s.title}{s.body ? `. ${s.body}` : ''}</div>
        </div>
        <div className="rs-actions">
          {!editing && <button type="button" className="rs-btn" onClick={() => { setForm(scheduleForm(s)); setEditing(true); reset(); }}>Edit</button>}
          {!editing && (s.is_active
            ? <Confirm label="Switch off" danger question="Students stop getting it. Switch it off?" disabled={state.busy} onConfirm={() => run(() => saveSchedule(s.id, { is_active: false }), 'Switched off.')} />
            : <button type="button" className="rs-btn" disabled={state.busy} onClick={() => run(() => saveSchedule(s.id, { is_active: true }), 'Switched on.')}>Switch on</button>)}
        </div>
      </div>
      {editing && (
        <div className="rs-edit">
          <ScheduleFields form={form} set={set} kind={s.kind} />
          <div className="rs-actions">
            <button type="button" className="rs-btn rs-primary" disabled={!dirty || problems.length > 0 || state.busy}
                    onClick={async () => { if (await run(() => saveSchedule(s.id, changes), 'Saved. The next run uses it.')) setEditing(false); }}>{state.busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="rs-btn rs-quiet" onClick={() => { setEditing(false); reset(); }}>Cancel</button>
          </div>
        </div>
      )}
      <Feedback state={state} problems={editing && dirty ? problems : []} />
    </li>
  );
}

function AddSchedule({ study, reload }) {
  const [open, setOpen] = useState(false);
  const blank = { ...scheduleForm(null), kind: 'reminder', grp: '', title: '' };
  const [form, setForm] = useState(blank);
  const [state, run, reset] = useSave(reload);
  const problems = validateScheduleForm(form);
  const set = (patch) => { setForm({ ...form, ...patch }); reset(); };
  if (!open) return <button type="button" className="rs-btn" onClick={() => setOpen(true)}>Add a time</button>;
  return (
    <div className="rs-edit">
      <div className="rs-fields">
        <label><span>What</span>
          <select value={form.kind} onChange={(e) => set({ kind: e.target.value, late_minutes: e.target.value === 'survey' ? '180' : '30' })}>
            <option value="reminder">Reminder</option><option value="survey">End-of-day questions</option>
          </select></label>
        <label><span>For</span>
          <select value={form.grp} onChange={(e) => set({ grp: e.target.value })}>
            <option value="">Everyone</option>{(study.groups ?? []).map((g) => <option key={g} value={g}>{groupLabel(g)}</option>)}
          </select></label>
      </div>
      <ScheduleFields form={form} set={set} kind={form.kind} />
      <div className="rs-actions">
        <button type="button" className="rs-btn rs-primary" disabled={problems.length > 0 || state.busy}
                onClick={async () => { if (await run(() => addSchedule(study.id, form), 'Added.')) { setOpen(false); setForm(blank); } }}>{state.busy ? 'Adding…' : 'Add'}</button>
        <button type="button" className="rs-btn rs-quiet" onClick={() => { setOpen(false); reset(); }}>Cancel</button>
      </div>
      <Feedback state={state} problems={form.title || form.body ? problems : []} />
    </div>
  );
}

function TimesPanel({ data, reload }) {
  const { study, schedules } = data;
  return (
    <Panel title="Reminder and survey times" intro="When each group is reminded, and when the end-of-day questions are due. All times are Eastern. A change is used by the next run of the sender.">
      {schedules.length === 0 ? <p className="rs-sub">Nothing is scheduled yet.</p> : (
        <ul className="rs-list">{schedules.map((s) => <ScheduleRow key={s.id} s={s} reload={reload} />)}</ul>
      )}
      <AddSchedule study={study} reload={reload} />
    </Panel>
  );
}

// ── Questions ────────────────────────────────────────────────────────────────

function QuestionForm({ initial, questions, groups, onSubmit, onCancel, submitLabel, busy, error, guard }) {
  const [form, setForm] = useState(initial);
  const set = (patch) => setForm({ ...form, ...patch });
  // The usual checks, plus any that only apply to changing a question that has follow-ups.
  const problems = [...validateQuestionForm(form, { questions, groups }), ...(guard ? guard(form) : [])];
  const candidates = questions.filter((q) => answerChoices(q).length > 0);
  const parent = questions.find((q) => q.id === form.parent);
  const choices = answerChoices(parent);
  const toggleAnswer = (v) => set({ answers: form.answers.some((a) => a === v) ? form.answers.filter((a) => a !== v) : [...form.answers, v] });

  return (
    <div className="rs-edit">
      <label className="rs-fullfield"><span>Question</span><textarea rows={2} value={form.text} maxLength={320} onChange={(e) => set({ text: e.target.value })} /></label>
      <div className="rs-fields">
        <label><span>Kind of answer</span>
          <select value={form.format} onChange={(e) => set({ format: e.target.value })}>{FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
        <label><span>Position</span><input inputMode="numeric" value={form.position} onChange={(e) => set({ position: e.target.value })} /><small>Questions are asked in this order. Lower comes first.</small></label>
      </div>
      {form.format === 'multiple_choice' && (
        <label className="rs-fullfield"><span>Choices, one per line</span><textarea rows={4} value={form.optionsText} onChange={(e) => set({ optionsText: e.target.value })} /><small>2 to 8.</small></label>
      )}
      {form.format === 'rating' && (
        <div className="rs-fields">
          <label><span>Label for 1 (optional)</span><input value={form.low} onChange={(e) => set({ low: e.target.value })} placeholder="Not at all" /></label>
          <label><span>Label for 5 (optional)</span><input value={form.high} onChange={(e) => set({ high: e.target.value })} placeholder="Completely" /></label>
        </div>
      )}
      <div className="rs-fullfield"><span className="rs-lbl">Who is asked</span>
        <div className="rs-chips" role="group" aria-label="Who is asked">
          <button type="button" className="rs-chip" aria-pressed={form.grps.length === 0} onClick={() => set({ grps: [] })}>Everyone</button>
          {groups.map((g) => (
            <button key={g} type="button" className="rs-chip" aria-pressed={form.grps.includes(g)}
                    onClick={() => set({ grps: form.grps.includes(g) ? form.grps.filter((x) => x !== g) : [...form.grps, g] })}>{groupLabel(g)} only</button>
          ))}
        </div>
      </div>
      <label className="rs-checkrow"><input type="checkbox" checked={form.followUp} onChange={(e) => set({ followUp: e.target.checked, answers: [], parent: '' })} /><span>Only show this after a particular answer to an earlier question</span></label>
      {form.followUp && (
        <div className="rs-follow">
          <label><span>The earlier question</span>
            <select value={form.parent} onChange={(e) => set({ parent: e.target.value, answers: [] })}>
              <option value="">Pick one</option>{candidates.map((q) => <option key={q.id} value={q.id}>{q.text.length > 70 ? `${q.text.slice(0, 70)}…` : q.text}</option>)}
            </select></label>
          {parent && (
            <>
              <label><span>Show it when the answer</span>
                <select value={form.mode} onChange={(e) => set({ mode: e.target.value })}><option value="any_of">is one of these</option><option value="none_of">is anything but these</option></select></label>
              <div className="rs-chips" role="group" aria-label="Answers">
                {choices.map((c) => <button key={String(c.value)} type="button" className="rs-chip" aria-pressed={form.answers.some((a) => a === c.value)} onClick={() => toggleAnswer(c.value)}>{c.label}</button>)}
              </div>
            </>
          )}
        </div>
      )}
      <div className="rs-actions">
        <button type="button" className="rs-btn rs-primary" disabled={problems.length > 0 || busy} onClick={() => onSubmit(form)}>{busy ? 'Saving…' : submitLabel}</button>
        <button type="button" className="rs-btn rs-quiet" onClick={onCancel}>Cancel</button>
      </div>
      {form.text && problems.length > 0 && <ul className="rs-problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {error && <p className="rs-error" role="alert">{error}</p>}
    </div>
  );
}

function QuestionRow({ q, data, byId, reload, onChange }) {
  const [state, run, reset] = useSave(reload);
  const answers = data.usage[q.id] ?? 0;
  const followUps = followUpsOf(data.questions, q.id).length;
  return (
    <li className={`rs-item-card${q.is_active ? '' : ' is-off'}`}>
      <div className="rs-itemhead">
        <div>
          <div className="rs-qtext">{q.text}</div>
          <div className="rs-sub">
            {FORMAT_LABEL[q.format]}{q.format === 'multiple_choice' ? `: ${q.options.join(', ')}` : ''}{q.format === 'rating' && q.options?.length === 2 ? `: 1 is ${q.options[0]}, 5 is ${q.options[1]}` : ''}
          </div>
          <div className="rs-meta">
            <span className="rs-chip-static">{groupsLabel(q.grps)}</span>
            <span className="rs-chip-static">Position {q.position}</span>
            <span className="rs-chip-static">{answers.toLocaleString()} {answers === 1 ? 'answer' : 'answers'}</span>
            {!q.is_active && <span className="rs-chip-static rs-chip-warn">Retired</span>}
          </div>
          {q.show_if && <div className="rs-sub">{describeShowIf(q, byId)}</div>}
        </div>
        <div className="rs-actions">
          {q.is_active && <button type="button" className="rs-btn" onClick={() => onChange(q)}>Change</button>}
          {q.is_active
            ? <Confirm label="Retire" danger question={retireWarning(answers, followUps)} disabled={state.busy} onConfirm={() => run(() => setQuestion(q.id, { active: false }), 'Retired.')} />
            : <button type="button" className="rs-btn" disabled={state.busy} onClick={() => run(() => setQuestion(q.id, { active: true }), 'Back in use.')}>Restore</button>}
        </div>
      </div>
      <Feedback state={state} />
      {state.note || state.error ? <button type="button" className="rs-link" onClick={reset}>Dismiss</button> : null}
    </li>
  );
}

function QuestionsPanel({ data, reload }) {
  const { study, questions } = data;
  const [mode, setMode] = useState(null);        // null | 'add' | a question being changed
  const [state, run, reset] = useSave(reload);
  const [showRetired, setShowRetired] = useState(false);
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const active = questions.filter((q) => q.is_active);
  const retired = questions.filter((q) => !q.is_active);
  const groups = study.groups ?? [];
  // Changing a question moves the questions that follow it. They also cannot be
  // picked as the question it follows, which would loop.
  const followUps = mode && mode !== 'add' ? followUpsOf(active, mode.id) : [];

  const submit = async (form) => {
    const replaced = mode && mode !== 'add' ? mode.id : null;
    const args = buildQuestionArgs(study.id, form, replaced);
    if (await run(() => addQuestion(args), replaced ? 'Changed. The old question is retired and its answers are kept.' : 'Added.')) setMode(null);
  };

  return (
    <Panel title="End-of-day questions" intro="What students are asked each evening. The wording of a question that has been asked is never edited. Changing one adds a new question and retires the old one, so every answer stays with the words it answered.">
      {active.length === 0 ? <p className="rs-sub">No questions yet. Without questions, no end-of-day survey is shown.</p> : (
        <ul className="rs-list">{active.map((q) => <QuestionRow key={q.id} q={q} data={data} byId={byId} reload={reload} onChange={(x) => { setMode(x); reset(); }} />)}</ul>
      )}

      {mode && mode !== 'add' && <p className="rs-warn" role="note">{changeWarning(data.usage[mode.id] ?? 0, followUps.length)}</p>}
      {mode ? (
        <QuestionForm key={mode === 'add' ? 'add' : mode.id}
          initial={mode === 'add' ? emptyQuestionForm(questions) : formFromQuestion(mode)}
          questions={mode === 'add' ? active : active.filter((q) => q.id !== mode.id && !followUps.some((f) => f.id === q.id))} groups={groups}
          guard={mode === 'add' ? null : (form) => changeBreaks(mode, form, followUps)}
          submitLabel={mode === 'add' ? 'Add the question' : 'Save as a new question'} busy={state.busy} error={state.error}
          onSubmit={submit} onCancel={() => { setMode(null); reset(); }} />
      ) : (
        <div className="rs-actions"><button type="button" className="rs-btn" onClick={() => { setMode('add'); reset(); }}>Add a question</button></div>
      )}
      {!mode && <Feedback state={state} />}

      {retired.length > 0 && (
        <div className="rs-retired">
          <button type="button" className="rs-link" aria-expanded={showRetired} onClick={() => setShowRetired(!showRetired)}>
            {showRetired ? 'Hide' : 'Show'} retired questions ({retired.length})
          </button>
          {showRetired && <ul className="rs-list">{retired.map((q) => <QuestionRow key={q.id} q={q} data={data} byId={byId} reload={reload} onChange={() => {}} />)}</ul>}
        </div>
      )}
    </Panel>
  );
}

// ── The list ─────────────────────────────────────────────────────────────────

function ListPanel({ data }) {
  return (
    <Panel title="The researchers' list" intro="Who may join, and which group each person is in. It is loaded from the researchers' file by whoever runs Bento, and is not edited here.">
      <div className="rs-cards rs-cards-tight">
        <article className="rs-card"><h3>On the list</h3><p className="rs-big">{data.onList}</p></article>
        <article className="rs-card"><h3>Enrolled</h3><p className="rs-big">{data.enrolled}</p></article>
        <article className="rs-card"><h3>Not yet</h3><p className="rs-big">{data.notYet}</p></article>
      </div>
      <p className="rs-sub"><a href="#/data/roster">See the list, with names and emails</a>. Opening it is recorded.</p>
    </Panel>
  );
}

export default function SetupPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  // A saved panel starts again from the saved values, which clears its own message,
  // so what a save says is shown here, above all the panels, for a few seconds.
  const [flash, setFlash] = useState('');
  const reload = useCallback(async (note) => {
    try { setData(await loadSetup()); setError(''); if (typeof note === 'string' && note) setFlash(note); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { const t = setTimeout(reload, 0); return () => clearTimeout(t); }, [reload]);
  useEffect(() => { if (!flash) return undefined; const t = setTimeout(() => setFlash(''), 6000); return () => clearTimeout(t); }, [flash]);

  if (error && !data) return <div className="rs-alert" role="alert">{error} <button type="button" className="rs-link" onClick={reload}>Try again</button></div>;
  if (!data) return <div className="rs-loading">Reading the setup…</div>;
  if (!data.study) return <div className="rs-alert" role="alert">There is no study to set up yet. Ask whoever runs Bento to create one.</div>;

  return (
    <div className="rs-setup">
      <header className="rs-pagehead">
        <h1>Setup</h1>
        <p className="rs-sub">Every change here is recorded with your name.</p>
      </header>
      {flash && <div className="rs-flash" role="status">{flash}</div>}
      {/* Keyed on what is saved, so a form starts again from the saved values after a save. */}
      <StudyPanel key={JSON.stringify(data.study)} data={data} reload={reload} />
      <TimesPanel key={`t${JSON.stringify(data.schedules)}`} data={data} reload={reload} />
      <QuestionsPanel data={data} reload={reload} />
      <ListPanel data={data} />
    </div>
  );
}
