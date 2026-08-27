import { useState, useEffect } from 'react';
import { getWeeklySummaries, getWeeklyHistoryFromMealHistory, getNutritionTargets, getDailyGoalHits, getDailyBreakdown, getStreak } from '../../lib/db';
import WeeklySummaryCard from './WeeklySummaryCard';
import DailyBreakdown from './DailyBreakdown';
import BadgesPanel from '../Badges/BadgesPanel';
import { BADGES, getEarnedBadges } from '../../data/badges';
import './InsightsPanel.css';

function formatWeekRange(weekStart) {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function Callouts({ latest, targets, goalHits }) {
  if (!targets || !goalHits) {
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
  const { numDays, protein, calories, carbs, fat, avgCalories, avgProtein, avgCarbs, avgFat } = goalHits;

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

  const macros = [
    { label: 'calories', value: avgCalories, target: targets.calories,        unit: '' },
    { label: 'protein',  value: avgProtein,  target: targets.macros?.protein, unit: 'g' },
    { label: 'carbs',    value: avgCarbs,    target: targets.macros?.carbs,   unit: 'g' },
    { label: 'fat',      value: avgFat,      target: targets.macros?.fat,     unit: 'g' },
  ];

  for (const { label, value, target, unit } of macros) {
    if (!target || value == null) continue;
    const pct = value / target;
    const diff = Math.abs(Math.round(value - target));
    if (pct >= 0.9 && pct <= 1.1) {
      callouts.push({ emoji: '🎯', text: `Solid ${label} — you're averaging ${value}${unit}, right on your ${target}${unit} goal.` });
    } else if (value > target) {
      callouts.push({ emoji: '⚡', text: `Your avg ${label} is ${value}${unit} — ${diff}${unit} above your goal.` });
    } else {
      callouts.push({ emoji: '📈', text: `Your avg ${label} is ${value}${unit} — ${diff}${unit} below your ${target}${unit} goal.` });
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

// The live streak figure, moved off the meal-plan header. A streak only counts
// as running if a meal was confirmed today or yesterday; otherwise it has
// lapsed and showing the old number would overstate it.
function CurrentStreak({ streak, onOpenBadges }) {
  if (!streak) return null;

  const current = streak.effectiveStreak;
  const earned = getEarnedBadges(streak.longestStreak ?? 0).length;

  return (
    <div className="streak-current">
      <div className="streak-current-main">
        <span className="streak-current-flame">{current > 0 ? '🔥' : '·'}</span>
        <div className="streak-current-text">
          <span className="streak-current-count">
            {current > 0 ? `${current} day${current !== 1 ? 's' : ''}` : 'No streak yet'}
          </span>
          <span className="streak-current-sub">
            {current > 0
              ? `Longest: ${streak.longestStreak} day${streak.longestStreak !== 1 ? 's' : ''}`
              : 'Confirm a meal to start one'}
          </span>
        </div>
      </div>
      <button className="streak-badges-btn" onClick={onOpenBadges}>
        {earned} / {BADGES.length} badges
      </button>
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
              <span className="streak-history-count">🔥 {s.streak_at_end} day{s.streak_at_end !== 1 ? 's' : ''}</span>
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
  const [dailyDays, setDailyDays] = useState(null);
  const [streak, setStreak] = useState(null);
  const [showBadges, setShowBadges] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getWeeklySummaries(8),
      getNutritionTargets(),
      getDailyGoalHits(),
      getWeeklyHistoryFromMealHistory(8),
      getDailyBreakdown(),
      getStreak(),
    ]).then(([s, t, g, h, d, st]) => {
      setSummaries(s?.length ? s : h);
      setTargets(t);
      setGoalHits(g);
      setDailyDays(d);
      // A streak only counts as running if a meal was confirmed today or
      // yesterday; otherwise it lapsed and showing the stored number would
      // overstate it.
      const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const active = st?.lastConfirmedDate === iso(new Date())
        || st?.lastConfirmedDate === iso(new Date(Date.now() - 86400000));
      setStreak(st ? { ...st, effectiveStreak: active ? st.currentStreak : 0 } : null);
      setLoading(false);
    });
  }, []);

  const latestCompleted = summaries?.[0] ?? null;
  // Fall back to a live summary built from this week's meal history
  const liveSummary = (!latestCompleted && goalHits) ? {
    week_start:   null,
    avg_calories: goalHits.avgCalories,
    avg_protein:  goalHits.avgProtein,
    avg_carbs:    goalHits.avgCarbs,
    avg_fat:      goalHits.avgFat,
    top_foods:    [],
    best_day:     null,
    isCurrentWeek: true,
  } : null;
  const latest = latestCompleted ?? liveSummary;

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
                  Start confirming meals to see your stats here.
                </p>
              )}
              <CurrentStreak streak={streak} onOpenBadges={() => setShowBadges(true)} />
              <WeeklySummaryCard summary={latest} targets={targets} />
              <DailyBreakdown days={dailyDays} targets={targets} />
              <Callouts latest={latest} targets={targets} goalHits={goalHits} />
              <StreakHistory summaries={summaries} />
            </>
          )}
        </div>
        {showBadges && (
          <BadgesPanel longestStreak={streak?.longestStreak ?? 0} onClose={() => setShowBadges(false)} />
        )}
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
                  Start confirming meals to see your stats here.
                </p>
              )}
              <CurrentStreak streak={streak} onOpenBadges={() => setShowBadges(true)} />
              <WeeklySummaryCard summary={latest} targets={targets} />
              <DailyBreakdown days={dailyDays} targets={targets} />
              <Callouts latest={latest} targets={targets} goalHits={goalHits} />
              <StreakHistory summaries={summaries} />
            </>
          )}
        </div>
        {showBadges && (
          <BadgesPanel longestStreak={streak?.longestStreak ?? 0} onClose={() => setShowBadges(false)} />
        )}
      </div>
    </>
  );
}
