import './LandingUniversities.css';

const VALUE_PROPS = [
  {
    num: '01',
    title: 'Know what students are eating.',
    desc: 'Meal confirmations, item popularity, dietary restriction coverage, and nutrition averages — updated automatically as students use the app. No surveys. No manual data collection.',
  },
  {
    num: '02',
    title: 'Catch engagement dips early.',
    desc: 'Week-over-week comparisons surface declining participation, low breakfast uptake, and menu coverage gaps before they appear in end-of-semester feedback.',
  },
  {
    num: '03',
    title: 'Understand your dietary population.',
    desc: 'See exactly what percentage of your students require vegetarian, kosher, halal, gluten-free, or other accommodations. Build menus around what your students actually need.',
  },
  {
    num: '04',
    title: 'Export everything.',
    desc: 'Every section of the dashboard exports to CSV with one click. Bring the data into your own reporting tools, share it with stakeholders, or drop it into a board presentation.',
  },
];

const HOW_STEPS = [
  {
    num: '1',
    title: 'Students use Bento.',
    desc: 'Students get personalized meal plans built around today\'s menu, their dietary needs, and their nutrition goals. Every meal confirmation is a real data point.',
  },
  {
    num: '2',
    title: 'Your dashboard updates automatically.',
    desc: 'Bento Pulse aggregates student activity into a clean administrative view. No manual uploads. No exports from your dining system. The data is always current.',
  },
  {
    num: '3',
    title: 'Make decisions with real data.',
    desc: 'Identify your most popular items, track nutrition trends over time, and surface dietary accommodation gaps. All from a single dashboard scoped to your campus.',
  },
];

function DashboardMockup() {
  return (
    <div className="lu-mockup">
      <div className="lu-mockup-header">
        <div className="lu-mockup-header-left">
          <div className="lu-mockup-logo-pill" />
        </div>
        <div className="lu-mockup-header-right">
          <div className="lu-mockup-pill lu-mockup-pill--tab active">30 days</div>
          <div className="lu-mockup-pill lu-mockup-pill--tab">7 days</div>
          <div className="lu-mockup-pill lu-mockup-pill--tab">90 days</div>
          <div className="lu-mockup-pill">Brandeis</div>
          <div className="lu-mockup-pill">Export All</div>
        </div>
      </div>

      <div className="lu-mockup-body">
        <div className="lu-mockup-kpi-row">
          {[
            { label: 'Registered Students', value: '287', sub: 'total accounts' },
            { label: 'Active Students', value: '156', change: '+12%', up: true },
            { label: 'Meals Confirmed', value: '342', change: '+15%', up: true },
            { label: 'Avg Calories', value: '412 kcal', change: '+4%', up: true },
          ].map((k) => (
            <div key={k.label} className="lu-mockup-kpi">
              <span className="lu-mockup-kpi-label">{k.label}</span>
              <span className="lu-mockup-kpi-value">{k.value}</span>
              {k.change && (
                <span className={`lu-mockup-kpi-change ${k.up ? 'up' : 'down'}`}>{k.up ? '↑' : '↓'} {k.change} vs prior period</span>
              )}
              {k.sub && <span className="lu-mockup-kpi-sub">{k.sub}</span>}
            </div>
          ))}
        </div>

        <div className="lu-mockup-two-col">
          <div className="lu-mockup-card">
            <div className="lu-mockup-card-title">Daily Engagement — Last 30 Days</div>
            <div className="lu-mockup-chart">
              {[9,12,8,14,16,11,6,13,15,9,14,17,12,7,15,18,13,10,16,14,8,12,15,11,13,17,14,9,16,13].map((h, i) => (
                <div key={i} className="lu-mockup-bar-wrap">
                  <div
                    className="lu-mockup-bar"
                    style={{ height: `${Math.round((h / 18) * 100)}%`, background: i % 7 === 0 || i % 7 === 6 ? '#cbd5e1' : '#f47421' }}
                  />
                </div>
              ))}
            </div>
            <div className="lu-mockup-legend">
              <span className="lu-mockup-legend-dot" style={{ background: '#f47421' }} />Meals confirmed
              <span className="lu-mockup-legend-dot" style={{ background: '#243b55', marginLeft: '0.75rem' }} />Students active
            </div>
          </div>

          <div className="lu-mockup-card">
            <div className="lu-mockup-card-title">Meal Type Split</div>
            <div className="lu-mockup-donut-wrap">
              <svg viewBox="0 0 120 120" className="lu-mockup-donut-svg">
                <circle cx="60" cy="60" r="45" fill="none" stroke="#e2e8f0" strokeWidth="18" />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#f47421" strokeWidth="18"
                  strokeDasharray="127 155" strokeDashoffset="0" strokeLinecap="butt" />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#243b55" strokeWidth="18"
                  strokeDasharray="85 197" strokeDashoffset="-127" strokeLinecap="butt" />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#64a8d1" strokeWidth="18"
                  strokeDasharray="70 212" strokeDashoffset="-212" strokeLinecap="butt" />
              </svg>
              <div className="lu-mockup-donut-center">
                <span className="lu-mockup-donut-total">342</span>
                <span className="lu-mockup-donut-sub">meals</span>
              </div>
            </div>
            <div className="lu-mockup-donut-legend">
              {[
                { color: '#f47421', label: 'Lunch', val: '158' },
                { color: '#243b55', label: 'Breakfast', val: '92' },
                { color: '#64a8d1', label: 'Dinner', val: '92' },
              ].map(d => (
                <div key={d.label} className="lu-mockup-donut-legend-row">
                  <span className="lu-mockup-legend-dot" style={{ background: d.color }} />
                  <span className="lu-mockup-donut-legend-label">{d.label}</span>
                  <span className="lu-mockup-donut-legend-val">{d.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lu-mockup-card">
          <div className="lu-mockup-card-title">Top Items — Last 30 Days</div>
          <div className="lu-mockup-items">
            {[
              { name: 'Grilled Chicken Breast', count: 54, pct: 100 },
              { name: 'Greek Yogurt Parfait', count: 51, pct: 94 },
              { name: 'Pasta Primavera', count: 49, pct: 91 },
              { name: 'Roasted Vegetables', count: 47, pct: 87 },
              { name: 'Caesar Salad', count: 38, pct: 70 },
            ].map((item) => (
              <div key={item.name} className="lu-mockup-item-row">
                <span className="lu-mockup-item-name">{item.name}</span>
                <div className="lu-mockup-item-bar-wrap">
                  <div className="lu-mockup-item-bar" style={{ width: `${item.pct}%` }} />
                </div>
                <span className="lu-mockup-item-count">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingUniversities({ onContact }) {
  return (
    <div className="landing-universities">

      {/* ── Hero ── */}
      <section className="lu-hero">
        <div className="lu-hero-inner">
          <div className="lu-hero-eyebrow">Bento Pulse</div>
          <h1 className="lu-hero-headline">Real-time dining intelligence for your campus.</h1>
          <p className="lu-hero-sub">
            Bento Pulse gives dining administrators a live view of student engagement, nutrition trends, and meal preferences. Updated automatically as students use the app. No surveys. No manual reporting. No integration work.
          </p>
          <button className="lu-hero-cta" onClick={onContact}>Request a demo</button>
        </div>
      </section>

      {/* ── Dashboard mockup ── */}
      <section className="lu-mockup-section">
        <div className="lu-mockup-section-inner">
          <p className="lu-mockup-caption">Bento Pulse dashboard — live data, scoped to your institution</p>
          <DashboardMockup />
        </div>
      </section>

      {/* ── Value props ── */}
      <section className="lu-value">
        <div className="lu-value-inner">
          <h2 className="lu-section-heading lu-section-heading--light lu-section-heading--centered">
            What your team gets.
          </h2>
          <div className="lu-value-grid">
            {VALUE_PROPS.map((v) => (
              <div key={v.num} className="lu-value-card">
                <span className="lu-value-num">{v.num}</span>
                <h3 className="lu-value-title">{v.title}</h3>
                <p className="lu-value-desc">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="lu-how">
        <div className="lu-how-inner">
          <h2 className="lu-section-heading lu-section-heading--centered">How it works.</h2>
          <div className="lu-steps">
            {HOW_STEPS.map((s) => (
              <div key={s.num} className="lu-step">
                <div className="lu-step-num">{s.num}</div>
                <div className="lu-step-content">
                  <h3 className="lu-step-title">{s.title}</h3>
                  <p className="lu-step-desc">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Enterprise reassurances ── */}
      <section className="lu-trust">
        <div className="lu-trust-inner">
          {[
            {
              icon: (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 2L4 5.5v5c0 4.1 2.9 7.9 7 9 4.1-1.1 7-4.9 7-9v-5L11 2z" stroke="#f47421" strokeWidth="1.6" strokeLinejoin="round"/></svg>
              ),
              title: 'Data stays on your campus.',
              desc: 'Bento Pulse is scoped strictly to your institution. No data is shared across universities. Aggregate views are anonymized.',
            },
            {
              icon: (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="8.5" stroke="#f47421" strokeWidth="1.6"/><path d="M11 7v4.5l3 1.5" stroke="#f47421" strokeWidth="1.6" strokeLinecap="round"/></svg>
              ),
              title: 'Up and running in days, not months.',
              desc: 'No IT project. No API integration. No data migration. Bento reads your existing dining hall menus. You get access to the dashboard and your data starts flowing.',
            },
            {
              icon: (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="5" width="16" height="13" rx="2" stroke="#f47421" strokeWidth="1.6"/><path d="M3 9h16" stroke="#f47421" strokeWidth="1.6"/><path d="M7 13h2M7 16h4" stroke="#f47421" strokeWidth="1.6" strokeLinecap="round"/></svg>
              ),
              title: 'Built for administrative teams.',
              desc: 'The dashboard is designed for dining services staff, not data scientists. Clean charts, plain-English insights, and CSV export for any stakeholder report.',
            },
          ].map((item) => (
            <div key={item.title} className="lu-trust-card">
              <div className="lu-trust-icon">{item.icon}</div>
              <h3 className="lu-trust-title">{item.title}</h3>
              <p className="lu-trust-desc">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lu-cta">
        <div className="lu-cta-inner">
          <h2 className="lu-cta-heading">Bring Bento to your campus.</h2>
          <p className="lu-cta-sub">
            We work directly with dining services teams to get Bento set up for your students. No procurement paperwork required to get started.
          </p>
          <button className="lu-hero-cta" onClick={onContact}>Get in touch</button>
        </div>
      </section>

    </div>
  );
}
