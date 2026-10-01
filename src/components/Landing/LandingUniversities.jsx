import { useState } from 'react';
import emailjs from '@emailjs/browser';
import PulseCarousel from './PulseCarousel';
import './LandingUniversities.css';

// ── Static chart data ─────────────────────────────────────────────────────────

const ENGAGEMENT_DATA = [520,710,490,840,920,660,310,780,880,540,810,970,720,390,860,1010,750,580,930,820,440,700,870,640,760,990,810,510,940,750];

const f = v => v.toFixed(1);

function bezierPath(data, W, H, pL, pR, pT, pB) {
  const n = data.length;
  const max = Math.max(...data);
  const plotW = W - pL - pR, plotH = H - pT - pB;
  const xs = data.map((_, i) => pL + (i / (n - 1)) * plotW);
  const ys = data.map(d => pT + (1 - d / max) * plotH);
  let p = `M ${f(xs[0])} ${f(ys[0])}`;
  for (let i = 1; i < n; i++) {
    const cx = f((xs[i] + xs[i - 1]) / 2);
    p += ` C ${cx} ${f(ys[i - 1])}, ${cx} ${f(ys[i])}, ${f(xs[i])} ${f(ys[i])}`;
  }
  return { line: p, xs, ys };
}

const CHART = (() => {
  const W = 500, H = 130, pL = 2, pR = 2, pT = 12, pB = 18;
  const { line, xs, ys } = bezierPath(ENGAGEMENT_DATA, W, H, pL, pR, pT, pB);
  const n = ENGAGEMENT_DATA.length;
  const plotH = H - pT - pB;
  const area = line + ` L ${f(xs[n - 1])} ${f(pT + plotH)} L ${f(xs[0])} ${f(pT + plotH)} Z`;
  const weekends = ENGAGEMENT_DATA.map((_, i) => {
    if (i % 7 !== 5 && i % 7 !== 6) return null;
    const x0 = i > 0 ? (xs[i] + xs[i - 1]) / 2 : xs[i];
    const x1 = i < n - 1 ? (xs[i] + xs[i + 1]) / 2 : xs[i];
    return { x: f(x0), w: f(x1 - x0), key: i };
  }).filter(Boolean);
  const peak = { x: f(xs[28]), y: f(ys[28]) };
  return { line, area, weekends, peak, W, H, pT, plotH };
})();

const SPARK_DATA = [
  [13100, 13400, 13700, 13900, 14100, 14200, 14287],
  [7200, 7800, 8400, 8900, 9200, 9600, 9841],
  [14000, 16000, 17500, 19000, 20500, 21200, 22156],
  [395, 400, 405, 408, 412, 415, 418],
];
const SPARK_COLORS = ['#94a3b8', '#fd8f2a', '#fd8f2a', '#77be3d'];

const SPARKS = SPARK_DATA.map((data, idx) => {
  const W = 80, H = 20, pad = 2;
  const { line, xs, ys } = bezierPath(data, W, H, pad, pad, pad, pad);
  const n = data.length;
  const plotH = H - 2 * pad;
  const area = line + ` L ${f(xs[n - 1])} ${f(pad + plotH)} L ${f(xs[0])} ${f(pad + plotH)} Z`;
  return { line, area, lx: f(xs[n - 1]), ly: f(ys[n - 1]), color: SPARK_COLORS[idx], id: `lpu-sg${idx}` };
});

// ── Sub-components ────────────────────────────────────────────────────────────

function Sparkline({ idx }) {
  const s = SPARKS[idx];
  return (
    <svg className="lpu-kpi-spark" viewBox="0 0 80 20" preserveAspectRatio="none">
      <defs>
        <linearGradient id={s.id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={s.color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={s.color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={s.area} fill={`url(#${s.id})`} />
      <path d={s.line} fill="none" stroke={s.color} strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx={s.lx} cy={s.ly} r="2" fill={s.color} />
    </svg>
  );
}

const KPI_CARDS = [
  { label: 'Registered Students', value: '14,287', chg: null,   chgUp: false },
  { label: 'Active This Period',   value: '9,841',  chg: '+8%',  chgUp: true  },
  { label: 'Meals Confirmed',      value: '22,156', chg: '+11%', chgUp: true  },
  { label: 'Avg Calories / Meal',  value: '418',    chg: '+3%',  chgUp: true  },
];

const DIETARY = [
  { name: 'Vegetarian',  pct: 34, val: '3,346', color: '#fd8f2a', barW: '100%' },
  { name: 'Gluten-free', pct: 18, val: '1,771', color: '#77be3d', barW: '53%'  },
  { name: 'Nut allergy', pct: 15, val: '1,476', color: '#64a8d1', barW: '44%'  },
  { name: 'Vegan',       pct: 12, val: '1,181', color: '#a78bfa', barW: '35%'  },
  { name: 'Kosher',      pct: 8,  val: '787',   color: '#f59e0b', barW: '24%'  },
  { name: 'Halal',       pct: 7,  val: '689',   color: '#ec4899', barW: '21%'  },
];

const TOP_ITEMS = [
  { name: 'Grilled Chicken Breast', count: '1,842', pct: '18.7%', w: '100%' },
  { name: 'Greek Yogurt Parfait',   count: '1,724', pct: '17.5%', w: '94%'  },
  { name: 'Pasta Primavera',        count: '1,651', pct: '16.8%', w: '90%'  },
  { name: 'Roasted Vegetables',     count: '1,587', pct: '16.1%', w: '86%'  },
  { name: 'Caesar Salad',           count: '1,243', pct: '12.6%', w: '67%'  },
];


// ── Main component ────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 14l4-4 3 3 4-5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Back menu decisions with real usage data.',
    desc: 'See which items students choose, how often, and at which meal. When leadership asks why a menu changed, you have the numbers to show them.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 6v4.5l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Catch problems before semester-end surveys do.',
    desc: 'Week-over-week comparisons surface declining participation and menu gaps while there is still time to respond.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2a8 8 0 100 16A8 8 0 0010 2z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 10h6M10 7v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Know your accommodation picture with precision.',
    desc: 'See the exact share of students with vegetarian, kosher, halal, gluten-free, vegan, and allergy needs. Plan menus around what your campus actually requires.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 8h14M7 12h2M7 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Give leadership the report they asked for.',
    desc: 'Every chart and metric exports to CSV in one click. Bring your findings to the next board meeting without spending an afternoon building a deck from scratch.',
  },
];

// No onContact prop: the consultation form lives on this page, and the CTAs
// scroll to it. A prop routing to the generic contact tab was passed in and
// never read, which read as a wired-up path that did not exist.
export default function LandingUniversities() {
  const [consultStatus, setConsultStatus] = useState('idle'); // idle | sending | success | error

  const handleConsultSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const name        = data.get('name') || '';
    const institution = data.get('institution') || '';
    const email       = data.get('email') || '';
    const role        = data.get('role') || '';
    setConsultStatus('sending');
    try {
      await emailjs.send(
        'service_0fhib6k',
        'template_4r7zn6c',
        {
          from_name: `${name}${institution ? ', ' + institution : ''}`,
          reply_to:  email,
          subject:   `Consultation Request${institution ? ': ' + institution : ''}`,
          message:   `Name: ${name}\nInstitution: ${institution}\nRole: ${role}\nEmail: ${email}`,
        },
        { publicKey: 'urTn8G5d8khZF0NfZ' },
      );
      setConsultStatus('success');
      e.target.reset();
    } catch {
      setConsultStatus('error');
    }
  };

  const scrollToForm = () => {
    document.getElementById('lpu-consult')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="landing-universities">

      {/* ── Hero ── */}
      <section className="lpu-hero">
        <div className="lpu-hero-inner">
          {/* Set as live text rather than the bentopulse.png wordmark. That file
              draws "Bento" in near-black, so it only ever worked on a white
              hero, and it was the reason this page had a white band in an
              otherwise dark design. Text takes the page's colours and works on
              any ground. */}
          <div className="lpu-wordmark">
            <img src="/BentoNoWords.svg" alt="" className="lpu-wordmark-mark" />
            <span className="lpu-wordmark-text">Bento<span>Pulse</span></span>
          </div>
          <h1 className="lpu-hero-headline">
            Your system knows what's served.{' '}
            <em>Bento knows what students choose.</em>
          </h1>
          <p className="lpu-hero-sub">
            Bento Pulse shows your dining team what participating students confirm at each meal, the dietary needs they report, and the feedback they leave. Recorded as students use the app, organized into one dashboard.
          </p>
          <div className="lpu-hero-actions">
            <button className="lpu-btn-primary" onClick={scrollToForm}>Book a free consultation</button>
            <button className="lpu-btn-ghost" onClick={() => document.getElementById('lpu-mockup-section')?.scrollIntoView({ behavior: 'smooth' })}>See the dashboard</button>
          </div>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <div className="lpu-stats">
        <div className="lpu-stats-inner">
          {[
            { num: '0',      label: 'manual data entry for your dining staff' },
            { num: '5+',     label: 'dietary categories tracked without any configuration' },
            { num: 'No API', label: 'integration with your dining system required' },
            { num: '1 click',label: 'to export any dataset for stakeholder reports' },
          ].map(s => (
            <div key={s.num} className="lpu-stat">
              <span className="lpu-stat-num">{s.num}</span>
              <span className="lpu-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Dashboard carousel ── */}
      <section className="lpu-mockup-section" id="lpu-mockup-section">
        <div className="lpu-section-inner">
          <div className="lpu-mockup-head">
            <p className="lpu-s-label">The dashboard</p>
            <h2 className="lpu-s-head">Built around what your campus needs to know.</h2>
            <p className="lpu-s-sub">
              Every dining program measures something different. We set Pulse up
              around the questions your team is already asking, so the screens you
              open each morning are the ones that answer them. Tell us what matters
              on your campus and we will track it.
            </p>
            <p className="lpu-s-note">
              These are screens from a demo account. The figures are generated, and
              your view would show your own campus.
            </p>
          </div>
          <PulseCarousel />
        </div>
      </section>

      {/* ── Features ── */}
      <section className="lpu-features">
        <div className="lpu-section-inner">
          <p className="lpu-s-label">What your team gets</p>
          <h2 className="lpu-s-head">The data your dining program deserves. Finally within reach.</h2>
          <div className="lpu-features-grid">
            {FEATURES.map(feat => (
              <div key={feat.title} className="lpu-feature">
                <div className="lpu-feature-icon">{feat.icon}</div>
                <div className="lpu-feature-title">{feat.title}</div>
                <div className="lpu-feature-desc">{feat.desc}</div>
              </div>
            ))}
            {/* Suggestions, full-width highlight */}
            <div className="lpu-feature lpu-feature--wide">
              <div className="lpu-feature-icon">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M16 3H4a1 1 0 00-1 1v8a1 1 0 001 1h3l3 3 3-3h3a1 1 0 001-1V4a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M7 8h6M7 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div className="lpu-feature-title">Student suggestions, straight to your dashboard.</div>
              <div className="lpu-feature-desc">Students submit feedback directly from the Bento app. Every suggestion lands in your Pulse dashboard, organized and searchable. No paper forms, no overflowing boxes, no guessing what the campus actually wants. The suggestion box finally works because it lives in the phone everyone already carries.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="lpu-how">
        <div className="lpu-how-inner">
          <p className="lpu-s-label">How it works</p>
          <h2 className="lpu-s-head">Live on your campus in under a week.</h2>
          <div className="lpu-steps">
            {[
              {
                n: '1',
                title: 'Students use Bento to plan their meals.',
                desc: 'Students get a personalized daily meal plan built around your dining hall menu, their dietary needs, and their nutrition goals. Every meal they confirm is a real data point.',
              },
              {
                n: '2',
                title: 'Bento Pulse builds your dashboard from that activity.',
                desc: 'Student meal confirmations roll into your administrative view in real time. No manual upload, no integration with your dining system, and nothing for your IT department to set up.',
              },
              {
                n: '3',
                title: 'Your team acts on data, not instinct.',
                desc: 'Identify your most popular items, track nutrition trends, surface accommodation gaps, review student suggestions, and share findings with administrators. All from one dashboard scoped to your campus only.',
              },
            ].map(s => (
              <div key={s.n} className="lpu-step">
                <div className="lpu-step-num">{s.n}</div>
                <div className="lpu-step-content">
                  <div className="lpu-step-title">{s.title}</div>
                  <div className="lpu-step-desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust ── */}
      <section className="lpu-trust">
        <div className="lpu-trust-inner">
          {[
            {
              title: 'Your data stays within your institution.',
              body: 'Bento Pulse is scoped strictly to your campus. No student information crosses institutional lines, and aggregate views are anonymized by default.',
            },
            {
              title: 'Your IT team is not involved.',
              body: 'Bento reads your existing dining hall menus. There is no API integration, no data migration, and nothing for your technical staff to build or maintain.',
            },
            {
              title: 'Built for dining staff, not data teams.',
              body: 'Your team should not need a data analyst to read a dashboard. Bento Pulse is designed for the people who actually run campus dining operations.',
            },
          ].map(t => (
            <div key={t.title} className="lpu-trust-item">
              <div className="lpu-trust-heading">{t.title}</div>
              <div className="lpu-trust-body">{t.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Consultation ── */}
      <section className="lpu-consult" id="lpu-consult">
        <div className="lpu-consult-inner">
          <h2 className="lpu-consult-heading">Let's talk about your campus.</h2>
          <p className="lpu-consult-sub">
            Pricing is scoped to your institution's size and needs. We work through it together. Start with a free 30-minute call and we will walk through exactly what Bento Pulse would look like for your dining program.
          </p>
          <div className="lpu-consult-meta">
            <span>Custom pricing</span>
            <span className="lpu-cmeta-dot" />
            <span>Sized to your student body</span>
            <span className="lpu-cmeta-dot" />
            <span>Free to explore</span>
          </div>
          {consultStatus === 'success' ? (
            <div className="lpu-consult-success">
              <span className="lpu-consult-check">✓</span>
              <p className="lpu-consult-success-hed">Request received.</p>
              <p className="lpu-consult-success-sub">We'll reach out within one business day to find a time that works.</p>
            </div>
          ) : (
            <>
              <form className="lpu-consult-form" onSubmit={handleConsultSubmit}>
                <div className="lpu-form-row">
                  <div className="lpu-form-field">
                    <label className="lpu-form-label">Your name</label>
                    <input className="lpu-form-input" name="name" type="text" placeholder="Jane Smith" required />
                  </div>
                  <div className="lpu-form-field">
                    <label className="lpu-form-label">Institution</label>
                    <input className="lpu-form-input" name="institution" type="text" placeholder="State University" required />
                  </div>
                </div>
                <div className="lpu-form-row">
                  <div className="lpu-form-field">
                    <label className="lpu-form-label">Work email</label>
                    <input className="lpu-form-input" name="email" type="email" placeholder="jane@university.edu" required />
                  </div>
                  <div className="lpu-form-field">
                    <label className="lpu-form-label">Your role</label>
                    <input className="lpu-form-input" name="role" type="text" placeholder="Director of Dining Services" />
                  </div>
                </div>
                {consultStatus === 'error' && (
                  <p className="lpu-consult-error">Something went wrong. Email us directly at <a href="mailto:bentodining@gmail.com">bentodining@gmail.com</a>.</p>
                )}
                <button className="lpu-form-submit" type="submit" disabled={consultStatus === 'sending'}>
                  {consultStatus === 'sending' ? 'Sending…' : 'Request a free consultation'}
                </button>
              </form>
              <p className="lpu-consult-note">We respond within one business day to find a time that works.</p>
            </>
          )}
        </div>
      </section>

    </div>
  );
}
