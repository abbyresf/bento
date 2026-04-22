import './LandingHome.css';

const FEATURES = [
  {
    icon: '🎯',
    title: 'Goal Tracking',
    desc: 'Set your daily calorie and macro targets. Bento builds your plate around them automatically.',
  },
  {
    icon: '✨',
    title: 'Smart Recommendations',
    desc: 'The more you use Bento, the better it gets. Favorites and dietary preferences shape every suggestion.',
  },
  {
    icon: '🚫',
    title: 'Allergy & Diet Filters',
    desc: 'Vegan, gluten-free, nut-free, and more. Filter once during setup and never worry again.',
  },
  {
    icon: '📱',
    title: 'Mobile-First',
    desc: 'Designed to live on your phone. Check your plan on the way to the dining hall in seconds.',
  },
];

export default function LandingHome({ onGetStarted }) {
  return (
    <div className="landing-home">

      {/* ── Hero ── */}
      <section className="lh-hero">
        <div className="lh-hero-inner">
          <img src="/logo-cropped.png" alt="Bento" className="lh-hero-logo" />
          <h1 className="lh-hero-headline">
             
             Eat Well. Every Meal.
          </h1>
          <p className="lh-hero-sub">
            Bento turns your dining hall menu into a personalized meal plan built around your
            goals, your allergies, and your taste. No guesswork. No spreadsheets.
          </p>
          <button className="lh-cta-btn" onClick={onGetStarted}>
            Get Started - it's free
          </button>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="lh-stats">
        <div className="lh-stats-inner">
          <h2 className="lh-stats-heading">Did you know?</h2>
          <div className="lh-stats-row">
            <div className="lh-stat">
              <span className="lh-stat-number">56%</span>
              <span className="lh-stat-label">of college students try to track their nutritional intake</span>
            </div>
            <div className="lh-stat-divider" />
            <div className="lh-stat">
              <span className="lh-stat-number">81%</span>
              <span className="lh-stat-label">of students find it stressful to track their meals</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Story ── */}
      <section className="lh-story">
        <div className="lh-story-inner">
          <h2 className="lh-section-heading">Built by students, for students</h2>
          <p className="lh-story-text">
            Every college student deserves to eat well. Not just when it's convenient, not just
            when there's time to research every option at the dining hall, but every single day.
            Nutrition and fitness goals should not be a privilege reserved for people with personal
            chefs or unlimited time to count macros.
          </p>
          <p className="lh-story-text">
            Bento was born out of that belief. After years on a college meal plan, watching students
            struggle to make healthy choices not because they didn't care, but because the tools to
            do it simply didn't exist, it became clear: this had to change.
          </p>
          <p className="lh-story-text">
            Bento is the only app that works directly with your dining hall menu to build a plate
            that fits your goals in seconds. No guessing. No stress. Just food that works for you.
          </p>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="lh-features">
        <div className="lh-features-inner">
          <h2 className="lh-section-heading lh-section-heading--centered">Everything you need. Nothing you don't.</h2>
          <div className="lh-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="lh-feature-card">
                <span className="lh-feature-icon">{f.icon}</span>
                <h3 className="lh-feature-title">{f.title}</h3>
                <p className="lh-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="lh-bottom-cta">
        <h2>Ready to eat smarter?</h2>
        <p>Takes two minutes to set up. Works from day one.</p>
        <button className="lh-cta-btn" onClick={onGetStarted}>
          Get Started - it's free
        </button>
      </section>

    </div>
  );
}
