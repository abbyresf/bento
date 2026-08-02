import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  getPulseOverview, getDailyEngagement, getMealTypeSplit,
  getTopItems, getDietaryBreakdown, getNutritionAverages,
  sendInvite, getInvites, getAdminSuggestions,
} from '../../lib/pulseDb';
import { getRatingAggregates } from '../../lib/db';
import './PulseDashboard.css';

const MEAL_COLORS = ['#f47421', '#243b55', '#64a8d1'];
const RANGES = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

function formatDate(str) {
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function asOfLabel() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── CSV export ──────────────────────────────────────────────────────────────

function downloadCSV(filename, rows) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const v = r[h] ?? '';
      return typeof v === 'string' && (v.includes(',') || v.includes('"'))
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    }).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAll({ university, days, overview, engagement, mealSplit, topItems, dietary, nutrition }) {
  const date = asOfLabel();
  const lines = [];

  lines.push(`Bento Pulse Export — ${university} — as of ${date} — Last ${days} days`);
  lines.push('');

  lines.push('=== AT A GLANCE ===');
  lines.push('Metric,Value,Change vs Prior Period');
  if (overview) {
    lines.push(`Registered Students,${overview.totalStudents},`);
    lines.push(`Active Students,${overview.activeThisPeriod},${overview.changeActive != null ? overview.changeActive + '%' : ''}`);
    lines.push(`Meals Confirmed,${overview.mealsThisPeriod},${overview.changeMeals != null ? overview.changeMeals + '%' : ''}`);
  }
  lines.push('');

  if (nutrition) {
    lines.push('=== NUTRITION AVERAGES ===');
    lines.push('Nutrient,Average per Item,Change vs Prior Period');
    lines.push(`Calories,${nutrition.calories} kcal,${nutrition.changeCalories != null ? nutrition.changeCalories + '%' : ''}`);
    lines.push(`Protein,${nutrition.protein}g,${nutrition.changeProtein != null ? nutrition.changeProtein + '%' : ''}`);
    lines.push(`Carbs,${nutrition.carbs}g,${nutrition.changeCarbs != null ? nutrition.changeCarbs + '%' : ''}`);
    lines.push(`Fat,${nutrition.fat}g,${nutrition.changeFat != null ? nutrition.changeFat + '%' : ''}`);
    lines.push('');
  }

  if (engagement?.length) {
    lines.push('=== DAILY ENGAGEMENT ===');
    lines.push('Date,Meals Confirmed,Students Active');
    engagement.forEach(r => lines.push(`${r.date},${r.meals},${r.users}`));
    lines.push('');
  }

  if (mealSplit?.length) {
    lines.push('=== MEAL TYPE SPLIT ===');
    lines.push('Meal Type,Count');
    mealSplit.forEach(r => lines.push(`${r.name},${r.value}`));
    lines.push('');
  }

  if (topItems?.length) {
    lines.push('=== TOP ITEMS ===');
    lines.push('Item,Times Selected');
    topItems.forEach(r => lines.push(`"${r.name}",${r.count}`));
    lines.push('');
  }

  if (dietary?.length) {
    lines.push('=== DIETARY NEEDS ===');
    lines.push('Restriction,Student Count,Percentage');
    dietary.forEach(r => lines.push(`${r.name},${r.count},${r.pct}%`));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bento-pulse-${university}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ChangeTag({ pct, neutral }) {
  if (pct == null) return null;
  const up = pct >= 0;
  if (neutral) {
    return (
      <span className={`pulse-kpi-change ${up ? 'up' : 'down'}`}>
        {up ? '↑' : '↓'} {Math.abs(pct)}% vs prior period
      </span>
    );
  }
  return (
    <span className={`pulse-kpi-change ${up ? 'up' : 'down'}`}>
      {up ? '↑' : '↓'} {Math.abs(pct)}% vs prior period
    </span>
  );
}

function KPICard({ label, value, sub, change }) {
  return (
    <div className="pulse-kpi">
      <p className="pulse-kpi-label">{label}</p>
      <p className="pulse-kpi-value">{value ?? '—'}</p>
      <ChangeTag pct={change} />
      {sub && <p className="pulse-kpi-sub">{sub}</p>}
    </div>
  );
}

function ExportBtn({ onClick }) {
  return (
    <button className="pulse-export-btn" onClick={onClick} title="Export CSV">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6.5 1v7M4 6l2.5 2.5L9 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M1.5 9.5v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
      CSV
    </button>
  );
}

function Section({ title, children, onExport }) {
  return (
    <div className="pulse-section">
      <div className="pulse-section-header">
        <h2 className="pulse-section-title">{title}</h2>
        {onExport && <ExportBtn onClick={onExport} />}
      </div>
      {children}
    </div>
  );
}

function InsightCallout({ insights }) {
  if (!insights?.length) return null;
  return (
    <div className="pulse-insights">
      <p className="pulse-insights-label">Insights</p>
      <div className="pulse-insights-list">
        {insights.map((text, i) => (
          <div key={i} className="pulse-insight-row">
            <span className="pulse-insight-dot" />
            <p className="pulse-insight-text">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function generateInsights(overview, engagement, topItems, dietary) {
  const insights = [];

  if (overview?.changeActive != null) {
    const pct = overview.changeActive;
    if (pct <= -10) {
      insights.push(`Active students dropped ${Math.abs(pct)}% compared to the prior period. Worth investigating what changed.`);
    } else if (pct >= 10) {
      insights.push(`Active students are up ${pct}% compared to the prior period.`);
    }
  }

  if (overview?.changeMeals != null) {
    const pct = overview.changeMeals;
    if (pct <= -10) {
      insights.push(`Meal confirmations fell ${Math.abs(pct)}% this period. Engagement may be slipping.`);
    } else if (pct >= 10) {
      insights.push(`Meal confirmations are up ${pct}% this period.`);
    }
  }

  if (topItems?.length > 0) {
    insights.push(`"${topItems[0].name}" is your most selected item with ${topItems[0].count} confirmations.`);
  }

  if (dietary?.length > 0) {
    const top = dietary[0];
    insights.push(`${top.pct}% of students have ${top.name.toLowerCase()} restrictions. Check menu coverage for this group.`);
  }

  if (engagement?.length >= 7) {
    const recent  = engagement.slice(-3).reduce((s, d) => s + d.meals, 0) / 3;
    const earlier = engagement.slice(0, 3).reduce((s, d) => s + d.meals, 0) / 3;
    if (earlier > 0) {
      const trend = Math.round(((recent - earlier) / earlier) * 100);
      if (trend <= -15) {
        insights.push(`Daily meal confirmations have trended down ${Math.abs(trend)}% over this period.`);
      } else if (trend >= 15) {
        insights.push(`Daily meal confirmations have trended up ${trend}% over this period.`);
      }
    }
  }

  if (!insights.length) {
    insights.push('Engagement looks steady. No significant changes to flag this period.');
  }

  return insights;
}

const DONUT_TOOLTIP = {
  contentStyle: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#243b55' },
};
const BAR_TOOLTIP = {
  contentStyle: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#243b55' },
  labelStyle: { color: '#243b55' },
};

// ── Invite modal ─────────────────────────────────────────────────────────────

function InviteModal({ defaultUniversity, onClose }) {
  const [email, setEmail]           = useState('');
  const [university, setUniv]       = useState(defaultUniversity);
  const [invites, setInvites]       = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);
  const [sentTo, setSentTo]         = useState(null);
  const [copied, setCopied]         = useState(false);

  useEffect(() => {
    getInvites().then(setInvites).catch(() => setInvites([]));
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    setSentTo(null);
    setSubmitting(true);
    try {
      const result = await sendInvite(email, university);
      setSentTo({ email, emailSent: result.emailSent, link: result.link });
      setEmail('');
      getInvites().then(setInvites).catch(() => {});
    } catch (err) {
      setError(err.message ?? 'Failed to send invite.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = (link) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(link);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="pulse-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pulse-modal">
        <div className="pulse-modal-header">
          <h2 className="pulse-modal-title">Invite an admin</h2>
          <button className="pulse-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleCreate} className="pulse-invite-form">
          <div className="pulse-invite-row">
            <div className="pulse-invite-field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@university.edu"
                required
              />
            </div>
            <div className="pulse-invite-field pulse-invite-field-sm">
              <label>University</label>
              <input
                type="text"
                value={university}
                onChange={e => setUniv(e.target.value)}
                placeholder="brandeis"
                required
              />
            </div>
            <button type="submit" className="pulse-invite-submit" disabled={submitting}>
              {submitting ? '…' : 'Send'}
            </button>
          </div>
          {error && <p className="pulse-invite-err">{error}</p>}
        </form>

        {sentTo && (
          <div className="pulse-invite-newlink">
            {sentTo.emailSent ? (
              <p className="pulse-invite-newlink-label">
                ✓ Invite email sent to <strong>{sentTo.email}</strong>
              </p>
            ) : (
              <>
                <p className="pulse-invite-newlink-label">
                  Invite created — email delivery unavailable, share this link manually:
                </p>
                <div className="pulse-invite-link-row">
                  <span className="pulse-invite-link-text">{sentTo.link}</span>
                  <button className="pulse-invite-copy-btn" onClick={() => copyLink(sentTo.link)}>
                    {copied === sentTo.link ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="pulse-invite-list">
          <p className="pulse-invite-list-label">All invites</p>
          {invites === null && <p className="pulse-empty">Loading…</p>}
          {invites?.length === 0 && <p className="pulse-empty">No invites yet.</p>}
          {invites?.map(inv => {
            const used    = !!inv.used_at;
            const expired = !used && new Date(inv.expires_at) < new Date();
            const pending = !used && !expired;
            const link    = `${window.location.origin}/admin/join/${inv.id}`;
            return (
              <div key={inv.id} className="pulse-invite-row-item">
                <div className="pulse-invite-row-info">
                  <span className="pulse-invite-email">{inv.email}</span>
                  <span className="pulse-invite-uni">{inv.university}</span>
                </div>
                <div className="pulse-invite-row-right">
                  <span className={`pulse-invite-status ${used ? 'used' : expired ? 'expired' : 'pending'}`}>
                    {used ? 'Used' : expired ? 'Expired' : 'Pending'}
                  </span>
                  {pending && (
                    <button className="pulse-invite-copy-btn" onClick={() => copyLink(link)}>
                      {copied === link ? 'Copied!' : 'Copy link'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ──────────────────────────────────────────────────────────

export default function PulseDashboard({ university, isSuperAdmin, onSignOut }) {
  const [days, setDays]               = useState(30);
  const [overview, setOverview]       = useState(null);
  const [engagement, setEngagement]   = useState(null);
  const [mealSplit, setMealSplit]     = useState(null);
  const [topItems, setTopItems]       = useState(null);
  const [dietary, setDietary]         = useState(null);
  const [nutrition, setNutrition]     = useState(null);
  const [loading, setLoading]         = useState(true);
  const [showInvite, setShowInvite]   = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [ratingAggs, setRatingAggs]   = useState({});

  useEffect(() => {
    getRatingAggregates().then(setRatingAggs);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getPulseOverview(university, days),
      getDailyEngagement(university, days),
      getMealTypeSplit(university, days),
      getTopItems(university, days),
      getDietaryBreakdown(university),
      getNutritionAverages(university, days),
      getAdminSuggestions(university, days),
    ]).then(([ov, eng, ms, ti, diet, nutr, suggs]) => {
      setOverview(ov);
      setEngagement(eng);
      setMealSplit(ms);
      setTopItems(ti);
      setDietary(diet);
      setNutrition(nutr);
      setSuggestions(suggs);
      setLoading(false);
    });
  }, [university, days]);

  const insights = (!loading && overview)
    ? generateInsights(overview, engagement, topItems, dietary)
    : [];

  const totalMeals = mealSplit?.reduce((s, d) => s + d.value, 0) ?? 0;
  const universityLabel = university.charAt(0).toUpperCase() + university.slice(1);

  const exportData = { university, days, overview, engagement, mealSplit, topItems, dietary, nutrition };

  return (
    <div className="pulse-dashboard">
      <header className="pulse-header">
        <div className="pulse-header-inner">
          <div className="pulse-header-brand">
            <img src="/bentopulse.png" alt="Bento Pulse" className="pulse-header-logo" />
          </div>
          <div className="pulse-header-right">
            <div className="pulse-range-tabs">
              {RANGES.map(r => (
                <button
                  key={r.value}
                  className={`pulse-range-tab${days === r.value ? ' active' : ''}`}
                  onClick={() => setDays(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <span className="pulse-asof">as of {asOfLabel()}</span>
            <span className="pulse-university-badge">{universityLabel}</span>
            {!loading && (
              <button className="pulse-export-all-btn" onClick={() => exportAll(exportData)}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6.5 1v7M4 6l2.5 2.5L9 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1.5 9.5v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Export All
              </button>
            )}
            {isSuperAdmin && (
              <button className="pulse-invite-btn" onClick={() => setShowInvite(true)}>Invite</button>
            )}
            <button className="pulse-signout-btn" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </header>

      {showInvite && (
        <InviteModal
          defaultUniversity={university}
          onClose={() => setShowInvite(false)}
        />
      )}

      <main className="pulse-main">
        {loading ? (
          <div className="pulse-loading">
            <div className="pulse-spinner" />
            <p>Loading data...</p>
          </div>
        ) : (
          <>
            <InsightCallout insights={insights} />

            <Section title="At a Glance">
              <div className="pulse-kpi-grid">
                <KPICard
                  label="Registered Students"
                  value={overview?.totalStudents}
                  sub="total accounts"
                />
                <KPICard
                  label="Active Students"
                  value={overview?.activeThisPeriod}
                  sub="confirmed at least 1 meal"
                  change={overview?.changeActive}
                />
                <KPICard
                  label="Meals Confirmed"
                  value={overview?.mealsThisPeriod}
                  sub="this period"
                  change={overview?.changeMeals}
                />
                <KPICard
                  label="Avg Calories per Item"
                  value={nutrition ? `${nutrition.calories} kcal` : null}
                  sub="across all confirmed meals"
                  change={nutrition?.changeCalories}
                />
              </div>
            </Section>

            <Section
              title={`Daily Engagement - Last ${days} Days`}
              onExport={() => downloadCSV(
                `pulse-engagement-${university}.csv`,
                (engagement ?? []).map(r => ({ Date: r.date, 'Meals Confirmed': r.meals, 'Students Active': r.users }))
              )}
            >
              {engagement?.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={engagement} barSize={days > 30 ? 6 : 14}>
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={days > 14 ? Math.floor(days / 10) : 0} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip {...BAR_TOOLTIP} labelFormatter={formatDate} formatter={(v, name) => [v, name === 'meals' ? 'Meals confirmed' : 'Students']} />
                    <Bar dataKey="meals" fill="#f47421" radius={[3, 3, 0, 0]} name="meals" />
                    <Bar dataKey="users" fill="#243b55" radius={[3, 3, 0, 0]} name="users" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="pulse-empty">No engagement data for this period.</p>
              )}
              <div className="pulse-chart-legend">
                <span className="pulse-legend-dot" style={{ background: '#f47421' }} />Meals confirmed
                <span className="pulse-legend-dot" style={{ background: '#243b55', marginLeft: '0.75rem' }} />Students active
              </div>
            </Section>

            <div className="pulse-two-col">
              <Section
                title="Meal Type Split"
                onExport={() => downloadCSV(
                  `pulse-meal-split-${university}.csv`,
                  (mealSplit ?? []).map(r => ({ 'Meal Type': r.name, Count: r.value }))
                )}
              >
                {mealSplit?.length ? (
                  <div className="pulse-donut-wrap">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={mealSplit}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={85}
                          paddingAngle={2}
                        >
                          {mealSplit.map((_, i) => (
                            <Cell key={i} fill={MEAL_COLORS[i % MEAL_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip {...DONUT_TOOLTIP} />
                        <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, color: '#64748b' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pulse-donut-center">
                      <p className="pulse-donut-total">{totalMeals}</p>
                      <p className="pulse-donut-sub">total meals</p>
                    </div>
                  </div>
                ) : (
                  <p className="pulse-empty">No meal data for this period.</p>
                )}
              </Section>

              <Section
                title="Dietary Needs"
                onExport={() => downloadCSV(
                  `pulse-dietary-${university}.csv`,
                  (dietary ?? []).map(r => ({ Restriction: r.name, 'Student Count': r.count, Percentage: `${r.pct}%` }))
                )}
              >
                {dietary?.length ? (
                  <div className="pulse-dietary-list">
                    {dietary.map(d => (
                      <div key={d.name} className="pulse-dietary-row">
                        <span className="pulse-dietary-name">{d.name}</span>
                        <div className="pulse-dietary-bar-wrap">
                          <div className="pulse-dietary-bar" style={{ width: `${d.pct}%` }} />
                        </div>
                        <span className="pulse-dietary-pct">{d.pct}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pulse-empty">No dietary data yet.</p>
                )}
              </Section>
            </div>

            <Section
              title={`Top Items - Last ${days} Days`}
              onExport={() => downloadCSV(
                `pulse-top-items-${university}.csv`,
                (topItems ?? []).map(r => ({ Item: r.name, 'Times Selected': r.count }))
              )}
            >
              {topItems?.length ? (
                <ResponsiveContainer width="100%" height={topItems.length * 36 + 20}>
                  <BarChart data={topItems} layout="vertical" barSize={12}>
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip {...BAR_TOOLTIP} formatter={v => [v, 'Times selected']} />
                    <Bar dataKey="count" fill="#f47421" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="pulse-empty">No item data for this period.</p>
              )}
            </Section>

            {nutrition && (
              <Section
                title={`Nutrition Averages - Last ${days} Days`}
                onExport={() => downloadCSV(
                  `pulse-nutrition-${university}.csv`,
                  [
                    { Nutrient: 'Calories', 'Avg per Item': `${nutrition.calories} kcal`, 'Change vs Prior Period': nutrition.changeCalories != null ? `${nutrition.changeCalories}%` : '' },
                    { Nutrient: 'Protein',  'Avg per Item': `${nutrition.protein}g`,       'Change vs Prior Period': nutrition.changeProtein  != null ? `${nutrition.changeProtein}%`  : '' },
                    { Nutrient: 'Carbs',    'Avg per Item': `${nutrition.carbs}g`,          'Change vs Prior Period': nutrition.changeCarbs    != null ? `${nutrition.changeCarbs}%`    : '' },
                    { Nutrient: 'Fat',      'Avg per Item': `${nutrition.fat}g`,            'Change vs Prior Period': nutrition.changeFat      != null ? `${nutrition.changeFat}%`      : '' },
                  ]
                )}
              >
                <div className="pulse-nutrition-grid">
                  {[
                    { label: 'Calories', value: `${nutrition.calories} kcal`, change: nutrition.changeCalories },
                    { label: 'Protein',  value: `${nutrition.protein}g`,      change: nutrition.changeProtein  },
                    { label: 'Carbs',    value: `${nutrition.carbs}g`,         change: nutrition.changeCarbs    },
                    { label: 'Fat',      value: `${nutrition.fat}g`,           change: nutrition.changeFat      },
                  ].map(n => (
                    <div key={n.label} className="pulse-nutrition-card">
                      <p className="pulse-nutrition-label">{n.label}</p>
                      <p className="pulse-nutrition-value">{n.value}</p>
                      <ChangeTag pct={n.change} />
                      <p className="pulse-nutrition-sub">avg per item selected</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {/* Community: Suggestions */}
        <Section title={`Top Suggestions — Last ${days} Days`} onExport={null}>
          {suggestions.length === 0 ? (
            <p className="pulse-empty">No suggestions yet.</p>
          ) : (
            <div className="pulse-suggestions-list">
              {suggestions.map(s => (
                <div key={s.id} className="pulse-suggestion-row">
                  <p className="pulse-suggestion-text">{s.content}</p>
                  <div className="pulse-suggestion-meta">
                    <span className="pulse-suggestion-emph">+{s.emphasize_count} agree</span>
                    {s.flag_count > 0 && (
                      <span className="pulse-suggestion-flag">{s.flag_count} flags</span>
                    )}
                    <span className="pulse-suggestion-time">
                      {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Community: Food Ratings */}
        <Section title="Food Ratings" onExport={null}>
          {Object.keys(ratingAggs).length === 0 ? (
            <p className="pulse-empty">No ratings yet.</p>
          ) : (() => {
            const sorted = Object.values(ratingAggs)
              .filter(a => a.count >= 1)
              .sort((a, b) => b.avg - a.avg);
            const top    = sorted.slice(0, 5);
            const bottom = sorted.slice(-5).reverse();
            return (
              <div className="pulse-ratings-panels">
                <div>
                  <p className="pulse-ratings-label">Highest Rated</p>
                  {top.map(a => (
                    <div key={a.name} className="pulse-rating-row">
                      <span className="pulse-rating-name">{a.name}</span>
                      <span className="pulse-rating-score">{a.avg.toFixed(1)} ★ ({a.count})</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="pulse-ratings-label">Lowest Rated</p>
                  {bottom.map(a => (
                    <div key={a.name} className="pulse-rating-row">
                      <span className="pulse-rating-name">{a.name}</span>
                      <span className="pulse-rating-score">{a.avg.toFixed(1)} ★ ({a.count})</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </Section>
      </main>
    </div>
  );
}
