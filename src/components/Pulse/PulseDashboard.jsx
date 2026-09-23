import { useState, useEffect, useMemo, useRef, useId } from 'react';
import emailjs from '@emailjs/browser';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  getPulseOverview, getMealAnalytics, getDietaryBreakdown,
  getPulseRatings, sendInvite, getInvites, getAdminSuggestions,
} from '../../lib/pulseDb';
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
const IS_DEMO = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('mock') === 'true';

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

function exportAll({ university, days, overview, engagement, mealSplit, topItems, dietary, waste, dayOfWeek, halls }) {
  const date  = asOfLabel();
  const lines = [];
  lines.push(`Bento Pulse Export — ${university} — as of ${date} — Last ${days} days`, '');
  lines.push('=== AT A GLANCE ===', 'Metric,Value,Change vs Prior Period');
  if (overview) {
    lines.push(`Meals Confirmed,${overview.mealsThisPeriod},${overview.changeMeals != null ? overview.changeMeals + '%' : ''}`);
    lines.push(`Active Students,${overview.activeThisPeriod},${overview.changeActive != null ? overview.changeActive + '%' : ''}`);
    lines.push(`Registered Students,${overview.totalStudents},`);
  }
  if (waste?.eatenPct != null) {
    lines.push(`Plate Eaten,${waste.eatenPct}%,`);
    lines.push(`Servings Left Uneaten,${waste.wastedServings},`);
    lines.push(`Calories Left Uneaten,${waste.wastedCalories},`);
    lines.push(`Plates Measured,${waste.platesMeasured} of ${waste.platesTotal},${waste.responseRate}%`);
  }
  lines.push('');
  if (waste?.items?.length) {
    lines.push('=== PLATE WASTE BY DISH ===', 'Item,Servings Taken,Avg Eaten,Servings Left,Calories Left');
    waste.items.forEach(r => lines.push(`"${r.name}",${r.servings},${Math.round(r.avgEaten * 100)}%,${r.wastedServings},${r.wastedCalories}`));
    lines.push('');
  }
  if (halls?.length) {
    lines.push('=== BY DINING HALL ===', 'Hall,Meals Confirmed,Students,Plate Eaten');
    halls.forEach(r => lines.push(`${r.hall},${r.meals},${r.students},${r.eatenPct != null ? r.eatenPct + '%' : ''}`));
    lines.push('');
  }
  if (dayOfWeek?.length) {
    lines.push('=== BY DAY OF WEEK ===', 'Day,Total Meals,Average per Day');
    dayOfWeek.forEach(r => lines.push(`${r.day},${r.meals},${r.avgMeals}`));
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
    // "vs prior period" spelled out here took most of a narrow tile and pushed
    // the tooltip marker onto a line of its own. The comparison is stated in
    // the tile's own tooltip and in the hover title, so the tag carries the
    // number alone.
    <span
      className={`pulse-kpi-change ${up ? 'up' : 'down'}`}
      title={`${up ? 'Up' : 'Down'} ${Math.abs(pct)}% against the previous period of the same length`}
    >
      {up ? '↑' : '↓'} {Math.abs(pct)}%
    </span>
  );
}

/**
 * The "what does this actually mean" marker next to a metric.
 *
 * Positioned against the viewport rather than its own parent. The KPI row
 * clips its children to get rounded corners on the grid, and a card can sit
 * inside a scrolling column, so a normally positioned popover would be cut in
 * half by whichever ancestor happens to clip first. Fixed coordinates taken at
 * open time avoid every one of those cases, and closing on scroll or resize
 * keeps the popover from drifting away from the marker it belongs to.
 *
 * Opens on hover, on keyboard focus, and on tap, because a dining director
 * reading this on a phone has no hover state.
 */
function InfoTip({ label, text }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const id = useId();

  const show = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(260, window.innerWidth - 24);
    setPos({
      width,
      // Centre on the marker, then pull back inside whichever edge it crosses.
      left: Math.min(Math.max(12, r.left + r.width / 2 - width / 2), window.innerWidth - width - 12),
      top: r.bottom + 8,
    });
  };

  const hide = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    const onKey = e => { if (e.key === 'Escape') hide(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', hide);
    // Capture phase, so scrolling any ancestor closes it, not only the page.
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="pulse-infotip-btn"
        aria-label={`What does ${label} mean?`}
        aria-expanded={pos != null}
        aria-describedby={pos ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => (pos ? hide() : show())}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M6 5.2v3.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="6" cy="3.5" r="0.75" fill="currentColor" />
        </svg>
      </button>
      {pos && (
        <span
          id={id}
          role="tooltip"
          className="pulse-infotip-pop"
          style={{ left: pos.left, top: pos.top, width: pos.width }}
        >
          {text}
        </span>
      )}
    </>
  );
}

function KPICard({ label, tip, value, change, note, sparkValues, sparkColor }) {
  return (
    <div className="pulse-kpi">
      <div className="pulse-kpi-top">
        <p className="pulse-kpi-label">
          {label}
          {tip && <InfoTip label={label} text={tip} />}
        </p>
        {change != null && <ChangeTag pct={change} />}
      </div>
      <p className="pulse-kpi-value">{value ?? '—'}</p>
      {note && <p className="pulse-kpi-note">{note}</p>}
      {sparkValues && (
        <div className="pulse-kpi-spark-wrap">
          <Sparkline values={sparkValues} color={sparkColor ?? '#f47421'} />
        </div>
      )}
    </div>
  );
}

function Card({ title, tip, children, onExport, className = '' }) {
  return (
    <div className={`pulse-card ${className}`}>
      <div className="pulse-card-header">
        <h2 className="pulse-card-title">
          {title}
          {tip && <InfoTip label={title} text={tip} />}
        </h2>
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

function generateInsights(overview, engagement, topItems, dietary, waste, dayOfWeek, halls) {
  const insights = [];

  // Waste leads, because it is the only line here attached to a dollar figure.
  if (waste?.items?.length && waste.platesMeasured >= 10) {
    const worst = waste.items[0];
    insights.push(
      `"${worst.name}" is the most-left dish: students finished ${Math.round(worst.avgEaten * 100)}% ` +
      `of what they took, leaving about ${worst.wastedServings} servings.`
    );
    if (waste.eatenPct != null && waste.eatenPct < 80) {
      insights.push(`Students ate ${waste.eatenPct}% of what they served themselves. Roughly ${waste.wastedServings.toLocaleString()} servings went uneaten.`);
    }
  }

  if (dayOfWeek?.length) {
    const ranked = [...dayOfWeek].sort((a, b) => b.avgMeals - a.avgMeals);
    const [busiest] = ranked;
    const quietest  = ranked[ranked.length - 1];
    if (busiest.avgMeals > 0 && quietest.avgMeals > 0 && busiest.avgMeals >= quietest.avgMeals * 1.5) {
      insights.push(`${busiest.day} runs ${Math.round((busiest.avgMeals / quietest.avgMeals - 1) * 100)}% busier than ${quietest.day} on average.`);
    }
  }

  if (halls?.length >= 2) {
    const withWaste = halls.filter(h => h.eatenPct != null && h.hall !== 'Unattributed');
    if (withWaste.length >= 2) {
      const best  = withWaste.reduce((a, b) => (b.eatenPct > a.eatenPct ? b : a));
      const worst = withWaste.reduce((a, b) => (b.eatenPct < a.eatenPct ? b : a));
      if (best.eatenPct - worst.eatenPct >= 8) {
        insights.push(`Plates are finished more often at ${best.hall} (${best.eatenPct}%) than at ${worst.hall} (${worst.eatenPct}%).`);
      }
    }
  }

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

  // Capped because a banner of nine bullets is a wall of text, and the ones
  // worth reading are the waste and demand lines pushed on first.
  return insights.slice(0, 5);
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
  const [analytics, setAnalytics]     = useState(null);
  const [dietary, setDietary]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [showInvite, setShowInvite]   = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [ratings, setRatings]         = useState(null);

  useEffect(() => { getPulseRatings(university).then(setRatings); }, [university]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getPulseOverview(university, days),
      getMealAnalytics(university, days),
      getDietaryBreakdown(university),
      getAdminSuggestions(university, days),
    ]).then(([ov, an, diet, suggs]) => {
      setOverview(ov); setAnalytics(an); setDietary(diet);
      setSuggestions(suggs); setLoading(false);
    });
  }, [university, days]);

  const { engagement, mealSplit, topItems, waste, dayOfWeek, halls } = analytics ?? {};

  const insights = (!loading && overview)
    ? generateInsights(overview, engagement, topItems, dietary, waste, dayOfWeek, halls)
    : [];

  const mealsSparkValues  = engagement?.map(d => d.meals);
  const usersSparkValues  = engagement?.map(d => d.users);
  const totalMeals        = mealSplit?.reduce((s, d) => s + d.value, 0) ?? 0;
  const universityLabel   = university.charAt(0).toUpperCase() + university.slice(1);
  const exportData        = { university, days, overview, engagement, mealSplit, topItems, dietary, waste, dayOfWeek, halls };
  const topMax            = topItems?.[0]?.count ?? 1;
  const wasteMax          = waste?.items?.[0]?.wastedServings || 1;

  // Share of registered students who confirmed at least one meal this period.
  // A raw active count means nothing without the denominator next to it.
  const participation = overview?.totalStudents > 0
    ? Math.round((overview.activeThisPeriod / overview.totalStudents) * 100)
    : null;

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
            {IS_DEMO && (
              <div className="pulse-demo-banner" role="status">
                <strong>Demo data.</strong> Figures on this screen are generated
                for demonstration and are not real students.
              </div>
            )}

            {/* ── KPI row ──
                Ordered for a dining director, not for us: what was served, who
                turned up, how much of it got eaten, and what that leaves in the
                bin. Home-screen installs and the registered head count used to
                sit here and then sat underneath in smaller type, which is the
                same clutter one size down. Installs are a Bento adoption number
                and are gone. The registered count survives only as the
                denominator under Active Students, because a waste figure drawn
                from 14 of 57 students needs that context to be read honestly. */}
            <div className="pulse-kpi-row">
              <KPICard
                label="Meals Confirmed"
                tip="Plates students confirmed in this window. One confirmation per student per meal."
                value={overview?.mealsThisPeriod?.toLocaleString()}
                change={overview?.changeMeals}
                sparkValues={mealsSparkValues}
                sparkColor="#f47421"
              />
              <KPICard
                label="Active Students"
                tip="Students who confirmed at least one meal in this window. The share shown below is out of every student registered at your university."
                value={overview?.activeThisPeriod?.toLocaleString()}
                note={participation != null
                  ? `${participation}% of ${overview.totalStudents.toLocaleString()} registered`
                  : null}
                change={overview?.changeActive}
                sparkValues={usersSparkValues}
                sparkColor="#1a2b3c"
              />
              <KPICard
                label="Plate Eaten"
                tip="Share of what students served themselves and then finished. Weighted by servings, so a half-eaten double portion counts twice as heavily as a half-eaten single."
                value={waste?.eatenPct != null ? `${waste.eatenPct}%` : '—'}
                note={waste?.platesMeasured
                  ? `${waste.platesMeasured.toLocaleString()} plates measured`
                  : 'no consumption data yet'}
              />
              <KPICard
                label="Servings Left"
                tip="Food students took and then left uneaten, counted in servings. One serving is one standard portion as published on your menu. 10 servings left means the equivalent of 10 full portions went in the bin."
                value={waste?.wastedServings != null ? waste.wastedServings.toLocaleString() : '—'}
                note={waste?.wastedCalories ? `${waste.wastedCalories.toLocaleString()} kcal` : null}
              />
            </div>


            {/* ── Insights banner ── */}
            <InsightBanner insights={insights} />

            {/* ── Engagement + Meal split ── */}
            <div className="pulse-row pulse-row--wide-left">
              <Card
                title={`Meal Confirmations — Last ${days} Days`}
                tip="Plates confirmed each day, with the number of students behind them. A gap means nobody confirmed a meal on that date."
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
                tip="How confirmed plates divide across breakfast, lunch and dinner."
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
                tip="Dishes students put on a plate most often, counted in servings taken. Taking two scoops counts as two."
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
                tip="Share of students with each restriction set in their Bento profile. A student with two restrictions appears under both."
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

            {/* ── Plate waste ──
                The reason Pulse exists. Students report how much of each dish
                they actually finished; this is that, per dish, ranked by
                servings left rather than by percentage, so the list opens with
                the things worth changing on Monday. */}
            <Card
              title={`Plate Waste — Last ${days} Days`}
                tip="Per dish, how much students finished and how much they left behind. Ranked by servings left rather than by percentage, so a dish wasted across hundreds of servings outranks one wasted across four."
              onExport={() => downloadCSV(
                `pulse-waste-${university}.csv`,
                (waste?.items ?? []).map(r => ({
                  Item: r.name,
                  'Servings Taken': r.servings,
                  'Avg Eaten': `${Math.round(r.avgEaten * 100)}%`,
                  'Servings Left': r.wastedServings,
                  'Calories Left': r.wastedCalories,
                }))
              )}
            >
              {waste?.items?.length ? (
                <>
                  <p className="pulse-card-sub">
                    Based on {waste.platesMeasured.toLocaleString()} of {waste.platesTotal.toLocaleString()} confirmed
                    plates ({waste.responseRate}%) where students reported how much they finished. Dishes with no
                    report are excluded rather than counted as finished.
                  </p>
                  <div className="pulse-items-head pulse-waste-head">
                    <span>#</span>
                    <span>Item</span>
                    <span>
                      Eaten
                      <InfoTip
                        label="Eaten"
                        text="Average share of the dish students finished after taking it. 41% means students left nearly six tenths of every portion served."
                      />
                    </span>
                    <span>
                      Left
                      <InfoTip
                        label="Left"
                        text="Servings taken and then left uneaten. Counted in standard portions, so 40.1 means the equivalent of roughly 40 full portions went in the bin."
                      />
                    </span>
                  </div>
                  {waste.items.map((item, i) => (
                    <div key={item.name} className="pulse-item-row pulse-waste-row">
                      <span className="pulse-item-rank">{i + 1}</span>
                      <span className="pulse-item-name">
                        {item.name}
                        <span className="pulse-waste-takes">{item.servings} served</span>
                      </span>
                      <div className="pulse-waste-track" title={`${Math.round(item.avgEaten * 100)}% eaten`}>
                        <div
                          className="pulse-waste-bar"
                          style={{ width: `${Math.round(item.avgEaten * 100)}%` }}
                        />
                        <span className="pulse-waste-pct">{Math.round(item.avgEaten * 100)}%</span>
                      </div>
                      <span
                        className={`pulse-waste-left${item.wastedServings >= wasteMax * 0.6 ? ' hot' : ''}`}
                      >
                        {item.wastedServings}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <p className="pulse-empty">
                  No consumption reports yet. Students are asked how much they finished
                  after confirming a meal; this fills in as they answer.
                </p>
              )}
            </Card>

            {/* ── Day of week + Dining halls ── */}
            <div className="pulse-row pulse-row--wide-left">
              <Card
                title="Demand by Day of Week"
                tip="Average plates confirmed on each weekday, divided by how many of that weekday fall inside this window. Use for staffing and production planning."
                onExport={() => downloadCSV(
                  `pulse-day-of-week-${university}.csv`,
                  (dayOfWeek ?? []).map(r => ({ Day: r.day, 'Total Meals': r.meals, 'Average per Day': r.avgMeals }))
                )}
              >
                {dayOfWeek?.some(d => d.meals > 0) ? (
                  <>
                    <p className="pulse-card-sub">
                      Averaged across every occurrence of each weekday in this window, so a
                      month with five Tuesdays does not read as a Tuesday spike.
                    </p>
                    <ResponsiveContainer width="100%" height={190}>
                      <BarChart data={dayOfWeek} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                        <CartesianGrid strokeDasharray="3 0" vertical={false} stroke="#f0ece8" />
                        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <Tooltip
                          {...CHART_TOOLTIP}
                          cursor={{ fill: 'rgba(244,116,33,0.06)' }}
                          formatter={(v) => [v, 'Avg meals confirmed']}
                        />
                        <Bar dataKey="avgMeals" fill="#f47421" radius={[3, 3, 0, 0]} maxBarSize={38} />
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                ) : (
                  <p className="pulse-empty">No meal data for this period.</p>
                )}
              </Card>

              <Card
                title="By Dining Hall"
                tip="Where confirmed plates were built. Plates confirmed before hall tracking was added show as unattributed."
                onExport={() => downloadCSV(
                  `pulse-halls-${university}.csv`,
                  (halls ?? []).map(r => ({
                    Hall: r.hall,
                    'Meals Confirmed': r.meals,
                    Students: r.students,
                    'Plate Eaten': r.eatenPct != null ? `${r.eatenPct}%` : '',
                  }))
                )}
              >
                {halls?.length ? (
                  <div className="pulse-hall-list">
                    {halls.map(h => (
                      <div key={h.hall} className="pulse-hall-row">
                        <div className="pulse-hall-main">
                          <span className="pulse-hall-name">{h.hall}</span>
                          <span className="pulse-hall-meals">{h.meals.toLocaleString()} meals</span>
                        </div>
                        <div className="pulse-hall-stats">
                          <span>{h.students.toLocaleString()} students</span>
                          <span className="pulse-hall-eaten">
                            {h.eatenPct != null ? `${h.eatenPct}% eaten` : 'no waste data'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {halls.some(h => h.hall === 'Unattributed') && (
                      <p className="pulse-card-sub pulse-hall-note">
                        Plates confirmed before hall tracking was added are listed as unattributed.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="pulse-empty">No hall data for this period.</p>
                )}
              </Card>
            </div>

            {/* ── Suggestions + Ratings ── */}
            <div className="pulse-row">
              <Card title={`Student Suggestions — Last ${days} Days`}
                tip="Written requests from students, ranked by how many others agreed with them.">
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

              {/* Ratings are gated on a minimum sample. A dish rated once is
                  not the best dish on campus, and ranking it as though it were
                  invites a menu decision made on one student's Tuesday. */}
              <Card title="Food Ratings"
                tip="Average star rating per dish. A dish needs 5 ratings before ranking, so one student cannot decide the best or worst dish on campus.">
                {!ratings?.top?.length ? (
                  <p className="pulse-empty">
                    No dish has reached {ratings?.minCount ?? 5} ratings yet.
                    {ratings?.withheld > 0 && ` ${ratings.withheld} dishes have some ratings but not enough to rank.`}
                  </p>
                ) : (
                  <>
                    <div className="pulse-ratings-panels">
                      <div>
                        <p className="pulse-ratings-label">Highest rated</p>
                        {ratings.top.map(a => (
                          <div key={a.name} className="pulse-rating-row">
                            <span className="pulse-rating-name">{a.name}</span>
                            <span className="pulse-rating-score">{a.avg.toFixed(1)} ★ <span className="pulse-rating-count">({a.count})</span></span>
                          </div>
                        ))}
                      </div>
                      <div hidden={!ratings.bottom.length}>
                        <p className="pulse-ratings-label">Lowest rated</p>
                        {ratings.bottom.map(a => (
                          <div key={a.name} className="pulse-rating-row">
                            <span className="pulse-rating-name">{a.name}</span>
                            <span className="pulse-rating-score">{a.avg.toFixed(1)} ★ <span className="pulse-rating-count">({a.count})</span></span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="pulse-card-sub pulse-ratings-note">
                      Dishes with fewer than {ratings.minCount} ratings are not ranked
                      {ratings.withheld > 0 && ` (${ratings.withheld} excluded)`}.
                    </p>
                  </>
                )}
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
