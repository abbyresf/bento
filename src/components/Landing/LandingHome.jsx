import { useState, useEffect, useRef } from 'react';
import './LandingHome.css';

/* ── SVG Icon Library ── */
const Icon = {
  school: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  menu: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  sparkle: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>
    </svg>
  ),
  target: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  shield: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#77BE3D" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  ),
  arrow: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  people: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  calendar: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  star: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  phone: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
      <line x1="12" y1="18" x2="12.01" y2="18"/>
    </svg>
  ),
  lock: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  free: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  ),
  settings: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
};

/* ── Data ── */
const TAGS = [
  { label: 'High Protein', color: '#FD8F2A', pos: 'tl' },
  { label: 'Gluten Free',  color: '#77BE3D', pos: 'tr' },
  { label: 'Vegetarian',   color: '#2B97FD', pos: 'br' },
  { label: 'Low Sugar',    color: '#FD8F2A', pos: 'bl' },
];

const STEPS = [
  {
    num: '01',
    icon: 'school',
    title: 'Pick your school',
    desc: 'Bento connects to your campus dining system and pulls the actual menu every morning. Not a recipe database. Not yesterday\'s data. What is actually being served right now.',
    img: '/screenshots/today.png',
  },
  {
    num: '02',
    icon: 'menu',
    title: "See the full menu before you go",
    desc: "Every station, every special, every option available today. You know exactly what you are walking into before you even leave your dorm.",
    img: '/screenshots/menu.png',
  },
  {
    num: '03',
    icon: 'sparkle',
    title: 'We figure out your targets',
    desc: "Bento calculates your daily calorie and macro goals based on your height, weight, age, and activity level. Not a rough estimate. Then it matches those numbers to what is on the menu today.",
    img: '/screenshots/bentos-pick.png',
  },
  {
    num: '04',
    icon: 'target',
    title: 'Walk in, grab your plate',
    desc: 'Bento tells you what to get. You get it. Come back tomorrow and do it again without thinking about it once.',
    img: '/screenshots/today.png',
  },
];

const TESTIMONIALS = [
  { text: "I've been hitting my protein goal every single day this semester. I genuinely didn't think that was possible at a dining hall.", name: 'M.', role: 'Junior, Pre-Med', color: '#FD8F2A' },
  { text: "My nut allergy means I can't trust most apps. Bento has been consistently right. That is rare.", name: 'J.', role: 'Sophomore, CS', color: '#77BE3D' },
  { text: "I gained 12 pounds of muscle this semester. My dining hall is the same. Bento is the difference.", name: 'A.', role: 'Senior, Track', color: '#2B97FD' },
  { text: "Setup took two minutes. I haven't thought about what to eat since. Exactly what I needed.", name: 'R.', role: 'Freshman', color: '#FD8F2A' },
  { text: "The dietary restriction filter is the best I've used anywhere. Vegan options come up immediately.", name: 'P.', role: 'Junior, Nutrition', color: '#77BE3D' },
  { text: "I'm an athlete with very specific macro targets. Bento hits them at my dining hall every day.", name: 'K.', role: 'Sophomore, Swimming', color: '#2B97FD' },
];

const STATS = [
  { icon: 'calendar', label: 'Live menu every morning', sublabel: 'Your actual dining hall, not a recipe database', color: 'orange' },
  { icon: 'phone',    label: 'Save to your home screen', sublabel: 'Works like a native app. No App Store needed.', color: 'green' },
  { icon: 'free',     label: 'Free, always', sublabel: 'No subscription, no paywall, no catch', color: 'blue' },
  { icon: 'lock',     label: 'Your data stays private', sublabel: 'Goals and restrictions belong to you alone', color: 'dark' },
];

const FEATURES = [
  { num: '01', icon: 'menu',    title: "Your actual dining hall, every day.", desc: "Every morning, Bento pulls your campus menu live. Rotating stations, daily specials, all of it. No recipe database has ever done this.", color: 'orange' },
  { num: '02', icon: 'target',  title: "Your targets, hit at every meal.", desc: "Set your calorie and macro goals once. Bento maps every suggestion to those exact numbers using what is available today.", color: 'green' },
  { num: '03', icon: 'shield2', title: "Your restrictions, always enforced.", desc: "Vegan, nut-free, kosher, gluten-free. Set it once and Bento filters everything automatically. No label checking required.", color: 'blue' },
  { num: '04', icon: 'people',  title: "Your feedback actually changes things.", desc: "Rate dishes, flag dietary gaps, and submit suggestions anonymously. Dining staff sees it. It actually influences what gets served.", color: 'orange' },
];

/* ── Phone frame ── */
function Phone({ src, alt = '', className = '' }) {
  return (
    <div className={`lh-phone ${className}`}>
      <div className="lh-phone-screen">
        <img src={src} alt={alt} className="lh-phone-img" loading="lazy" />
      </div>
    </div>
  );
}

/* ── FAQ ── */
const HOME_FAQS = [
  { q: 'Is Bento free to use?', a: 'Yes. Bento is completely free for all university students. No account, no subscription, and no credit card needed.' },
  { q: 'How does Bento get the dining hall menu?', a: 'Bento pulls your university\'s live dining menu directly so your meal plan always reflects what\'s actually being served that day. No manual data entry required.' },
  { q: 'How does the meal recommendation work?', a: 'Bento uses a scoring algorithm that weighs your macro targets, calorie budget, dietary restrictions, and past favorites to find the best options from what\'s available at each station.' },
  { q: 'Which universities does Bento support?', a: 'Bento is currently available at Brandeis University, with more schools being added. During onboarding you can see which universities are supported and choose yours.' },
  { q: 'Can I use Bento if I have food allergies?', a: 'Yes. You can specify allergies and dietary preferences during setup and Bento will filter meal recommendations accordingly. Always verify allergen information directly with dining staff before eating.' },
  { q: 'Is Bento affiliated with my university?', a: 'No. Bento is an independent application and is not affiliated with, endorsed by, or sponsored by any university or its dining services.' },
];

function HomeFAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`lh-faq-item${open ? ' open' : ''}`}>
      <button className="lh-faq-question" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <span>{q}</span>
        <span className="lh-faq-chevron" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      <p className="lh-faq-answer">{a}</p>
    </div>
  );
}

/* ── Shield icon for trust section ── */
function ShieldIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#77BE3D" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  );
}

/* ── Main component ── */
export default function LandingHome({ onGetStarted, onGoUniversities }) {
  const glowRef = useRef(null);
  const heroRef = useRef(null);

  useEffect(() => {
    const hero = heroRef.current;
    const glow = glowRef.current;
    if (!hero || !glow) return;
    const move = (e) => {
      const r = hero.getBoundingClientRect();
      glow.style.left = (e.clientX - r.left) + 'px';
      glow.style.top  = (e.clientY - r.top)  + 'px';
    };
    hero.addEventListener('mousemove', move);
    return () => hero.removeEventListener('mousemove', move);
  }, []);

  return (
    <div className="landing-home">

      {/* HERO */}
      <section className="lh-hero" ref={heroRef}>
        <div className="lh-mouse-glow" ref={glowRef} aria-hidden="true" />
        <div className="lh-blob lh-blob--a" aria-hidden="true" />
        <div className="lh-blob lh-blob--b" aria-hidden="true" />
        <div className="lh-blob lh-blob--c" aria-hidden="true" />

        <div className="lh-hero-inner">
          <div className="lh-hero-copy-top">
            <div className="lh-social-row">
              <div className="lh-avatars">
                {['M', 'J', 'A', 'K'].map((l, i) => (
                  <div key={l} className={`lh-avatar lh-avatar--${i}`}>{l}</div>
                ))}
              </div>
              <div className="lh-rating">
                <span className="lh-stars-row">
                  {[1,2,3,4,5].map(n => (
                    <span key={n} className="lh-star-icon">{Icon.star}</span>
                  ))}
                </span>
                <span className="lh-rating-sub">Students at Brandeis are eating smarter</span>
              </div>
            </div>

            <h1 className="lh-hero-headline">
              Healthy eating<br />made{' '}
              <span className="lh-hero-script" aria-label="effortless">
                effortless.
                <svg className="lh-underline-svg" viewBox="0 0 220 18" fill="none" aria-hidden="true">
                  <path d="M4 12 Q110 3 216 12" stroke="#FD8F2A" strokeWidth="3.5"
                    strokeLinecap="round" className="lh-underline-path" />
                </svg>
              </span>
            </h1>
          </div>

          <div className="lh-hero-phone-col" aria-hidden="true">
            <div className="lh-hero-phone-wrap">
              <div className="lh-phone-anchor">
                {TAGS.map(tag => (
                  <div key={tag.label} className={`lh-tag lh-tag--${tag.pos}`}
                    style={{ '--tc': tag.color }}>
                    <span className="lh-tag-dot" />
                    {tag.label}
                  </div>
                ))}
                <Phone className="lh-phone--hero" src="/screenshots/today.png" alt="Bento Today tab" />
              </div>
            </div>
          </div>

          <div className="lh-hero-copy-bottom">
            <p className="lh-hero-sub">
              No other app knows what your dining hall is serving today. Bento does.
              It reads your live menu every morning, matches it to your calorie and
              macro goals, and tells you exactly what to grab. Built for campus
              dining and nothing else.
            </p>
            <div className="lh-hero-ctas">
              <button className="lh-btn-primary" onClick={onGetStarted}>
                Get Started {Icon.arrow}
              </button>
            </div>
            <p className="lh-platform-note">Save to your home screen &bull; Free, always</p>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="lh-stats">
        <div className="lh-stats-inner">
          {STATS.map(stat => (
            <div key={stat.label} className={`lh-stat-card lh-stat-card--${stat.color}`}>
              <div className={`lh-stat-icon lh-stat-icon--${stat.color}`}>
                {Icon[stat.icon]}
              </div>
              <p className="lh-stat-label">{stat.label}</p>
              <p className="lh-stat-sub">{stat.sublabel}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="lh-how">
        <div className="lh-how-inner">
          <div className="lh-how-steps-col">
            <p className="lh-eyebrow">How it works</p>
            <h2 className="lh-section-heading">Four steps.<br />Zero thinking.</h2>

            {STEPS.map((step, i) => (
              <div key={step.num} className="lh-step">
                <div className="lh-step-left">
                  <div className="lh-step-icon">{Icon[step.icon]}</div>
                  {i < STEPS.length - 1 && <div className="lh-step-line" aria-hidden="true" />}
                </div>
                <div className="lh-step-body">
                  <div className="lh-step-num-label">{step.num}</div>
                  <h3 className="lh-step-title">{step.title}</h3>
                  <p className="lh-step-desc">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="lh-features">
        <div className="lh-features-inner">
          <p className="lh-eyebrow">Why Bento</p>
          <h2 className="lh-section-heading">The only app built<br />for your dining hall.</h2>
          <div className="lh-features-grid">
            {FEATURES.map(f => {
              const iconEl = f.icon === 'shield2'
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                : Icon[f.icon];
              return (
                <div key={f.num} className={`lh-feat-card lh-feat-card--${f.color}`}>
                  <div className="lh-feat-card-top">
                    <span className={`lh-feat-icon lh-feat-icon--${f.color}`}>{iconEl}</span>
                    <span className="lh-feat-num">{f.num}</span>
                  </div>
                  <h3 className="lh-feat-title">{f.title}</h3>
                  <p className="lh-feat-desc">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="lh-testimonials">
        <div className="lh-testimonials-hd">
          <p className="lh-eyebrow">What students say</p>
          <h2 className="lh-section-heading">Straight from<br />students.</h2>
        </div>
        <div className="lh-marquee-wrap" aria-hidden="true">
          <div className="lh-marquee">
            {[...TESTIMONIALS, ...TESTIMONIALS].map((t, i) => (
              <div key={i} className="lh-tcard">
                <div className="lh-tcard-stars">
                  {[1,2,3,4,5].map(n => (
                    <span key={n} className="lh-tcard-star">{Icon.star}</span>
                  ))}
                </div>
                <p className="lh-tcard-text">"{t.text}"</p>
                <div className="lh-tcard-attr">
                  <div className="lh-tcard-av" style={{ '--av': t.color }}>{t.name}</div>
                  <div>
                    <div className="lh-tcard-name">{t.name}</div>
                    <div className="lh-tcard-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST */}
      <div className="lh-trust">
        <div className="lh-trust-inner">
          <div className="lh-trust-shield-wrap"><ShieldIcon /></div>
          <div className="lh-trust-copy">
            <p className="lh-trust-hed">Your personal data stays yours.</p>
            <p className="lh-trust-bod">Your goals, restrictions, and usage are private. What we share with your school is anonymous: aggregated dietary needs that actually change what gets served. No names, no individual records, ever.</p>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <section className="lh-faq-section">
        <div className="lh-faq-inner">
          <h2 className="lh-faq-heading">Common questions about Bento</h2>
          <div className="lh-faq-list">
            {HOME_FAQS.map(item => <HomeFAQItem key={item.q} {...item} />)}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lh-cta">
        <div className="lh-cta-blob lh-cta-blob--a" aria-hidden="true" />
        <div className="lh-cta-blob lh-cta-blob--b" aria-hidden="true" />
        <div className="lh-cta-inner">
          <div className="lh-cta-copy">
            <h2 className="lh-cta-hed">
              Your dining hall<br />has good food.<br />
              <span className="lh-cta-accent">Bento finds it.</span>
            </h2>
            <p className="lh-cta-sub">Free forever. Two minutes to set up. Works at your dining hall today.</p>
            <div className="lh-cta-btns">
              <button className="lh-btn-primary lh-btn-primary--inv" onClick={onGetStarted}>
                Get Started {Icon.arrow}
              </button>
            </div>
            <p className="lh-cta-note">Save to your home screen &bull; Works on any phone</p>
          </div>
        </div>
      </section>

      {/* UNIVERSITIES */}
      <section className="lh-uni">
        <div className="lh-uni-inner">
          <p className="lh-uni-text">
            Are you a dining administrator? Bento gives students a better dining experience
            and gives your team real data on what they actually want.
          </p>
          <button className="lh-uni-btn" onClick={onGoUniversities}>
            Bento for Universities
          </button>
        </div>
      </section>

    </div>
  );
}
