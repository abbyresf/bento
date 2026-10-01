import { useState, useEffect, useRef } from 'react';
import { submitWaitlistEntry } from '../../lib/db';
import { UNIVERSITIES } from '../../data/universities';
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
/* Three steps, each one showing the screen it describes.
 *
 * This was four steps of prose with an `img` on every one that the component
 * never rendered, so menu.png and bentos-pick.png existed in the repo and
 * appeared nowhere on the site. The page asked students to read four
 * paragraphs about an app it would not show them. Showing the real screens
 * says more than the paragraphs did, so the copy shrank to fit under them. */
const STEPS = [
  {
    num: '01',
    icon: 'menu',
    title: 'See today’s menu',
    desc: 'Every station and every special at your dining hall, pulled live each morning. Know what is there before you leave your dorm.',
    img: '/screenshots/menu.png',
    alt: 'The Bento menu screen listing today’s dishes by dining station.',
  },
  {
    num: '02',
    icon: 'target',
    title: 'Find your fit',
    desc: 'Set your goals and restrictions once. Bento matches them against what is being served today and shows you what works.',
    img: '/screenshots/bentos-pick.png',
    alt: 'A suggested meal in Bento, with its calories and macros against the day’s targets.',
  },
  {
    num: '03',
    icon: 'people',
    title: 'Eat, then weigh in',
    desc: 'Confirm your meal and rate the dishes. Ratings and dietary gaps reach your dining team as anonymous totals.',
    img: '/screenshots/today.png',
    alt: 'The Bento home screen showing confirmed meals and daily progress.',
  },
];


/* Four claims, but not four equal claims. The live menu is the one nobody else
   can make, so it takes the wide compartment and the action hue; the other
   three are reassurances and share the positive hue. The old list gave each a
   different colour by position, which is what made the palette read as
   decoration. */
const STATS = [
  { icon: 'calendar', label: 'Live menu every morning', sublabel: 'Your actual dining hall, not a recipe database', tone: 'action', wide: true },
  { icon: 'phone',    label: 'Save to your home screen', sublabel: 'Works like a native app. No App Store needed.', tone: 'positive' },
  { icon: 'free',     label: 'Free, always', sublabel: 'No subscription, no paywall, no catch', tone: 'positive' },
  { icon: 'lock',     label: 'Your data stays private', sublabel: 'Goals and restrictions belong to you alone', tone: 'positive' },
];

const FEATURES = [
  { num: '01', icon: 'menu',    title: "Your actual dining hall, every day.", desc: "Every morning, Bento pulls your campus menu live. Rotating stations, daily specials, all of it. No recipe database has ever done this.", tone: 'action' },
  { num: '02', icon: 'target',  title: "Your targets, hit at every meal.", desc: "Set your calorie and macro goals once. Bento maps every suggestion to those exact numbers using what is available today.", tone: 'action' },
  { num: '03', icon: 'shield2', title: "Your restrictions, always enforced.", desc: "Vegan, nut-free, kosher, gluten-free. Set it once and Bento filters everything automatically. No label checking required.", tone: 'positive' },
  { num: '04', icon: 'people',  title: "Your feedback actually changes things.", desc: "Rate dishes, flag dietary gaps, and submit suggestions anonymously. Dining staff sees it. It actually influences what gets served.", tone: 'action' },
];

/* ── Phone frame ── */
function Phone({ src, alt = '', className = '' }) {
  return (
    <div className={`lh-phone ${className}`}>
      <div className="lh-phone-screen">
        {/* Real pixel size of every screenshot. Present so the browser can
            reserve the box before the file arrives, or before the stylesheet
            does. */}
        <img
          src={src}
          alt={alt}
          className="lh-phone-img"
          width="1170"
          height="2532"
          loading="lazy"
        />
      </div>
    </div>
  );
}

/* ── FAQ ── */
const HOME_FAQS = [
  { q: 'Is Bento free to use?', a: 'Yes. Bento is completely free for all university students. No account, no subscription, and no credit card needed.' },
  { q: 'How does Bento get the dining hall menu?', a: 'Bento pulls your university\'s live dining menu directly so your meal plan always reflects what\'s actually being served that day. No manual data entry required.' },
  { q: 'How does the meal recommendation work?', a: 'Bento uses a scoring algorithm that weighs your macro targets, calorie budget, dietary restrictions, and the dishes you have rated highly to find the best options from what\'s available at each station.' },
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

/* ── School availability ──
 *
 * The page used to ask "Don't see your school?" without ever showing which
 * schools there were, so a student had to start onboarding to find out. This
 * reads the same UNIVERSITIES list onboarding uses, so what it reports is
 * always what the app actually supports.
 *
 * Matching mirrors UniversityPicker: name or alias, case-insensitive. A school
 * in the list but not live yet is a real answer, not a miss, so it is stated
 * plainly rather than being dropped into the waitlist as if unknown.
 */
function SchoolCheck({ onGetStarted }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const matches = q
    ? UNIVERSITIES.filter(u =>
        u.name.toLowerCase().includes(q) || u.aliases?.some(a => a.includes(q)))
    : [];
  const live = matches.filter(u => u.available);
  const listed = matches.filter(u => !u.available);

  return (
    <div className="lh-school-check">
      <label className="lh-school-label" htmlFor="lh-school-input">
        Search for your university
      </label>
      <input
        id="lh-school-input"
        className="lh-school-input"
        type="text"
        autoComplete="off"
        placeholder="Start typing your school"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />

      {/* Announced politely so a screen reader hears the answer without having
          the focus pulled out of the field mid-word. */}
      <div className="lh-school-results" role="status" aria-live="polite">
        {live.map(u => (
          <div key={u.id} className="lh-school-hit lh-school-hit--live">
            <span className="lh-school-dot" aria-hidden="true" />
            <div>
              <p className="lh-school-hit-name">{u.name}</p>
              <p className="lh-school-hit-note">Bento is live here. {u.location}</p>
            </div>
            <button className="lh-school-hit-btn" onClick={onGetStarted}>
              Get started {Icon.arrow}
            </button>
          </div>
        ))}

        {listed.map(u => (
          <div key={u.id} className="lh-school-hit">
            <span className="lh-school-dot lh-school-dot--soon" aria-hidden="true" />
            <div>
              <p className="lh-school-hit-name">{u.name}</p>
              <p className="lh-school-hit-note">Not live yet. Join the waitlist below.</p>
            </div>
          </div>
        ))}

        {q && matches.length === 0 && (
          <p className="lh-school-none">
            No match for &ldquo;{query}&rdquo;. Join the waitlist below and we will reach out
            when Bento comes to your dining hall.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Waitlist form ── */
function WaitlistForm() {
  const [school, setSchool] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'error'

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!school.trim() || !email.trim()) return;
    setStatus('loading');
    try {
      await submitWaitlistEntry(email, school);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="lh-waitlist-success">
        <span className="lh-waitlist-check" aria-hidden="true">✓</span>
        <p className="lh-waitlist-success-hed">You're on the list.</p>
        <p className="lh-waitlist-success-sub">We'll reach out when Bento comes to {school}.</p>
      </div>
    );
  }

  return (
    <form className="lh-waitlist-form" onSubmit={handleSubmit} noValidate>
      <div className="lh-waitlist-fields">
        <input
          className="lh-waitlist-input"
          type="text"
          placeholder="Your school"
          value={school}
          onChange={e => setSchool(e.target.value)}
          required
          disabled={status === 'loading'}
        />
        <input
          className="lh-waitlist-input"
          type="email"
          placeholder="Your email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          disabled={status === 'loading'}
        />
      </div>
      {status === 'error' && (
        <p className="lh-waitlist-error">Something went wrong. Try again.</p>
      )}
      <button
        className="lh-waitlist-btn"
        type="submit"
        disabled={status === 'loading' || !school.trim() || !email.trim()}
      >
        {status === 'loading' ? 'Submitting…' : 'Join the waitlist'}
      </button>
    </form>
  );
}

/* ── Settle-in ──
 *
 * A bento box is compartments that lock together, so things on this page
 * settle into place: a short rise, a hair of scale, one easing, one duration.
 * It is the only motion on the page now that the drifting blobs and the
 * cursor-chasing glow are gone, and it reads as one gesture rather than
 * ambient decoration.
 *
 * Two rules it has to obey.
 *
 * Nothing is hidden in the stylesheet. The homepage is prerendered so that
 * readers without JavaScript get the whole page, and a CSS-only hidden state
 * would blank it for exactly those readers. The hidden class is added here, by
 * script, so no-JS sees everything.
 *
 * Only elements below the fold are touched. The prerendered markup paints
 * before React mounts, so hiding something already on screen would flash it
 * away and back. Anything visible at mount is left exactly as it is.
 */
function useSettleIn(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-settled');
        io.unobserve(entry.target);
      }
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });

    for (const node of root.querySelectorAll('[data-settle]')) {
      if (node.getBoundingClientRect().top < window.innerHeight) continue;
      node.classList.add('lh-settle');
      io.observe(node);
    }
    return () => io.disconnect();
  }, [rootRef]);
}

/* ── Main component ── */
export default function LandingHome({ onGetStarted, onGoUniversities }) {
  const heroRef = useRef(null);
  const pageRef = useRef(null);
  useSettleIn(pageRef);

  return (
    <div className="landing-home" ref={pageRef}>

      {/* HERO */}
      <section className="lh-hero" ref={heroRef}>

        <div className="lh-hero-inner">
          <div className="lh-hero-copy-top">
            <div className="lh-social-row">
              <span className="lh-rating-sub">Free for Brandeis &amp; Tufts students</span>
            </div>

            {/* The old headline was "Healthy eating made effortless", which could
                sit on any calorie app and made a health claim Bento should not
                make. The ownable claim was buried in the paragraph below: Bento
                is the only app that reads YOUR dining hall's menu today. That
                belongs in the largest type on the page. */}
            <h1 className="lh-hero-headline">
              Today&apos;s menu,<br />built around{' '}
              <span className="lh-hero-accent" aria-label="your goals">
                your goals.
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
                <Phone className="lh-phone--hero" src="/screenshots/today.png" alt="Bento Today tab" />
              </div>
            </div>
          </div>

          <div className="lh-hero-copy-bottom">
            <p className="lh-hero-sub">
              No other app knows what your dining hall is serving today. Bento
              reads your live menu every morning, matches it to your calorie and
              macro goals, and tells you what to grab.
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
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              data-settle
              style={{ transitionDelay: `${i * 70}ms` }}
              className={`lh-stat-card lh-stat-card--${stat.tone}${stat.wide ? ' lh-stat-card--wide' : ''}`}
            >
              <div className={`lh-stat-icon lh-stat-icon--${stat.tone}`}>
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
          <p className="lh-eyebrow">How it works</p>
          <h2 className="lh-section-heading lh-how-heading">Three steps.<br />Zero thinking.</h2>

          <ol className="lh-how-steps">
            {STEPS.map((step, i) => (
              <li key={step.num} className="lh-step" data-settle style={{ transitionDelay: `${i * 90}ms` }}>
                <Phone className="lh-phone--step" src={step.img} alt={step.alt} />
                <div className="lh-step-body">
                  <div className="lh-step-num-row">
                    <span className="lh-step-icon">{Icon[step.icon]}</span>
                    <span className="lh-step-num-label">{step.num}</span>
                  </div>
                  <h3 className="lh-step-title">{step.title}</h3>
                  <p className="lh-step-desc">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FEATURES */}
      <section className="lh-features">
        <div className="lh-features-inner">
          <p className="lh-eyebrow">Why Bento</p>
          <h2 className="lh-section-heading">The only app built<br />for your dining hall.</h2>
          <div className="lh-features-grid">
            {FEATURES.map((f, i) => {
              const iconEl = f.icon === 'shield2'
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                : Icon[f.icon];
              return (
                <div key={f.num} data-settle style={{ transitionDelay: `${i * 70}ms` }} className={`lh-feat-card lh-feat-card--${f.tone}`}>
                  {/* No 01-04 here. These are four parallel benefits, not an
                      order of events, so numbering them labelled a sequence
                      that does not exist, and they rendered at 1.17:1 against
                      the card, which is invisible rather than subtle. How it
                      works keeps its numbers, because those steps are a
                      sequence.

                      The icon read f.color, a field renamed to f.tone in the
                      same change that introduced tones, so every feature icon
                      has been rendering lh-feat-icon--undefined and losing its
                      tint. */}
                  <div className="lh-feat-card-top">
                    <span className={`lh-feat-icon lh-feat-icon--${f.tone}`}>{iconEl}</span>
                  </div>
                  <h3 className="lh-feat-title">{f.title}</h3>
                  <p className="lh-feat-desc">{f.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Sits with the dietary claim, not only in the footer. Bento reads
              the labels the dining hall publishes; it cannot see the kitchen,
              so it cannot speak to cross-contact. */}
          <p className="lh-allergen-note">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FD8F2A"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16.5" x2="12.01" y2="16.5" />
            </svg>
            <span>
              Bento filters on the dietary labels your dining hall publishes. It
              cannot account for cross-contact in the kitchen. If you have a food
              allergy, confirm ingredients and preparation with dining staff
              before you eat.
            </span>
          </p>
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

      {/* WAITLIST */}
      <section className="lh-waitlist" id="lh-availability">
        <div className="lh-waitlist-inner">
          <p className="lh-waitlist-eyebrow">Campus availability</p>
          <h2 className="lh-waitlist-hed">Is Bento at your school?</h2>
          <p className="lh-waitlist-sub">
            Bento is live at Brandeis and Tufts, and we're adding campuses. Check
            yours, then join the waitlist if it isn't there yet.
          </p>
          <SchoolCheck onGetStarted={onGetStarted} />
          <WaitlistForm />
        </div>
      </section>

      {/* UNIVERSITIES
          Above the closing CTA on purpose. This sat dead last, underneath the
          "Get Started" that ends the student pitch, so the only section aimed at
          the people who actually buy Bento was the one section nobody scrolled
          to. The student CTA now closes the page, which is where a close
          belongs. */}
      <section className="lh-uni">
        <div className="lh-uni-inner">
          <p className="lh-uni-eyebrow">For dining administrators</p>
          <h2 className="lh-uni-hed">Turn student demand<br />into dining decisions.</h2>
          <p className="lh-uni-text">
            Bento Pulse gives your team real-time insight into what students want.
            Dietary needs, station feedback, and gaps in the current menu. No
            surveys. No guesswork.
          </p>
          <button className="lh-uni-btn" onClick={onGoUniversities}>
            Learn about Bento for Universities {Icon.arrow}
          </button>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lh-cta">
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
              <a className="lh-cta-secondary" href="#lh-availability">
                See if my school is supported
              </a>
            </div>
            <p className="lh-cta-note">Save to your home screen &bull; Works on any phone</p>
          </div>
        </div>
      </section>

    </div>
  );
}
