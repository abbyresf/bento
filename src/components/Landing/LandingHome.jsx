import './LandingHome.css';

const FEATURES = [
  {
    num: '01',
    title: 'Bento reads today\'s menu.',
    desc: 'Your dining hall updates its menu every day. Bento reads today\'s actual options automatically and builds your plan around them. No logging. No searching. Walk in knowing exactly what to order.',
  },
  {
    num: '02',
    title: 'Your goals, handled automatically.',
    desc: 'Tell Bento your calorie target, your macros, and your goal. Bento builds every meal recommendation around them. Change your goal? Bento adjusts instantly.',
  },
  {
    num: '03',
    title: 'Your restrictions, enforced every time.',
    desc: 'Vegan, gluten-free, nut-free, kosher. Set your restrictions once. Bento filters every option before you see a single recommendation. No reading ingredient labels. No asking dining staff.',
  },
];

const STEPS = [
  {
    num: '1',
    title: 'Tell us about you.',
    desc: 'Your weight, your goals, your dietary needs. Bento figures out your daily calorie and macro targets from there. Two minutes, one time.',
  },
  {
    num: '2',
    title: 'Get your plan.',
    desc: 'Bento reads today\'s dining hall menu and builds your meals around your numbers. Breakfast, lunch, and dinner — ready before you leave your dorm.',
  },
  {
    num: '3',
    title: 'Go eat.',
    desc: 'No staring at the menu board. No second-guessing at the salad bar. Walk in, grab your plate, and know you\'re on track.',
  },
];

export default function LandingHome({ onGetStarted, onGoUniversities }) {
  return (
    <div className="landing-home">

      {/* ── Hero ── */}
      <section className="lh-hero">
        <div className="lh-hero-inner">
          <img src="/logo-cropped.png" alt="Bento" className="lh-hero-logo" />
          <h1 className="lh-hero-headline">Eat well. Every meal.</h1>
          <p className="lh-hero-sub">
            Most students walk in and stare at the menu board for five minutes. Bento tells you exactly what to grab before you even get there, based on your goals, your restrictions, and today's actual menu. No logging. No math. No guessing. Free forever.
          </p>
          <button className="lh-cta-btn" onClick={onGetStarted}>
            Get started. It's free.
          </button>
          <p className="lh-hero-platform">Works on iPhone and Android.</p>
        </div>
      </section>

      {/* ── Problem + Stats ── */}
      <section className="lh-problem">
        <div className="lh-problem-inner">
          <h2 className="lh-section-heading">Here's the thing about eating well in college.</h2>
          <p className="lh-problem-copy">
            You have goals. A protein target. Dietary restrictions. A calorie range to stay within. Your dining hall offers 47 options and zero guidance.
          </p>
          <div className="lh-stats-row">
            <div className="lh-stat">
              <span className="lh-stat-number">56%</span>
              <span className="lh-stat-label">of students track their nutrition</span>
            </div>
            <div className="lh-stat-divider" />
            <div className="lh-stat">
              <span className="lh-stat-number">81%</span>
              <span className="lh-stat-label">say keeping up is stressful</span>
            </div>
          </div>
          <p className="lh-problem-bridge">
            Every other nutrition app makes you log food by hand. None of them know what's on today's menu. Bento does.
          </p>
        </div>
      </section>

      {/* ── Value Props ── */}
      <section className="lh-features">
        <div className="lh-features-inner">
          <h2 className="lh-section-heading lh-section-heading--centered lh-section-heading--light">
            Here's what makes Bento different.
          </h2>
          <div className="lh-features-grid">
            {FEATURES.map((f) => (
              <div key={f.num} className="lh-feature-card">
                <span className="lh-feature-num">{f.num}</span>
                <h3 className="lh-feature-title">{f.title}</h3>
                <p className="lh-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="lh-how">
        <div className="lh-how-inner">
          <h2 className="lh-section-heading lh-section-heading--centered">
            Three steps. Then you're done.
          </h2>
          <div className="lh-steps">
            {STEPS.map((s) => (
              <div key={s.num} className="lh-step">
                <div className="lh-step-num">{s.num}</div>
                <div className="lh-step-content">
                  <h3 className="lh-step-title">{s.title}</h3>
                  <p className="lh-step-desc">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="lh-bottom-cta">
        <h2>Ditch the guesswork. Start eating well.</h2>
        <p>Bento is free. Takes two minutes to set up. Works from day one.</p>
        <button className="lh-cta-btn" onClick={onGetStarted}>
          Get started. It's free.
        </button>
        <p className="lh-hero-platform">Works on iPhone and Android.</p>
      </section>

      {/* ── Universities Banner ── */}
      <section className="lh-uni-banner">
        <div className="lh-uni-banner-inner">
          <p className="lh-uni-banner-text">
            Are you a dining administrator? Bento gives your students a better dining experience and gives your team real data on what students want.
          </p>
          <button className="lh-uni-banner-btn" onClick={onGoUniversities}>
            Learn about Bento for Universities
          </button>
        </div>
      </section>

    </div>
  );
}
