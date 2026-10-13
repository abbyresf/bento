import { useEffect, useMemo, useState } from 'react';
import { SHEETS } from './sheets.js';
import { useLiveSheet } from './useLiveSheet.js';
import { fetchStudy } from './data.js';
import { liveSummary, groupBalance } from './live.js';
import { displayValue } from './rows.js';

const sheet = (id) => SHEETS.find((s) => s.id === id);
const pct = (r) => (r === null || r === undefined ? 'Nothing due yet' : `${r}%`);

/* The study at a glance, and a feed of what is happening now. Everything here is
 * counts and codes. No name and no email is shown on this page. */
export default function LivePage() {
  const participants = useLiveSheet(sheet('participants'));
  const activity = useLiveSheet(sheet('activity'));
  const prompts = useLiveSheet(sheet('prompts'));
  const events = useLiveSheet(sheet('events'));
  const [study, setStudy] = useState(null);
  useEffect(() => { fetchStudy().then(setStudy).catch(() => {}); }, []);

  const loading = [participants, activity, prompts, events].some((s) => s.rows === null && !s.error);
  const error = [participants, activity, prompts, events].map((s) => s.error).find(Boolean);
  const s = useMemo(() => (loading ? null : liveSummary({
    participants: participants.rows ?? [], activity: activity.rows ?? [], prompts: prompts.rows ?? [],
    events: events.rows ?? [], cap: study?.cap ?? null,
  })), [loading, participants.rows, activity.rows, prompts.rows, events.rows, study]);

  if (error) return <div className="rs-alert" role="alert">{error}</div>;
  if (!s) return <div className="rs-loading">Reading the study…</div>;
  const offline = [participants, activity, prompts, events].some((x) => x.status === 'offline');

  return (
    <div className="rs-live-page">
      <header className="rs-pagehead">
        <h1>{study?.name ?? 'The study'}</h1>
        <span className={`rs-live rs-live-${offline ? 'offline' : 'live'}`}><i aria-hidden="true" /> {offline ? 'Not live. Reload to refresh.' : 'Live'}</span>
      </header>

      <div className="rs-cards">
        <article className="rs-card">
          <h2>Enrolled</h2>
          <p className="rs-big">{s.enrolled}{s.cap ? <small> of {s.cap}</small> : null}</p>
          <p className="rs-sub">{s.active} active, {s.completed} finished, {s.withdrawn} left</p>
        </article>
        <article className="rs-card">
          <h2>Groups</h2>
          <p className="rs-big">S {s.groups.S}<small> and </small>L {s.groups.L}</p>
          <p className="rs-sub">{groupBalance(s.groups) === 0 ? 'Even' : `${groupBalance(s.groups)} apart`}, among active participants</p>
        </article>
        <article className="rs-card">
          <h2>Survey response rate</h2>
          <p className="rs-big">{pct(s.rates.all.rate)}</p>
          <p className="rs-sub">S {pct(s.rates.S.rate)}. L {pct(s.rates.L.rate)}.</p>
          <p className="rs-sub">{s.rates.all.answered} answered of {s.rates.all.due} due</p>
        </article>
        <article className="rs-card">
          <h2>Sent today</h2>
          <p className="rs-big">{s.prompts.sent}<small> of {s.prompts.today}</small></p>
          <p className="rs-sub">{s.prompts.failed} failed, {s.prompts.noDevice} with no device</p>
        </article>
        <article className="rs-card">
          <h2>Cannot be reached</h2>
          <p className="rs-big">{s.pushOff}</p>
          <p className="rs-sub">active participants whose phone cannot get the study reminders</p>
        </article>
      </div>

      <section className="rs-feed" aria-label="Latest activity">
        <h2>Latest activity</h2>
        {s.recent.length === 0 ? <p className="rs-sub">Nothing yet.</p> : (
          <table>
            <thead><tr><th>When</th><th>Participant</th><th>Group</th><th>What</th></tr></thead>
            <tbody>
              {s.recent.map((e) => (
                <tr key={e.row_id}>
                  <td>{displayValue(e.at, 'datetime')}</td><td>{e.participant_code}</td><td>{e.grp}</td><td>{e.kind.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
