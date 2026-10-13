import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEETS, AUDIT_SHEET, sheetById, selectList } from '../src/research/sheets.js';
import { DICTIONARY, dictionaryRows, DICTIONARY_HEADERS } from '../src/research/dictionary.js';
import {
  safeText, csvCell, toCsv, xlsxCell, sheetMatrix, sheetName, workbookParts, fileName, anyIdentity,
} from '../src/research/exporting.js';
import { nextStep, cleanCode, codeProblem, signInProblem, IDLE_MINUTES, IDLE_MS } from '../src/research/steps.js';
import { todayEastern, responseRates, liveSummary, groupBalance } from '../src/research/live.js';
import { diffRows, rowIdOf, displayValue, PAGE, MAX_ROWS } from '../src/research/rows.js';
import { fetchSheet, logAction } from '../src/research/data.js';

// ── The sheets and the dictionary ────────────────────────────────────────────

test('every sheet is well formed', () => {
  const types = new Set(['text', 'number', 'bool', 'date', 'datetime']);
  assert.equal(new Set(SHEETS.map((s) => s.id)).size, SHEETS.length, 'unique ids');
  for (const s of SHEETS) {
    assert.ok(s.view?.startsWith('grid_'), `${s.id} reads a grid view`);
    assert.equal(new Set(s.columns.map((c) => c.field)).size, s.columns.length, `${s.id} fields are unique`);
    for (const c of s.columns) {
      assert.ok(types.has(c.type), `${s.id}.${c.field} has a known type`);
      assert.ok(c.header && c.width > 0, `${s.id}.${c.field} has a header and a width`);
    }
    assert.ok(s.columns[0].pinned, `${s.id} freezes its first column`);
    assert.ok(s.watch.length > 0 && s.watch.every((t) => /^[a-z_]+$/.test(t)), `${s.id} watches tables`);
    assert.ok(selectList(s).startsWith('row_id,'), `${s.id} reads the row id first`);
  }
});

test('only the sheets that hold names or emails are marked as identities', () => {
  assert.deepEqual(SHEETS.filter((s) => s.identity).map((s) => s.id).sort(), ['participants', 'roster']);
  for (const s of SHEETS.filter((x) => !x.identity)) {
    assert.ok(!s.columns.some((c) => /email|full_name/.test(c.field)), `${s.id} has no identity column`);
  }
  assert.equal(anyIdentity(SHEETS), true);
  assert.equal(anyIdentity(SHEETS.filter((s) => !s.identity)), false);
});

test('the audit sheet reads the table and the others never do', () => {
  assert.equal(AUDIT_SHEET.table, 'audit_log');
  assert.equal(selectList(AUDIT_SHEET), 'id,at,email,user_id,action,detail');
  assert.equal(sheetById('audit'), AUDIT_SHEET);
  assert.equal(sheetById('meals').id, 'meals');
  assert.equal(sheetById('nope'), null);
});

test('every column has a dictionary entry and nothing in it is left over', () => {
  for (const s of [...SHEETS, AUDIT_SHEET]) {
    const entries = DICTIONARY[s.id];
    assert.ok(entries, `${s.id} has a dictionary`);
    for (const c of s.columns) {
      assert.ok(entries[c.field]?.source && entries[c.field]?.meaning, `${s.id}.${c.field} is described`);
      assert.ok(entries[c.field].meaning.length > 15, `${s.id}.${c.field} says something`);
    }
    for (const field of Object.keys(entries)) assert.ok(s.columns.some((c) => c.field === field), `${s.id}.${field} is a real column`);
  }
  assert.deepEqual(Object.keys(DICTIONARY).sort(), [...SHEETS.map((s) => s.id), 'audit'].sort());
});

test('the dictionary sheet has a row per column', () => {
  const rows = dictionaryRows();
  assert.equal(rows.length, SHEETS.reduce((n, s) => n + s.columns.length, 0));
  assert.ok(rows.every((r) => r.length === DICTIONARY_HEADERS.length && r[5]));
});

test('the dictionary and the sheets use the Bento voice: no em dashes, no semicolons', () => {
  const text = JSON.stringify(DICTIONARY) + JSON.stringify(SHEETS.map((s) => s.label));
  assert.doesNotMatch(text, /[—;]/);
});

// ── Exporting ────────────────────────────────────────────────────────────────

test('spreadsheet formulas typed by participants are defused in CSV', () => {
  for (const evil of ['=1+1', '+SUM(A1)', '@HYPERLINK("x")', '-cmd|calc', '\t=1', '\r=1']) {
    assert.ok(safeText(evil).startsWith("'"), JSON.stringify(evil));
  }
  for (const fine of ['Yes', '4', '-3', '-2.5', '1/2 plate', 'a=b', 'Great hall']) assert.equal(safeText(fine), fine, fine);
});

test('CSV cells quote what has to be quoted and leave the rest alone', () => {
  assert.equal(csvCell('plain', 'text'), 'plain');
  assert.equal(csvCell('a,b', 'text'), '"a,b"');
  assert.equal(csvCell('say "hi"', 'text'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines', 'text'), '"two\nlines"');
  assert.equal(csvCell(null, 'text'), '');
  assert.equal(csvCell(undefined, 'number'), '');
  assert.equal(csvCell('', 'text'), '');
  assert.equal(csvCell(0, 'number'), '0', 'zero is not empty');
  assert.equal(csvCell(-2, 'number'), '-2', 'a negative number is not a formula');
  assert.equal(csvCell(false, 'bool'), 'false');
  assert.equal(csvCell(true, 'bool'), 'true');
  assert.equal(csvCell('2026-10-13T14:30:00+00:00', 'datetime'), '2026-10-13T14:30:00.000Z', 'timestamps are ISO in UTC');
  assert.equal(csvCell('2026-10-13', 'date'), '2026-10-13');
  assert.equal(csvCell('not a date', 'datetime'), 'not a date');
  assert.equal(csvCell('=2+2', 'text'), "'=2+2");
});

test('a CSV file starts with a byte order mark and uses CRLF', () => {
  const cols = [{ field: 'a', header: 'A, one', type: 'text' }, { field: 'b', header: 'B', type: 'number' }];
  const csv = toCsv(cols, [{ a: 'x', b: 1 }, { a: '=evil', b: null }]);
  assert.equal(csv, '﻿"A, one",B\r\nx,1\r\n\'=evil,\r\n');
});

test('cells are typed for Excel so it can sort and filter them', () => {
  assert.equal(xlsxCell(null, 'text'), null);
  assert.deepEqual(xlsxCell('3.5', 'number'), { value: 3.5, type: Number });
  assert.deepEqual(xlsxCell('abc', 'number'), { value: 'abc', type: String }, 'a bad number stays visible as text');
  assert.deepEqual(xlsxCell(true, 'bool'), { value: true, type: Boolean });
  assert.equal(xlsxCell('=1+1', 'text').type, String, 'text is never a formula');
  const dt = xlsxCell('2026-10-13T14:30:00Z', 'datetime');
  assert.equal(dt.type, Date); assert.equal(dt.value.toISOString(), '2026-10-13T14:30:00.000Z'); assert.equal(dt.format, 'yyyy-mm-dd hh:mm');
  const d = xlsxCell('2026-10-13', 'date');
  assert.equal(d.format, 'yyyy-mm-dd'); assert.equal(d.value.toISOString().slice(0, 10), '2026-10-13', 'a day stays that day');
  assert.equal(xlsxCell('nope', 'datetime').type, String);
});

test('a sheet becomes a matrix with a bold header and typed rows', () => {
  const cols = [{ field: 'n', header: 'N', type: 'number' }, { field: 't', header: 'T', type: 'text' }];
  const m = sheetMatrix(cols, [{ n: 1, t: 'a' }, { n: null, t: null }]);
  assert.equal(m.length, 3);
  assert.deepEqual(m[0].map((c) => c.value), ['N', 'T']);
  assert.ok(m[0].every((c) => c.fontWeight === 'bold'));
  assert.deepEqual(m[2], [null, null]);
});

test('sheet names obey Excel\'s rules', () => {
  assert.equal(sheetName('Survey answers'), 'Survey answers');
  assert.equal(sheetName('a/b:c*d?e[f]g\\h'), 'a b c d e f g h');
  assert.equal(sheetName('x'.repeat(50)).length, 31);
  assert.equal(sheetName('///'), 'Sheet');
});

test('a workbook has every sheet frozen, then the data dictionary last', () => {
  const entries = [{ sheet: SHEETS[0], rows: [] }, { sheet: SHEETS[2], rows: [] }];
  const parts = workbookParts(entries);
  assert.deepEqual(parts.map((p) => p.sheet), ['Participants', 'Survey answers', 'Data dictionary']);
  assert.ok(parts.every((p) => p.stickyRowsCount === 1));
  assert.equal(parts[0].columns.length, SHEETS[0].columns.length);
  assert.equal(parts[2].data.length, dictionaryRows([SHEETS[0], SHEETS[2]]).length + 1, 'the dictionary covers only the sheets in the file');
  assert.ok(parts[2].data.length < dictionaryRows().length + 1);
  assert.equal(workbookParts(entries, { dictionary: false }).length, 2);
});

test('file names say what is inside, and warn about identities', () => {
  const now = new Date('2026-10-13T20:00:00Z');
  assert.equal(fileName('Plate items', 'csv', { now }), 'bento-research-plate-items-2026-10-13.csv');
  assert.equal(fileName('Participants', 'xlsx', { now, identities: true }), 'bento-research-participants-2026-10-13-contains-identities.xlsx');
  assert.equal(fileName('Meals', 'csv', { now, filtered: true }), 'bento-research-meals-2026-10-13-filtered.csv');
  assert.equal(fileName('All sheets', 'xlsx', { now, filtered: true, identities: true }), 'bento-research-all-sheets-2026-10-13-filtered-contains-identities.xlsx');
  assert.equal(fileName('???', 'csv', { now }), 'bento-research-export-2026-10-13.csv');
});

// ── Signing in ───────────────────────────────────────────────────────────────

test('the dashboard shows the right screen for every combination', () => {
  const researcher = (aal) => ({ is_researcher: true, role: 'researcher', aal });
  assert.equal(nextStep({ session: undefined }), 'loading');
  assert.equal(nextStep({ session: null }), 'signin');
  assert.equal(nextStep({ session: {}, who: undefined }), 'loading');
  assert.equal(nextStep({ session: {}, who: { is_researcher: false, aal: 'aal1' } }), 'denied', 'an ordinary student account');
  assert.equal(nextStep({ session: {}, who: { is_researcher: false, aal: 'aal2' } }), 'denied', 'even with multi-factor');
  assert.equal(nextStep({ session: {}, who: researcher('aal2') }), 'ready');
  assert.equal(nextStep({ session: {}, who: researcher('aal1'), factors: undefined }), 'loading');
  assert.equal(nextStep({ session: {}, who: researcher('aal1'), factors: [] }), 'mfa-enroll');
  assert.equal(nextStep({ session: {}, who: researcher('aal1'), factors: [{ id: 'f' }] }), 'mfa-verify');
  assert.equal(nextStep({ session: {}, who: researcher(''), factors: [{ id: 'f' }] }), 'mfa-verify', 'no assurance level at all');
});

test('a password alone never reaches the data', () => {
  for (const aal of ['', 'aal1', undefined, null, 'AAL2', 'aal3']) {
    const step = nextStep({ session: {}, who: { is_researcher: true, aal }, factors: [{ id: 'f' }] });
    assert.notEqual(step, 'ready', String(aal));
  }
});

test('the authenticator code is cleaned and checked', () => {
  assert.equal(cleanCode('123 456'), '123456');
  assert.equal(cleanCode(' 12-34-56 '), '123456');
  assert.equal(cleanCode('1234567890'), '123456');
  assert.equal(cleanCode(null), '');
  assert.equal(codeProblem('123 456'), '');
  assert.ok(codeProblem('12345'));
  assert.ok(codeProblem(''));
});

test('a sign-in failure never says which half was wrong', () => {
  const wrong = signInProblem({ message: 'Invalid login credentials' });
  assert.equal(wrong, signInProblem({ message: 'User not found' }));
  assert.equal(wrong, signInProblem(null));
  assert.doesNotMatch(wrong, /email is|password is|no account|not found/i);
  assert.match(signInProblem({ message: 'Email rate limit exceeded' }), /Too many/);
  assert.match(signInProblem({ message: 'Failed to fetch' }), /connection/);
  assert.equal(IDLE_MINUTES, 30);
  assert.equal(IDLE_MS, 30 * 60 * 1000);
});

// ── The Live numbers ─────────────────────────────────────────────────────────

test('today is Eastern, including late evenings that are already tomorrow in UTC', () => {
  assert.equal(todayEastern(new Date('2026-10-14T03:30:00Z')), '2026-10-13');
  assert.equal(todayEastern(new Date('2026-10-13T04:30:00Z')), '2026-10-13');
  assert.equal(todayEastern(new Date('2026-10-13T03:59:00Z')), '2026-10-12');
  assert.equal(todayEastern(new Date('2026-11-02T04:30:00Z')), '2026-11-01', 'after the clocks change the offset is five hours');
  assert.equal(todayEastern(new Date('2026-11-02T05:30:00Z')), '2026-11-02');
});

test('response rate is answered over due, per group, and empty before anything is due', () => {
  const r = responseRates([
    { grp: 'S', surveys_answered: 8, surveys_due: 10 }, { grp: 'S', surveys_answered: 2, surveys_due: 10 },
    { grp: 'L', surveys_answered: 9, surveys_due: 12 },
  ]);
  assert.deepEqual([r.S.answered, r.S.due, r.S.rate], [10, 20, 50]);
  assert.deepEqual([r.L.answered, r.L.due, r.L.rate], [9, 12, 75]);
  assert.deepEqual([r.all.answered, r.all.due, r.all.rate], [19, 32, 59.4]);
  const none = responseRates([{ grp: 'S', surveys_answered: 0, surveys_due: 0 }]);
  assert.equal(none.S.rate, null);
  assert.equal(none.all.rate, null);
  assert.equal(responseRates(null).all.rate, null);
  assert.equal(responseRates([{ grp: 'X', surveys_answered: '3', surveys_due: '4' }]).all.rate, 75, 'strings from the database count, an unknown group is only in the total');
});

test('the live summary counts who is in, by group, and what went out today', () => {
  const now = new Date('2026-10-13T18:00:00Z');
  const s = liveSummary({
    cap: 40, now,
    participants: [
      { status: 'active', grp: 'S', push_status: 'on' }, { status: 'active', grp: 'S', push_status: 'off' },
      { status: 'active', grp: 'L', push_status: 'on' }, { status: 'completed', grp: 'L', push_status: 'off' }, { status: 'withdrawn', grp: 'S', push_status: 'on' },
    ],
    activity: [{ grp: 'S', surveys_answered: 1, surveys_due: 2 }],
    prompts: [
      { local_date: '2026-10-13', status: 'sent' }, { local_date: '2026-10-13', status: 'sent' }, { local_date: '2026-10-13', status: 'failed' },
      { local_date: '2026-10-13', status: 'no_device' }, { local_date: '2026-10-12', status: 'sent' },
    ],
    events: Array.from({ length: 20 }, (_, i) => ({ at: `2026-10-13T10:${String(i).padStart(2, '0')}:00Z`, kind: 'app_open' })),
  });
  assert.deepEqual([s.enrolled, s.cap, s.active, s.completed, s.withdrawn], [5, 40, 3, 1, 1]);
  assert.deepEqual(s.groups, { S: 2, L: 1 });
  assert.equal(s.pushOff, 1, 'only active participants count, and only those the push cannot reach');
  assert.deepEqual(s.prompts, { today: 4, sent: 2, failed: 1, noDevice: 1 });
  assert.equal(s.rates.S.rate, 50);
  assert.equal(s.recent.length, 15);
  assert.equal(s.recent[0].at, '2026-10-13T10:19:00Z', 'newest first');
  assert.equal(groupBalance(s.groups), 1);
  assert.equal(groupBalance(null), 0);
});

test('an empty study still summarises', () => {
  const s = liveSummary({});
  assert.deepEqual([s.enrolled, s.active, s.pushOff, s.prompts.today, s.rates.all.rate, s.recent.length], [0, 0, 0, 0, null, 0]);
});

// ── Live updates and paging ──────────────────────────────────────────────────

const SHEET = { rowId: 'row_id' };
test('only the rows that changed are added, replaced or removed', () => {
  const before = [{ row_id: 'a', n: 1 }, { row_id: 'b', n: 2 }, { row_id: 'c', n: 3 }];
  const after = [{ row_id: 'a', n: 1 }, { row_id: 'b', n: 9 }, { row_id: 'd', n: 4 }];
  const d = diffRows(SHEET, before, after);
  assert.deepEqual(d.add, [{ row_id: 'd', n: 4 }]);
  assert.deepEqual(d.update, [{ row_id: 'b', n: 9 }]);
  assert.deepEqual(d.remove, [{ row_id: 'c', n: 3 }]);
  assert.deepEqual(diffRows(SHEET, after, after), { add: [], update: [], remove: [] });
  assert.equal(rowIdOf({ rowId: 'id' })({ id: 7 }), '7', 'the audit sheet keys on id');
});

test('cells are shown the way a person reads them', () => {
  assert.equal(displayValue(true, 'bool'), 'Yes');
  assert.equal(displayValue(false, 'bool'), 'No');
  assert.equal(displayValue(null, 'text'), '');
  assert.equal(displayValue(0, 'number'), '0');
  assert.match(displayValue('2026-10-13T14:30:00Z', 'datetime'), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(displayValue('garbage', 'datetime'), 'garbage');
});

function fakeClient(total, { failAt = null } = {}) {
  const calls = [];
  const client = {
    calls,
    schema: (s) => ({
      from: (source) => {
        const q = { orders: [] };
        q.select = (cols) => { q.cols = cols; return q; };
        q.order = (col, opts) => { q.orders.push([col, opts?.ascending ?? true]); return q; };
        q.range = async (from, to) => {
          calls.push({ schema: s, source, cols: q.cols, orders: q.orders, from, to });
          if (failAt !== null && from >= failAt) return { data: null, error: { message: 'boom' } };
          const n = Math.max(0, Math.min(total, to + 1) - from);
          return { data: Array.from({ length: n }, (_, i) => ({ row_id: String(from + i) })), error: null };
        };
        return q;
      },
    }),
  };
  return client;
}

test('a sheet is read in pages until one comes back short, from the research schema', async () => {
  const client = fakeClient(2500);
  const rows = await fetchSheet(sheetById('meals'), { client });
  assert.equal(rows.length, 2500);
  assert.deepEqual(client.calls.map((c) => [c.from, c.to]), [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.ok(client.calls.every((c) => c.schema === 'research' && c.source === 'grid_meals'));
  assert.deepEqual(client.calls[0].orders, [['row_id', true]], 'stable order, no duplicate key');
  assert.ok(client.calls[0].cols.startsWith('row_id,participant_code'));
});

test('a sheet that fills a page exactly asks once more, and an empty sheet asks once', async () => {
  const exact = fakeClient(PAGE);
  assert.equal((await fetchSheet(SHEETS[0], { client: exact })).length, PAGE);
  assert.equal(exact.calls.length, 2);
  const none = fakeClient(0);
  assert.deepEqual(await fetchSheet(SHEETS[0], { client: none }), []);
  assert.equal(none.calls.length, 1);
});

test('the audit sheet reads its table newest first', async () => {
  const client = fakeClient(3);
  await fetchSheet(AUDIT_SHEET, { client });
  assert.equal(client.calls[0].source, 'audit_log');
  assert.deepEqual(client.calls[0].orders, [['id', false]]);
});

test('a read error stops the sheet with the database\'s own words', async () => {
  await assert.rejects(fetchSheet(SHEETS[0], { client: fakeClient(5000, { failAt: 1000 }) }), /boom/);
});

test('an export is logged, and refused when the log refuses', async () => {
  const ok = { rpc: async (n, a) => ({ data: n === 'research_log_action' && a.p_action === 'export', error: null }) };
  assert.equal(await logAction('export', { sheet: 'meals' }, ok), true);
  assert.equal(await logAction('sign_in', {}, ok), false);
  const refused = { rpc: async () => ({ data: false, error: null }) };
  assert.equal(await logAction('export', {}, refused), false);
  const broken = { rpc: async () => ({ data: null, error: { message: 'down' } }) };
  assert.equal(await logAction('export', {}, broken), false);
  assert.ok(MAX_ROWS > PAGE);
});

// ── The wide survey sheet ────────────────────────────────────────────────────

import { columnName, codeFor, questionColumns, wideRows, withQuestions, highlights, columnMeaning } from '../src/research/survey.js';
import { validateColumn, columnArgs, wantsCodes, codesText, defaultCodesText } from '../src/research/setup.js';

const Q = (o) => ({ id: o.id, position: 10, text: 'Q', format: 'rating', options: [], grps: [], is_active: true, column_key: null, codes: null, created_at: '2026-10-01', ...o });
const hall = Q({ id: 'h', position: 10, text: 'Which hall?', format: 'multiple_choice', options: ['Yes - in Usdan', 'Yes - in Sherman', 'No'], column_key: 'lunchYN', codes: [1, 2, 0] });
const loop = Q({ id: 'l', position: 20, text: 'Loop?', format: 'rating', options: ['Not at all', 'Completely'], grps: ['L'], column_key: 'lunch_loop' });
const snack = Q({ id: 's', position: 20, text: 'Snack?', format: 'yes_no', grps: ['S'] });
const waste = Q({ id: 'w', position: 40, text: 'Left?', format: 'multiple_choice', options: ['Little or None', '1/4 plate', '1/2 plate'], column_key: 'lunch_waste' });
const note = Q({ id: 'n', position: 50, text: 'Anything else?', format: 'short_answer', column_key: 'lunch_note' });

test('a question is named by its column name, else by its position and group', () => {
  assert.equal(columnName(hall), 'lunchYN');
  assert.equal(columnName(snack), 'q20_s');
  assert.equal(columnName(Q({ position: 7 })), 'q7');
  assert.equal(columnName(Q({ position: 7, grps: ['S', 'L'] })), 'q7');
});

test('answers are written as codes: the choice code, its place from 1, yes 1 and no 0, a rating as itself', () => {
  assert.equal(codeFor(hall, 'Yes - in Sherman'), 2);
  assert.equal(codeFor(hall, 'No'), 0, 'the set code, not the place');
  assert.equal(codeFor(waste, '1/4 plate'), 2, 'no codes set: the place from 1');
  assert.equal(codeFor(snack, true), 1);
  assert.equal(codeFor(snack, false), 0);
  assert.equal(codeFor({ ...snack, codes: [1, 2] }, false), 2);
  assert.equal(codeFor(loop, 4), 4);
  assert.equal(codeFor(note, 'ran out of time'), 'ran out of time');
  assert.equal(codeFor(hall, 'Somewhere else'), null, 'an unknown choice is empty, never a wrong number');
  assert.equal(codeFor(loop, 'x'), null);
  assert.equal(codeFor(hall, null), null);
});

test('questions that share a column name are one column, in the order they are asked', () => {
  const reworded = Q({ id: 'h2', position: 10, text: 'Hall today?', format: 'multiple_choice', options: ['Usdan', 'Sherman', 'Neither'], column_key: 'LUNCHyn', codes: [1, 2, 0], created_at: '2026-10-05' });
  const cols = questionColumns([waste, hall, reworded, loop, snack], []);
  assert.deepEqual(cols.map((c) => c.field), ['lunchYN', 'lunch_loop', 'q20_s', 'lunch_waste']);
  assert.equal(cols[0].questions.length, 2);
  assert.equal(cols[0].type, 'number');
  assert.equal(questionColumns([note], [])[0].type, 'text');
});

test('a retired question shows a column only when it has answers', () => {
  const gone = { ...loop, is_active: false };
  assert.deepEqual(questionColumns([gone], []), []);
  assert.equal(questionColumns([gone], [{ answers: { l: 3 } }]).length, 1);
});

test('rows come out wide: one row per participant per day, one coded column per question', () => {
  const raw = [
    { row_id: 'r1', participant_code: 'P-001', grp: 'L', for_date: '2026-10-13', late: false, submitted_at: 'x', answers: { h: 'Yes - in Usdan', l: 5, w: '1/2 plate' } },
    { row_id: 'r2', participant_code: 'P-002', grp: 'S', for_date: '2026-10-13', late: true, submitted_at: 'y', answers: { h: 'No', s: true, ghost: 9 } },
  ];
  const rows = wideRows(raw, [hall, loop, snack, waste]);
  assert.deepEqual(rows[0], { row_id: 'r1', participant_code: 'P-001', grp: 'L', for_date: '2026-10-13', late: false, submitted_at: 'x', lunchYN: 1, lunch_loop: 5, lunch_waste: 3 });
  assert.deepEqual([rows[1].lunchYN, rows[1].q20_s, rows[1].lunch_loop, 'ghost' in rows[1], 'answers' in rows[1]], [0, 1, undefined, false, false]);
  assert.equal(raw[0].answers.l, 5, 'the input is not changed');
});

test('the sheet gets its question columns after the fixed ones, and a dictionary entry for each', () => {
  const base = sheetById('survey_wide');
  const sheet = withQuestions(base, [hall, loop], []);
  assert.deepEqual(sheet.columns.map((c) => c.field), [...base.columns.map((c) => c.field), 'lunchYN', 'lunch_loop']);
  assert.equal(base.columns.length, 6, 'the shared definition is not changed');
  const [row] = dictionaryRows([sheet]).filter((r) => r[2] === 'lunchYN');
  assert.match(row[5], /1 = Yes - in Usdan, 2 = Yes - in Sherman, 0 = No/);
  assert.match(columnMeaning(questionColumns([loop])[0]), /group L only/);
  assert.ok(dictionaryRows([sheet]).every((r) => r[5]), 'every column explains itself');
  assert.deepEqual(base.columns.slice(0, 6).map((c) => c.header), ['ResponseId', 'id', 'group', 'for_date', 'RecordedDate', 'late']);
});

test('the highlights count submissions, people, late answers and the average of each rating', () => {
  const raw = [
    { participant_code: 'P-001', grp: 'L', late: false, answers: { l: 4 } },
    { participant_code: 'P-001', grp: 'L', late: true, answers: { l: 5 } },
    { participant_code: 'P-002', grp: 'S', late: false, answers: { s: true } },
  ];
  const h = Object.fromEntries(highlights(raw, [loop, snack]).map((x) => [x.label, x.value]));
  assert.deepEqual([h.Submissions, h['Participants answering'], h['Answered late'], h['Group L'], h['Group S'], h['lunch_loop, average']], ['3', '2', '33%', '2', '1', '4.50']);
  assert.equal(highlights([], []).find((x) => x.label === 'Answered late').value, '0%');
});

test('column names and codes are checked before they are sent', () => {
  assert.deepEqual(validateColumn({ key: 'lunch_loop', codes: '' }, loop), []);
  assert.equal(validateColumn({ key: '1bad', codes: '' }, loop).length, 1);
  assert.equal(validateColumn({ key: 'x', codes: '1, 2' }, hall).length, 1, 'three choices need three codes');
  assert.equal(validateColumn({ key: 'x', codes: '1, 2, 2' }, hall).length, 1);
  assert.equal(validateColumn({ key: 'x', codes: '1, 2, a' }, hall).length, 1);
  assert.deepEqual(validateColumn({ key: 'x', codes: '2, 1, 0' }, hall), []);
  assert.deepEqual(validateColumn({ key: 'x', codes: '1, 0' }, snack), []);
  assert.equal(validateColumn({ key: 'x', codes: '1, 2' }, loop).length, 1, 'a rating has no codes');
  assert.deepEqual(columnArgs({ key: ' lunch_hall ', codes: '2, 1, 0' }, hall), { p_id: 'h', p_key: 'lunch_hall', p_codes: [2, 1, 0] });
  assert.deepEqual(columnArgs({ key: '', codes: '' }, hall), { p_id: 'h', p_key: null, p_codes: null });
  assert.equal(wantsCodes(loop), false);
  assert.equal(codesText(hall), '1, 2, 0');
  assert.equal(defaultCodesText(waste), '1, 2, 3');
  assert.equal(defaultCodesText(snack), '1, 0');
});
