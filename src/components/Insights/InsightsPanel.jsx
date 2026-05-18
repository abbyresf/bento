import { useState, useEffect } from 'react';
import { getWeeklySummaries, getNutritionTargets, getDailyGoalHits } from '../../lib/db';
import WeeklySummaryCard from './WeeklySummaryCard';
import './InsightsPanel.css';

function formatWeekRange(weekStart) {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function Callouts({ latest, targets, goalHits }) {
  const empty = !latest || !targets;

  if (empty) {
    return (
      <div className="insights-callouts">
        <p className="insights-section-label">Highlights</p>
        <div className="insights-callout placeholder">
          <span className="callout-emoji">🏆</span>
          <span className="callout-text placeholder-text">Goal streaks will appear here</span>
        </div>
        <div className="insights-callout placeholder">
          <span className="callout-emoji">🎯</span>
          <span className="callout-text placeholder-text">Macro averages vs. your targets</span>
        </div>
        <div className="insights-callout placeholder">
          <span className="callout-emoji">📈</span>
          <span className="callout-text placeholder-text">Weekly trends and progress notes</span>
        </div>
      </div>
    );
  }

  const callouts = [];

  if (goalHits) {
    const { numDays, protein, calories, carbs, fat } = goalHits;
    const hits = [
      { label: 'calorie', count: calories },
      { label: 'protein', count: protein },
      { label: 'carb',    count: carbs },
      { label: 'fat',     count: fat },
    ];
    for (const { label, count } of hits) {
      if (count === numDays) {
        callouts.push({ emoji: '🏆', text: `You hit your ${label} goal every day this week!` });
      } else if (count >= numDays * 0.5) {
        callouts.push({ emoji: '💪', text: `You hit your ${label} goal ${count} out of ${numDays} days this week.` });
      }
    }
  }

  const macros = [
    { label: 'calories', value: Math.round(latest.avg_calories ?? 0), target: targets.calories,        unit: '' },
    { label: 'protein',  value: Math.round(latest.avg_protein  ?? 0), target: targets.macros?.protein, unit: 'g' },
    { label: 'carbs',    value: Math.round(latest.avg_carbs    ?? 0), target: targets.macros?.carbs,   unit: 'g' },
    { label: 'fat',      value: Math.round(latest.avg_fat      ?? 0), target: targets.macros?.fat,     unit: 'g' },
  ];

  for (const { label, value, target, unit } of macros) {
    if (!target) continue;
    const pct = value / target;
    const diff = Math.abs(Math.round(value - target));
    if (pct >= 0.9 && pct <= 1.1) {
      callouts.push({ emoji: '🎯', text: `Solid ${label} week — you averaged ${value}${unit}, right on your ${target}${unit} goal.` });
    } else if (value > target) {
      callouts.push({ emoji: '⚡', text: `Your avg ${label} was ${value}${unit} — ${diff}${unit} above your goal.` });
    } else {
      callouts.push({ emoji: '📈', text: `Your avg ${label} was ${value}${unit} — ${diff}${unit} below your ${target}${unit} goal.` });
    }
  }

  if (!callouts.length) return null;

  return (
    <div className="insights-callouts">
      <p className="insights-section-label">Highlights</p>
      {callouts.slice(0, 4).map((c, i) => (
        <div key={i} className="insights-callout">
          <span className="callout-emoji">{c.emoji}</span>
          <span className="callout-text">{c.text}</span>
        </div>
      ))}
    </div>
  );
}

function StreakHistory({ summaries }) {
  const empty = !summaries?.length;

  return (
    <div className="streak-history-section">
      <p className="insights-section-label">Streak History</p>
      <div className="streak-history-list">
        {empty ? (
          <>
            <div className="streak-history-row placeholder">
              <span className="streak-history-week placeholder-text">Week of —</span>
              <span className="streak-history-count placeholder-text">🔥 —</span>
            </div>
            <div className="streak-history-row placeholder">
              <span className="streak-history-week placeholder-text">Week of —</span>
              <span className="streak-history-count placeholder-text">🔥 —</span>
            </div>
            <div className="streak-history-row placeholder">
              <span className="streak-history-week placeholder-text">Week of —</span>
              <span className="streak-history-count placeholder-text">🔥 —</span>
            </div>
          </>
        ) : (
          summaries.map(s => (
            <div key={s.week_start} className="streak-history-row">
              <span className="streak-history-week">{formatWeekRange(s.week_start)}</span>
              <span className="streak-history-count">🔥 {s.streak_at_end}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function InsightsPanel({ onClose, tabMode = false }) {
  const [summaries, setSummaries] = useState(null);
  const [targets, setTargets] = useState(null);
  const [goalHits, setGoalHits] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getWeeklySummaries(8),
      getNutritionTargets(),
      getDailyGoalHits(),
    ]).then(([s, t, g]) => {
      setSummaries(s);
      setTargets(t);
      setGoalHits(g);
      setLoading(false);
    });
  }, []);

  const latest = summaries?.[0] ?? null;

  if (tabMode) {
    return (
      <div className="insights-panel-page">
        <div className="insights-panel-header">
          <h2>Insights</h2>
          <button className="insights-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="insights-body">
          {loading ? (
            <p className="insights-loading">Loading…</p>
          ) : (
            <>
              {!latest && (
                <p className="insights-pending-note">
                  Confirm meals for a full week to fill in your stats — here's what you'll see:
                </p>
              )}
              <WeeklySummaryCard summary={latest} targets={targets} />
              <Callouts latest={latest} targets={targets} goalHits={goalHits} />
              <StreakHistory summaries={summaries} />
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="insights-overlay" onClick={onClose} />
      <div className="insights-panel">
        <div className="insights-panel-header">
          <h2>Insights</h2>
          <button className="insights-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="insights-body">
          {loading ? (
            <p className="insights-loading">Loading…</p>
          ) : (
            <>
              {!latest && (
                <p className="insights-pending-note">
                  Confirm meals for a full week to fill in your stats — here's what you'll see:
                </p>
              )}
              <WeeklySummaryCard summary={latest} targets={targets} />
              <Callouts latest={latest} targets={targets} goalHits={goalHits} />
              <StreakHistory summaries={summaries} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
