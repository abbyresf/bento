import { useState } from 'react';
import { createPortal } from 'react-dom';
import { formatClock } from '../../utils/mealHours';
import Mascot from '../Mascot/Mascot';
import { haptics } from '../../lib/haptics';
import { nowHours, countdown, pickNextMeal, nextMilestone } from './heroTiming.js';
import './loud.css';

const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
// One hero color per state, so the screen has one color moment and it means something.
const HERO = { open: 'is-or', safe: 'is-sk', before: 'is-glass', done: 'is-glass' };

/* A progress ring in a glass tile. The ring fills clockwise from the top. */
function Ring({ value, unit, pct, color, flame = false }) {
  const c = 2 * Math.PI * 22;
  return (
    <div className="loud-ring loud-glass">
      <svg viewBox="0 0 54 54" aria-hidden="true">
        <circle cx="27" cy="27" r="22" fill="none" stroke="rgba(127,127,127,.22)" strokeWidth="6" />
        <circle cx="27" cy="27" r="22" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      {flame && (
        <svg className="loud-ring-flame" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2c1 3.4 4.8 5.6 4.8 10.2A4.8 4.8 0 0 1 7.2 14c0-2 1-3.4 2.2-4.4.2 1.4 1 2.4 2 2.6C10.8 9 11.2 5.2 12 2z" fill="var(--or)" />
          <path d="M12 21.5a3.4 3.4 0 0 1-3.4-3.4c0-1.6 1.2-2.6 2-3.6.3 1 1 1.6 1.8 1.8.4-1 .6-2 .4-3.2 1.6 1.2 2.6 2.8 2.6 4.8a3.4 3.4 0 0 1-3.4 3.6z" fill="var(--bu)" />
        </svg>
      )}
      <b>{value}</b>
      <span>{unit}</span>
    </div>
  );
}

/* Today in the Loud pilot. It answers three things, top to bottom: what to eat next, how the day is going, who is out.
 * Every action goes through the handlers the current Today already uses, so confirming, swapping and rating save the
 * same rows they always did. */
export default function LoudToday({
  dateNav, streak, dietLabel, meals, totals, targets, friendsOut,
  confirming, onConfirm, onChangeDishes, onFriends, starter, onPersonalize, bentoSay, outfit, onCloset, now = new Date(),
}) {
  const next = pickNextMeal(meals, now);
  const [logging, setLogging] = useState(false);
  // Meals earlier today that were never logged: over, or open now but not the one the hero is showing.
  const missed = meals.filter((m) => m.active && !m.confirmed && m.meal !== next?.meal && nowHours(now) >= m.hours.start);
  const isBefore = next && nowHours(now) < next.hours.start;
  const state = !next ? 'done' : isBefore ? 'before' : dietLabel ? 'safe' : 'open';
  const heroClass = HERO[state];
  const primaryInk = state === 'safe';

  const planned = meals.filter((m) => m.active).length;
  const eaten = meals.filter((m) => m.active && m.confirmed).length;
  const allLogged = planned > 0 && eaten === planned;
  // When a meal is logged the rings flash and the hero bounces. Tracked as derived state, so it fires on the change
  // itself and never on first load.
  const [prevEaten, setPrevEaten] = useState(eaten);
  const [flash, setFlash] = useState(0);
  if (eaten !== prevEaten) {
    setPrevEaten(eaten);
    if (eaten > prevEaten) setFlash((n) => n + 1);
  }
  const label = !next ? (allLogged ? 'Every meal logged' : 'The halls are closed for today')
    : isBefore ? `${MEAL_LABEL[next.meal]} at ${next.hall} opens in`
    : `${next.hall} · open till ${formatClock(next.hours.end)}`;
  const big = !next ? (allLogged ? 'Done' : 'Closed') : isBefore ? countdown(next.hours.start, now) : MEAL_LABEL[next.meal];

  const pct = (v, t) => (t ? Math.min(100, Math.round((v / t) * 100)) : 0);

  return (
    <section className="loud loud-today" aria-label="Today">
      <span className="loud-glow" style={{ background: 'var(--or)', width: 240, height: 240, left: 120, top: 60 }} />
      <span className="loud-glow" style={{ background: 'var(--lc)', width: 220, height: 220, left: -60, top: 380 }} />
      <span className="loud-glow" style={{ background: 'var(--pk)', width: 200, height: 200, left: 200, top: 520 }} />

      <LoudDateNav {...dateNav} />
      {dietLabel ? <div className="loud-diet">{dietLabel}</div> : null}

      {bentoSay && (
        <div className="loud-says">
          <div className="loud-says-side">
            <button type="button" className="loud-says-bento" onClick={() => { haptics.light(); onCloset(); }} aria-label="Open Bento's closet">
              <Mascot mood={bentoSay.mood} size={58} outfit={outfit} />
            </button>
            <button type="button" className="loud-closet-link" onClick={() => { haptics.light(); onCloset(); }}>Closet</button>
          </div>
          <div className="loud-says-bubble loud-glass" key={bentoSay.text}>{bentoSay.text}</div>
        </div>
      )}

      <div key={`hero-${flash}`} className={`loud-hero ${heroClass}${heroClass === 'is-glass' ? ' loud-glass' : ''}${flash ? ' is-logged' : ''}${allLogged && flash ? ' is-done' : ''}`}>
        <div className="loud-label" style={isBefore ? { color: 'var(--pk)', opacity: 1 } : undefined}>{label}</div>
        <div className="loud-big">{big}</div>

        {!next && !allLogged && (
          <button type="button" className="loud-primary is-li" onClick={() => { haptics.light(); setLogging(true); }}>Log a meal you ate</button>
        )}
        {next && (
          <>
            {isBefore && <div className="loud-label" style={{ marginBottom: 8 }}>Your {next.meal} plan</div>}
            <div className="loud-rows">
              {next.items.length === 0 && <div className="loud-empty">Nothing planned yet. Pick dishes below.</div>}
              {next.items.map((item) => (
                <div className="loud-row" key={item.id}>
                  <b>{item.name}</b>
                  <span>{dietLabel ? '✓ Safe' : item.avg ? `★ ${item.avg.toFixed(1)}` : ''}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              className={`loud-primary ${primaryInk ? 'is-ink' : 'is-li'}`}
              onClick={() => { haptics.medium(); onConfirm(next.meal); }}
              disabled={isBefore || confirming[next.meal] || next.items.length === 0}
            >
              {isBefore ? `Opens at ${formatClock(next.hours.start)}` : confirming[next.meal] ? 'Saving…' : 'I ate this'}
            </button>
            <button type="button" className="loud-secondary" onClick={() => { haptics.selection(); onChangeDishes(next.meal); }}>Change dishes</button>
          </>
        )}
        {next && missed.length > 0 && (
          <button type="button" className="loud-missed" onClick={() => { haptics.light(); setLogging(true); }}>
            Missed {missed.map((m) => MEAL_LABEL[m.meal].toLowerCase()).join(' and ')}? Log it
          </button>
        )}
      </div>

      {targets && (
        <div className="loud-rings">
          {flash > 0 && <span key={`flash-${flash}`} className="loud-rings-flash" aria-hidden="true" />}
          <Ring value={Math.round(totals.calories).toLocaleString()} unit={`of ${Math.round(targets.calories).toLocaleString()} cal${starter ? ' · starter' : ''}`}
            pct={pct(totals.calories, targets.calories)} color="var(--or)" />
          <Ring value={`${Math.round(totals.protein)}g`} unit={`of ${Math.round(targets.protein)}g protein`}
            pct={pct(totals.protein, targets.protein)} color="var(--li)" />
          <Ring value={`${eaten}/${planned}`} unit="meals" pct={pct(eaten, planned)} color="var(--sk)" />
          <Ring value={streak} unit={streak === 1 ? 'day streak' : 'day streak'} pct={pct(streak, nextMilestone(streak))} color="var(--or)" flame />
        </div>
      )}

      {starter && (
        <button type="button" className="loud-personal loud-glass" onClick={onPersonalize}>
          <span className="tx"><b>Get a plan built for you</b>Add your height, weight and activity. Bento sets your own targets.</span>
          <span className="chev" aria-hidden="true">›</span>
        </button>
      )}

      {friendsOut.length > 0 && (
        <button type="button" className="loud-friends loud-glass" onClick={onFriends} style={{ width: '100%', border: 0, textAlign: 'left', font: 'inherit' }}>
          <span className="face" aria-hidden="true"><Mascot size={30} hop={false} color={friendsOut[0].color ?? null} /></span>
          <span className="tx">
            <b>{friendsOut.slice(0, 2).map((f) => f.name).join(' + ')}{friendsOut.length > 2 ? ` + ${friendsOut.length - 2}` : ''}</b>
            {friendsOut[0].where}
          </span>
          <span className="chev" aria-hidden="true">›</span>
        </button>
      )}
      {logging && createPortal(
        <LogSheet
          meals={next ? missed : meals.filter((m) => m.active && !m.confirmed)}
          confirming={confirming}
          onConfirm={(meal) => { setLogging(false); onConfirm(meal); }}
          onChangeDishes={(meal) => { setLogging(false); onChangeDishes(meal, { thenLog: true }); }}
          onClose={() => setLogging(false)}
        />, document.body,
      )}
    </section>
  );
}

/* Log a meal that already happened. Each unlogged meal shows Bento's plan for it, with one tap to log it as eaten or a
 * way to pick what you actually had first. Logging goes through the same confirm as the hero, so the rings, the streak
 * and the rating sheet all follow. */
function LogSheet({ meals, confirming, onConfirm, onChangeDishes, onClose }) {
  return (
    <div className="loud-log-overlay" onClick={onClose}>
      <div className="loud-log-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Log a meal">
        <i className="loud-log-grab" />
        <h2>Log a meal</h2>
        {meals.length === 0 && <p className="loud-log-empty">Every meal today is logged.</p>}
        {meals.map((m) => (
          <div key={m.meal} className="loud-log-meal">
            <div className="loud-log-head"><b>{MEAL_LABEL[m.meal]}</b><span>{m.hall}</span></div>
            <p>{m.items.length ? m.items.map((i) => i.name).join(', ') : 'No plan for this meal.'}</p>
            <div className="loud-log-acts">
              <button type="button" className="ghost" onClick={() => onChangeDishes(m.meal)}>I ate something else</button>
              <button type="button" className="go" disabled={!m.items.length || confirming[m.meal]} onClick={() => { haptics.medium(); onConfirm(m.meal); }}>
                {confirming[m.meal] ? 'Saving…' : 'I ate this'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const CHEV = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

/* The date, big and centered under the help and settings buttons, with day arrows big enough to hit. */
export function LoudDateNav({ word, date, onPrev, onNext, nextDisabled = false }) {
  return (
    <nav className="loud-datenav" aria-label="Choose a day">
      <button type="button" onClick={onPrev} aria-label="Previous day"><svg {...CHEV}><path d="M15 18l-6-6 6-6" /></svg></button>
      <div className="loud-datenav-label" aria-live="polite">
        <b>{word}</b>
        {word !== date && <span>{date}</span>}
      </div>
      <button type="button" onClick={onNext} disabled={nextDisabled} aria-label="Next day"><svg {...CHEV}><path d="M9 18l6-6-6-6" /></svg></button>
    </nav>
  );
}

/* Any day but today. A past day shows what was eaten against the targets. Tomorrow shows what Bento planned.
 * The meal cards below it (with log, undo and dish changes) come from the full day list. */
export function LoudDay({ dateNav, ready, past, meals, eaten, planned, targets }) {
  const active = meals.filter((m) => m.active);
  const logged = active.filter((m) => m.confirmed).length;
  const t = past ? eaten : planned;
  const pct = (v, max) => (max ? Math.min(100, Math.round((v / max) * 100)) : 0);
  const label = past ? 'Meals logged' : 'Bento planned';
  const big = past ? `${logged} of ${active.length}` : `${active.length} ${active.length === 1 ? 'meal' : 'meals'}`;
  const note = past
    ? (logged === active.length && active.length > 0 ? 'Every meal logged. Nice day.' : 'Missed one? Log it below.')
    : 'Plans can change. Swap dishes below.';

  return (
    <section className="loud loud-today loud-day" aria-label={dateNav.word}>
      <span className="loud-glow" style={{ background: past ? 'var(--sk)' : 'var(--lc)', width: 240, height: 240, left: 120, top: 40 }} />
      <span className="loud-glow" style={{ background: 'var(--pk)', width: 200, height: 200, left: -60, top: 260 }} />
      <LoudDateNav {...dateNav} />
      {ready && (
        <>
          <div className="loud-hero is-glass loud-glass">
            <div className="loud-label">{label}</div>
            <div className="loud-big">{big}</div>
            <p className="loud-day-note">{note}</p>
          </div>
          {targets && t && (
            <div className="loud-rings loud-rings-3">
              <Ring value={Math.round(t.calories).toLocaleString()} unit={`of ${Math.round(targets.calories).toLocaleString()} cal${past ? '' : ' planned'}`}
                pct={pct(t.calories, targets.calories)} color="var(--or)" />
              <Ring value={`${Math.round(t.protein)}g`} unit={`of ${Math.round(targets.protein)}g protein`}
                pct={pct(t.protein, targets.protein)} color="var(--li)" />
              <Ring value={past ? `${logged}/${active.length}` : active.length} unit={past ? 'meals' : 'meals planned'}
                pct={past ? pct(logged, active.length) : 100} color="var(--sk)" />
            </div>
          )}
        </>
      )}
    </section>
  );
}
