import { useState, useEffect, useMemo } from 'react';
import emailjs from '@emailjs/browser';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  getPulseOverview, getDailyEngagement, getMealTypeSplit,
  getTopItems, getDietaryBreakdown, getNutritionAverages,
  sendInvite, getInvites, getAdminSuggestions,
} from '../../lib/pulseDb';
import { getRatingAggregates } from '../../lib/db';
import './PulseDashboard.css';

const MEAL_COLORS  = ['#f47421', '#1a2b3c', '#64a8d1'];
const DIETARY_COLORS = {
  'Vegetarian':  '#f47421',
  'Gluten-free': '#77be3d',
  'Nut allergy': '#64a8d1',
  'Vegan':       '#a78bfa',
  'Kosher':      '#f59e0b',
  'Halal':       '#ec4899',
};
const RANGES = [
  { label: '7d',  value: 7  },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

function dietaryColor(name) {
  return DIETARY_COLORS[name] ?? '#94a3b8';
}

function formatDate(str) {
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function asOfLabel() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── CSV export ────────────────────────────────────────────────────────────────

function downloadCSV(filename, rows) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const v = r[h] ?? '';
      return typeof v === 'string' && (v.includes(',') || v.includes('"'))
        ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportAll({ university, days, overview, engagement, mealSplit, topItems, dietary, nutrition }) {
  const date  = asOfLabel();
  const lines = [];
  lines.push(`Bento Pulse Export — ${university} — as of ${date} — Last ${days} days`, '');
  lines.push('=== AT A GLANCE ===', 'Metric,Value,Change vs Prior Period');
  if (overview) {
    lines.push(`Registered Students,${overview.totalStudents},`);
    lines.push(`Installed to Home Screen,${overview.installedStudents ?? 0},${overview.installRate ?? ''}%`);
    lines.push(`Active Students,${overview.activeThisPeriod},${overview.changeActive != null ? overview.changeActive + '%' : ''}`);
    lines.push(`Meals Confirmed,${overview.mealsThisPeriod},${overview.changeMeals != null ? overview.changeMeals + '%' : ''}`);
  }
  lines.push('');
  if (nutrition) {
    lines.push('=== NUTRITION AVERAGES ===', 'Nutrient,Average per Item,Change vs Prior Period');
    lines.push(`Calories,${nutrition.calories} kcal,${nutrition.changeCalories != null ? nutrition.changeCalories + '%' : ''}`);
    lines.push(`Protein,${nutrition.protein}g,${nutrition.changeProtein != null ? nutrition.changeProtein + '%' : ''}`);
    lines.push(`Carbs,${nutrition.carbs}g,${nutrition.changeCarbs != null ? nutrition.changeCarbs + '%' : ''}`);
    lines.push(`Fat,${nutrition.fat}g,${nutrition.changeFat != null ? nutrition.changeFat + '%' : ''}`);
    lines.push('');
  }
  if (engagement?.length) {
    lines.push('=== DAILY ENGAGEMENT ===', 'Date,Meals Confirmed,Students Active');
    engagement.forEach(r => lines.push(`${r.date},${r.meals},${r.users}`));
    lines.push('');
  }
  if (mealSplit?.length) {
    lines.push('=== MEAL TYPE SPLIT ===', 'Meal Type,Count');
    mealSplit.forEach(r => lines.push(`${r.name},${r.value}`));
    lines.push('');
  }
  if (topItems?.length) {
    lines.push('=== TOP ITEMS ===', 'Item,Times Selected');
    topItems.forEach(r => lines.push(`"${r.name}",${r.count}`));
    lines.push('');
  }
  if (dietary?.length) {
    lines.push('=== DIETARY NEEDS ===', 'Restriction,Student Count,Percentage');
    dietary.forEach(r => lines.push(`${r.name},${r.count},${r.pct}%`));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `bento-pulse-${university}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ values, color = '#f47421' }) {
  const data = useMemo(() => {
    if (!values?.length) return null;
    const W = 72, H = 22, pad = 2;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const xs = values.map((_, i) => pad + (i / (values.length - 1)) * (W - 2 * pad));
    const ys = values.map(v => H - pad - ((v - min) / range) * (H - 2 * pad));
    let path = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
    for (let i = 1; i < values.length; i++) {
      const cx = ((xs[i] + xs[i - 1]) / 2).toFixed(1);
      path += ` C ${cx} ${ys[i - 1].toFixed(1)}, ${cx} ${ys[i].toFixed(1)}, ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`;
    }
    const area = path + ` L ${xs[xs.length - 1].toFixed(1)} ${H - pad} L ${xs[0].toFixed(1)} ${H - pad} Z`;
    return { path, area, lx: xs[xs.length - 1].toFixed(1), ly: ys[ys.length - 1].toFixed(1), W, H };
  }, [values]);

  if (!data) return null;
  const gid = `spk-${color.replace('#', '')}`;
  return (
    <svg width={data.W} height={data.H} className="pulse-spark" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0}    />
        </linearGradient>
      </defs>
      <path d={data.area} fill={`url(#${gid})`} />
      <path d={data.path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={data.lx} cy={data.ly} r="2.5" fill={color} />
    </svg>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChangeTag({ pct }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span className={`pulse-kpi-change ${up ? 'up' : 'down'}`}>
      {up ? '↑' : '↓'} {Math.abs(pct)}% vs prior period
    </span>
  );
}

function KPICard({ label, value, change, sparkValues, sparkColor }) {
  return (
    <div className="pulse-kpi">
      <div className="pulse-kpi-top">
        <p className="pulse-kpi-label">{label}</p>
        {change != null && <ChangeTag pct={change} />}
      </div>
      <p className="pulse-kpi-value">{value ?? '—'}</p>
      {sparkValues && (
        <div className="pulse-kpi-spark-wrap">
          <Sparkline values={sparkValues} color={sparkColor ?? '#f47421'} />
        </div>
      )}
    </div>
  );
}

function Card({ title, children, onExport, className = '' }) {
  return (
    <div className={`pulse-card ${className}`}>
      <div className="pulse-card-header">
        <h2 className="pulse-card-title">{title}</h2>
        {onExport && (
          <button className="pulse-export-btn" onClick={onExport}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M5.5 1v6M3.5 5l2 2 2-2M1 8.5v.5a1 1 0 001 1h7a1 1 0 001-1v-.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            CSV
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function InsightBanner({ insights }) {
  const [open, setOpen] = useState(true);
  if (!insights?.length || !open) return null;
  return (
    <div className="pulse-insights">
      <div className="pulse-insights-head">
        <span className="pulse-insights-label">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="6" cy="6" r="5.25" stroke="#f47421" strokeWidth="1.3" />
            <path d="M6 5v4M6 3.5v.5" stroke="#f47421" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Insights
        </span>
        <button className="pulse-insights-close" onClick={() => setOpen(false)}>✕</button>
      </div>
      <ul className="pulse-insights-list">
        {insights.map((text, i) => <li key={i}>{text}</li>)}
      </ul>
    </div>
  );
}

function generateInsights(overview, engagement, topItems, dietary) {
  const insights = [];
  if (overview?.changeActive != null) {
    const p = overview.changeActive;
    if (p <= -10) insights.push(`Active students dropped ${Math.abs(p)}% compared to the prior period.`);
    else if (p >= 10) insights.push(`Active students are up ${p}% compared to the prior period.`);
  }
  if (overview?.changeMeals != null) {
    const p = overview.changeMeals;
    if (p <= -10) insights.push(`Meal confirmations fell ${Math.abs(p)}% this period. Engagement may be slipping.`);
    else if (p >= 10) insights.push(`Meal confirmations are up ${p}% this period.`);
  }
  if (topItems?.length) insights.push(`"${topItems[0].name}" is your most selected item with ${topItems[0].count} confirmations.`);
  if (dietary?.length) insights.push(`${dietary[0].pct}% of students have ${dietary[0].name.toLowerCase()} restrictions.`);
  if (engagement?.length >= 7) {
    const recent  = engagement.slice(-3).reduce((s, d) => s + d.meals, 0) / 3;
    const earlier = engagement.slice(0, 3).reduce((s, d) => s + d.meals, 0) / 3;
    if (earlier > 0) {
      const trend = Math.round(((recent - earlier) / earlier) * 100);
      if (trend <= -15) insights.push(`Daily confirmations have trended down ${Math.abs(trend)}% over this period.`);
      else if (trend >= 15) insights.push(`Daily confirmations have trended up ${trend}% over this period.`);
    }
  }
  if (!insights.length) insights.push('Engagement looks steady. No significant changes to flag this period.');
  return insights;
}

const CHART_TOOLTIP = {
  contentStyle: { background: '#fff', border: '1px solid #e8e3dd', borderRadius: 8, fontSize: 12, color: '#1a2b3c', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  labelStyle:   { color: '#1a2b3c', fontWeight: 600 },
};

// ── Invite modal ──────────────────────────────────────────────────────────────

function InviteModal({ defaultUniversity, onClose }) {
  const [email, setEmail] = useState('');
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
    setError(null); setSentTo(null); setSubmitting(true);
    try {
      const result = await sendInvite(email, defaultUniversity);
      let emailSent = false;
      try {
        await emailjs.send(
          'service_0fhib6k',
          'template_g9i3vw6',
          {
            email,
            university: defaultUniversity,
            invite_link: result.link,
          },
          { publicKey: 'urTn8G5d8khZF0NfZ' },
        );
        emailSent = true;
      } catch {}
      setSentTo({ email, emailSent, link: result.link });
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
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@university.edu" required />
            </div>
            <div className="pulse-invite-field pulse-invite-field-sm">
              <label>University</label>
              <input type="text" value={defaultUniversity} readOnly className="pulse-invite-readonly" />
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
              <p className="pulse-invite-newlink-label">✓ Invite sent to <strong>{sentTo.email}</strong></p>
            ) : (
              <>
                <p className="pulse-invite-newlink-label">Email unavailable — share this link manually:</p>
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

// ── Main dashboard ────────────────────────────────────────────────────────────

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

  useEffect(() => { getRatingAggregates().then(setRatingAggs); }, []);

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
      setOverview(ov); setEngagement(eng); setMealSplit(ms);
      setTopItems(ti); setDietary(diet); setNutrition(nutr);
      setSuggestions(suggs); setLoading(false);
    });
  }, [university, days]);

  const insights = useMemo(
    () => (!loading && overview) ? generateInsights(overview, engagement, topItems, dietary) : [],
    [loading, overview, engagement, topItems, dietary]
  );

  const mealsSparkValues  = engagement?.map(d => d.meals);
  const usersSparkValues  = engagement?.map(d => d.users);
  const totalMeals        = mealSplit?.reduce((s, d) => s + d.value, 0) ?? 0;
  const universityLabel   = university.charAt(0).toUpperCase() + university.slice(1);
  const exportData        = { university, days, overview, engagement, mealSplit, topItems, dietary, nutrition };
  const topMax            = topItems?.[0]?.count ?? 1;

  const ratingsSorted = Object.values(ratingAggs).filter(a => a.count >= 1).sort((a, b) => b.avg - a.avg);
  const topRatings    = ratingsSorted.slice(0, 5);
  const bottomRatings = ratingsSorted.slice(-5).reverse();

  return (
    <div className="pulse-dashboard">

      {/* ── Header ── */}
      <header className="pulse-header">
        <div className="pulse-header-inner">
          <div className="pulse-header-brand">
            <img src="/bentopulse.png" alt="Bento Pulse" className="pulse-header-logo" />
            <span className="pulse-university-badge">{universityLabel}</span>
          </div>
          <div className="pulse-header-right">
            <span className="pulse-asof">as of {asOfLabel()}</span>
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
            {!loading && (
              <button className="pulse-export-all-btn" onClick={() => exportAll(exportData)}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M1 9.5v.5a1 1 0 001 1h8a1 1 0 001-1v-.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Export
              </button>
            )}
            {isSuperAdmin && (
              <button className="pulse-invite-btn" onClick={() => setShowInvite(true)}>Invite</button>
            )}
            <button className="pulse-signout-btn" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </header>

      {showInvite && <InviteModal defaultUniversity={university} onClose={() => setShowInvite(false)} />}

      <main className="pulse-main">
        {loading ? (
          <div className="pulse-loading">
            <div className="pulse-spinner" />
            <p>Loading data…</p>
          </div>
        ) : (
          <>
            {/* ── KPI row ── */}
            <div className="pulse-kpi-row">
              <KPICard
                label="Registered Students"
                value={overview?.totalStudents?.toLocaleString()}
              />
              {/* Installed to the home screen. On iOS this is the ceiling on
                  push reach — a browser tab can never receive a notification. */}
              <KPICard
                label="Installed to Home Screen"
                value={overview?.installRate != null
                  ? `${overview.installedStudents} (${overview.installRate}%)`
                  : '—'}
              />
              <KPICard
                label="Active Students"
                value={overview?.activeThisPeriod?.toLocaleString()}
                change={overview?.changeActive}
                sparkValues={usersSparkValues}
                sparkColor="#1a2b3c"
              />
              <KPICard
                label="Meals Confirmed"
                value={overview?.mealsThisPeriod?.toLocaleString()}
                change={overview?.changeMeals}
                sparkValues={mealsSparkValues}
                sparkColor="#f47421"
              />
              <KPICard
                label="Avg Calories / Item"
                value={nutrition ? `${nutrition.calories} kcal` : null}
                change={nutrition?.changeCalories}
              />
            </div>

            {/* ── Insights banner ── */}
            <InsightBanner insights={insights} />

            {/* ── Engagement + Meal split ── */}
            <div className="pulse-row pulse-row--wide-left">
              <Card
                title={`Meal Confirmations — Last ${days} Days`}
                onExport={() => downloadCSV(
                  `pulse-engagement-${university}.csv`,
                  (engagement ?? []).map(r => ({ Date: r.date, 'Meals Confirmed': r.meals, 'Students Active': r.users }))
                )}
              >
                {engagement?.length ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={engagement} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                        <defs>
                          <linearGradient id="gradMeals" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#f47421" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#f47421" stopOpacity={0}    />
                          </linearGradient>
                          <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#1a2b3c" stopOpacity={0.1} />
                            <stop offset="95%" stopColor="#1a2b3c" stopOpacity={0}   />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 0" vertical={false} stroke="#f0ece8" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDate}
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          axisLine={false} tickLine={false}
                          interval={days > 14 ? Math.floor(days / 8) : 0}
                        />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip {...CHART_TOOLTIP} labelFormatter={formatDate} formatter={(v, name) => [v.toLocaleString(), name === 'meals' ? 'Meals confirmed' : 'Students active']} />
                        <Area type="monotone" dataKey="meals" stroke="#f47421" strokeWidth={2} fill="url(#gradMeals)" dot={false} activeDot={{ r: 4, fill: '#f47421' }} />
                        <Area type="monotone" dataKey="users" stroke="#1a2b3c" strokeWidth={1.5} fill="url(#gradUsers)" dot={false} activeDot={{ r: 4, fill: '#1a2b3c' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                    <div className="pulse-legend">
                      <span className="pulse-legend-swatch" style={{ background: '#f47421' }} />Meals confirmed
                      <span className="pulse-legend-swatch" style={{ background: '#1a2b3c', marginLeft: '1rem' }} />Students active
                    </div>
                  </>
                ) : (
                  <p className="pulse-empty">No engagement data for this period.</p>
                )}
              </Card>

              <Card
                title="Meal Type Split"
                onExport={() => downloadCSV(
                  `pulse-meal-split-${university}.csv`,
                  (mealSplit ?? []).map(r => ({ 'Meal Type': r.name, Count: r.value }))
                )}
              >
                {mealSplit?.length ? (
                  <div className="pulse-donut-wrap">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={mealSplit} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={52} outerRadius={78} paddingAngle={2}>
                          {mealSplit.map((_, i) => <Cell key={i} fill={MEAL_COLORS[i % MEAL_COLORS.length]} />)}
                        </Pie>
                        <Tooltip {...CHART_TOOLTIP} />
                        <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pulse-donut-center">
                      <p className="pulse-donut-total">{totalMeals.toLocaleString()}</p>
                      <p className="pulse-donut-sub">meals</p>
                    </div>
                  </div>
                ) : (
                  <p className="pulse-empty">No meal data for this period.</p>
                )}
              </Card>
            </div>

            {/* ── Top items + Dietary ── */}
            <div className="pulse-row pulse-row--wide-left">
              <Card
                title={`Top Items — Last ${days} Days`}
                onExport={() => downloadCSV(
                  `pulse-top-items-${university}.csv`,
                  (topItems ?? []).map(r => ({ Item: r.name, 'Times Selected': r.count }))
                )}
              >
                {topItems?.length ? (
                  <div className="pulse-items-table">
                    <div className="pulse-items-head">
                      <span>#</span><span>Item</span><span>Selections</span><span>Count</span>
                    </div>
                    {topItems.map((item, i) => (
                      <div key={item.name} className="pulse-item-row">
                        <span className="pulse-item-rank">{i + 1}</span>
                        <span className="pulse-item-name">{item.name}</span>
                        <div className="pulse-item-track">
                          <div className="pulse-item-bar" style={{ width: `${(item.count / topMax) * 100}%` }} />
                        </div>
                        <span className="pulse-item-count">{item.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pulse-empty">No item data for this period.</p>
                )}
              </Card>

              <Card
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
                        <div className="pulse-dietary-label-row">
                          <span className="pulse-dietary-name">{d.name}</span>
                          <span className="pulse-dietary-pct">{d.pct}%</span>
                        </div>
                        <div className="pulse-dietary-track">
                          <div className="pulse-dietary-bar" style={{ width: `${d.pct}%`, background: dietaryColor(d.name) }} />
                        </div>
                        <span className="pulse-dietary-count">{d.count?.toLocaleString()} students</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pulse-empty">No dietary data yet.</p>
                )}
              </Card>
            </div>

            {/* ── Nutrition strip ── */}
            {nutrition && (
              <Card
                title={`Nutrition Averages — Last ${days} Days`}
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
                <div className="pulse-nutrition-strip">
                  {[
                    { label: 'Calories', value: `${nutrition.calories} kcal`, change: nutrition.changeCalories },
                    { label: 'Protein',  value: `${nutrition.protein}g`,      change: nutrition.changeProtein  },
                    { label: 'Carbs',    value: `${nutrition.carbs}g`,        change: nutrition.changeCarbs    },
                    { label: 'Fat',      value: `${nutrition.fat}g`,          change: nutrition.changeFat      },
                  ].map(n => (
                    <div key={n.label} className="pulse-nutrition-item">
                      <p className="pulse-nutrition-label">{n.label}</p>
                      <p className="pulse-nutrition-value">{n.value}</p>
                      <ChangeTag pct={n.change} />
                      <p className="pulse-nutrition-sub">avg per item</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ── Suggestions + Ratings ── */}
            <div className="pulse-row">
              <Card title={`Student Suggestions — Last ${days} Days`}>
                {suggestions.length === 0 ? (
                  <p className="pulse-empty">No suggestions yet.</p>
                ) : (
                  <div className="pulse-suggestions-list">
                    {suggestions.map(s => (
                      <div key={s.id} className="pulse-suggestion-row">
                        <p className="pulse-suggestion-text">{s.content}</p>
                        <div className="pulse-suggestion-meta">
                          <span className="pulse-suggestion-emph">+{s.emphasize_count} agree</span>
                          {s.flag_count > 0 && <span className="pulse-suggestion-flag">{s.flag_count} flags</span>}
                          <span className="pulse-suggestion-time">
                            {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Food Ratings">
                {Object.keys(ratingAggs).length === 0 ? (
                  <p className="pulse-empty">No ratings yet.</p>
                ) : (
                  <div className="pulse-ratings-panels">
                    <div>
                      <p className="pulse-ratings-label">Highest rated</p>
                      {topRatings.map(a => (
                        <div key={a.name} className="pulse-rating-row">
                          <span className="pulse-rating-name">{a.name}</span>
                          <span className="pulse-rating-score">{a.avg.toFixed(1)} ★ <span className="pulse-rating-count">({a.count})</span></span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <p className="pulse-ratings-label">Lowest rated</p>
                      {bottomRatings.map(a => (
                        <div key={a.name} className="pulse-rating-row">
                          <span className="pulse-rating-name">{a.name}</span>
                          <span className="pulse-rating-score">{a.avg.toFixed(1)} ★ <span className="pulse-rating-count">({a.count})</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
