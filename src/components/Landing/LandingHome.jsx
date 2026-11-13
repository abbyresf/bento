import { useState, useEffect, useRef } from 'react';
import { submitWaitlistEntry } from '../../lib/db';
import { UNIVERSITIES } from '../../data/universities';
import { APP_STORE_URL } from '../../data/links';
import { BentoSticker, HallMarquee } from './LoudSticker';
import './LandingHome.css';

/* The homepage is prerendered, and main.jsx mounts with createRoot, which throws
   the prerendered nodes away and builds new ones. CSS animations restart on new
   nodes, so the hero intro would play twice. This runs before that first render,
   while the prerendered markup is still in #root: if it is there, the intro has
   already played on it and the React copy starts settled. */
const PRERENDERED = typeof document !== 'undefined' && !!document.querySelector('#root .ld-hero');

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ── Copy ── */
const STEPS = [
  {
    num: '01', tone: 'or',
    title: 'Check the menu.',
    desc: 'Every station, every special, live each morning. Know what’s out before you leave your dorm.',
    img: '/screenshots/menu.png',
    alt: 'The Bento menu screen listing tonight’s dishes by station, with calories and macros.',
  },
  {
    num: '02', tone: 'li',
    title: 'Get your plate.',
    desc: 'Set your goals and restrictions once. Bento picks a plate from today’s menu to hit them.',
    img: '/screenshots/today.png',
    alt: 'The Bento Today screen with a dinner plate picked from North Hall and the day’s totals.',
  },
  {
    num: '03', tone: 'pk',
    title: 'Eat and rate.',
    desc: 'Tap I ate this, then rate the dishes. Your dining team sees the totals.',
    img: '/screenshots/feed.png',
    alt: 'The Bento Feed with top-rated dishes and student requests for the dining hall.',
  },
];

const FEATURES = [
  { tone: 'or', title: 'Your hall. Today.', desc: 'Bento pulls your campus menu every morning. Rotating stations and daily specials included.' },
  { tone: 'li', title: 'Your numbers, every meal.', desc: 'Set calories and macros once. Every pick fits today’s menu and your targets.' },
  { tone: 'sk', title: 'Your restrictions, every plate.', desc: 'Vegan, nut-free, kosher, gluten-free. Set once. Bento filters every suggestion.' },
  { tone: 'pk', title: 'Eat with friends.', desc: 'See who’s at the hall. Team up on quests. Keep a streak together.' },
  { tone: 'bu', title: 'Streaks and fits.', desc: 'Log meals, keep your streak, dress up your Bento with new looks.' },
  { tone: 'lc', title: 'Your vote reaches the kitchen.', desc: 'Rate dishes, flag gaps, post ideas in the Feed. Dining staff see the totals.' },
];

const HOME_FAQS = [
  { q: 'Is Bento free to use?', a: 'Yes. Free for every student. No subscription, no credit card.' },
  { q: 'How does Bento get the dining hall menu?', a: 'Bento reads your dining hall’s published menu each morning, so your plan matches what’s served today. No manual entry.' },
  { q: 'How does the meal recommendation work?', a: 'Bento scores every dish on today’s menu against your calories, macros, restrictions and the dishes you rate highly. The top scorers become your plate.' },
  { q: 'Which universities does Bento support?', a: 'Brandeis University and Boston University, with more schools on the way. Search yours below to check.' },
  { q: 'Can I use Bento if I have food allergies?', a: 'Yes. Set your allergies and preferences during setup and Bento filters your recommendations. Always confirm allergen information with dining staff before you eat.' },
  { q: 'Is Bento affiliated with my university?', a: 'No. Bento is independent. No university or dining service sponsors or endorses Bento.' },
];

/* ── Phone frame ──
 * The screenshots start at the very top of the app, with no status bar, so the
 * frame's rounded corners clipped what sits in them. The screen now has a status
 * bar above the screenshot and a little room below it, in the screenshot's own
 * background, and is shaped to fit the screenshot whole. */
const DARK_SHOTS = new Set(['/screenshots/menu.png']);
function Phone({ src, alt = '', className = '', eager = false }) {
  return (
    <div className={`ld-phone ${className}`}>
      <div className={`ld-phone-screen${DARK_SHOTS.has(src) ? ' ld-phone-screen--dark' : ''}`}>
        <div className="ld-phone-bar" aria-hidden="true"><span>9:41</span><i /></div>
        <img src={src} alt={alt} width="645" height="1398" loading={eager ? 'eager' : 'lazy'} />
      </div>
    </div>
  );
}

/* ── FAQ ── */
function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`ld-faq-item${open ? ' open' : ''}`}>
      <button className="ld-faq-q" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <span>{q}</span>
        <span className="ld-faq-plus" aria-hidden="true" />
      </button>
      {/* Always in the DOM, for the FAQ structured data and for crawlers. */}
      <div className="ld-faq-a"><p>{a}</p></div>
    </div>
  );
}

/* ── School check. Reads the same list onboarding uses, so it reports what the app supports ── */
function SchoolCheck() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = q
    ? UNIVERSITIES.filter(u => u.id !== 'demo' &&
        (u.name.toLowerCase().includes(q) || u.aliases?.some(a => a.includes(q))))
    : [];
  const live = matches.filter(u => u.available);
  const listed = matches.filter(u => !u.available);

  return (
    <div className="ld-school">
      <label className="ld-fieldlabel" htmlFor="ld-school-input">Search for your university</label>
      <input id="ld-school-input" className="ld-input" type="text" autoComplete="off"
        placeholder="Start typing your school" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="ld-school-results" role="status" aria-live="polite">
        {live.map(u => (
          <div key={u.id} className="ld-hit ld-hit--live">
            <span className="ld-hit-dot" aria-hidden="true" />
            <div className="ld-hit-tx">
              <b>{u.name}</b>
              <span>Bento is live here. {u.location}</span>
            </div>
            <a className="ld-btn ld-btn--li ld-hit-btn" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
              Get the app <Arrow />
            </a>
          </div>
        ))}
        {listed.map(u => (
          <div key={u.id} className="ld-hit">
            <span className="ld-hit-dot ld-hit-dot--soon" aria-hidden="true" />
            <div className="ld-hit-tx">
              <b>{u.name}</b>
              <span>Not live yet. Join the waitlist below.</span>
            </div>
          </div>
        ))}
        {q && matches.length === 0 && (
          <p className="ld-school-none">
            No match for &ldquo;{query}&rdquo;. Join the waitlist below and we’ll email you when Bento comes to your dining hall.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Waitlist ── */
function WaitlistForm() {
  const [school, setSchool] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null);

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
      <div className="ld-wait-done">
        <span className="ld-wait-check" aria-hidden="true">✓</span>
        <p className="ld-wait-done-hed">You’re on the list.</p>
        <p>We’ll email you when Bento comes to {school}.</p>
      </div>
    );
  }

  return (
    <form className="ld-wait-form" onSubmit={handleSubmit} noValidate>
      <input className="ld-input" type="text" placeholder="Your school" aria-label="Your school"
        value={school} onChange={e => setSchool(e.target.value)} required disabled={status === 'loading'} />
      <input className="ld-input" type="email" placeholder="Your email" aria-label="Your email"
        value={email} onChange={e => setEmail(e.target.value)} required disabled={status === 'loading'} />
      <button className="ld-btn ld-btn--or" type="submit"
        disabled={status === 'loading' || !school.trim() || !email.trim()}>
        {status === 'loading' ? 'Adding…' : 'Join the waitlist'}
      </button>
      {status === 'error' && <p className="ld-error">Something went wrong. Try again.</p>}
    </form>
  );
}

/* ── Motion ──
   Reveal: anything below the fold at mount rises in as it scrolls into view.
   The hidden class is added here, by script, so the prerendered page and
   no-JS readers see everything. Elements on screen at mount are left alone.
   Parallax: one scroll value written to a CSS variable, read by the hero. */
function useLoudMotion(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        el.classList.add('is-in');
        io.unobserve(el);
        // Hand the transform back once the entrance is done, so hover effects work.
        setTimeout(() => el.classList.remove('ld-hide'), 1400 + (parseFloat(el.style.transitionDelay) || 0));
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    for (const node of root.querySelectorAll('[data-reveal]')) {
      if (node.getBoundingClientRect().top < window.innerHeight) continue;
      node.classList.add('ld-hide');
      io.observe(node);
    }

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        root.style.setProperty('--sy', String(Math.min(window.scrollY, 1400)));
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { io.disconnect(); window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [rootRef]);
}

const delay = (i, step = 80) => ({ transitionDelay: `${i * step}ms` });

/* ── Page ── */
/* Under each App Store badge: the way in for Android, which has no store app.
 * A real link to /login, so it works in the prerendered page before the app
 * loads, and an in-app route once it has. */
function AndroidLink({ onGetStarted, className = 'ld-android' }) {
  return (
    <a className={className} href="/login"
       onClick={(e) => { if (onGetStarted) { e.preventDefault(); onGetStarted(); } }}>
      On Android? Use the web app <Arrow />
    </a>
  );
}

export default function LandingHome({ onGoUniversities, onGetStarted }) {
  const pageRef = useRef(null);
  useLoudMotion(pageRef);

  return (
    <div className="ld-home" ref={pageRef}>

      {/* HERO */}
      <section className={`ld-hero${PRERENDERED ? ' ld-hero--settled' : ''}`}>
        <div className="ld-glow" style={{ width: 460, height: 460, background: 'var(--ld-or)', right: '8%', top: 20 }} />
        <div className="ld-glow" style={{ width: 320, height: 320, background: 'var(--ld-lc)', right: '-4%', top: 360, opacity: .38, animationDelay: '-6s' }} />

        <div className="ld-hero-copy">
          <h1 className="ld-hero-h1">
            <span className="ld-line"><span>Know the menu</span></span>
            <span className="ld-line"><span><span className="ld-hl">before</span> you go<span className="o">.</span></span></span>
          </h1>
          <p className="ld-hero-sub">
            No other app reads your dining hall’s menu. Bento pulls <b>today’s real menu</b> every
            morning, matches each dish to your goals and restrictions, and tells you what to grab.
          </p>
          <div className="ld-hero-ctas">
            <div className="ld-store-stack">
              <a className="ld-store" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
                <img src="/app-store-badge.svg" alt="Download on the App Store" width="150" height="50" />
              </a>
              <AndroidLink onGetStarted={onGetStarted} />
            </div>
            <span className="ld-hero-note">Live at Brandeis and BU. Free on iPhone.</span>
          </div>
        </div>

        <div className="ld-hero-art" aria-hidden="true">
          <div className="ld-hero-par">
            <Phone className="ld-phone--back" src="/screenshots/buddies.png" />
            <Phone className="ld-phone--front" src="/screenshots/today.png" eager />
          </div>
          <BentoSticker className="ld-hero-sticker" />
        </div>
      </section>

      <HallMarquee />
      <HallMarquee reverse outline />

      {/* BLOCKS */}
      <section className="ld-blocks">
        <div className="ld-blk ld-s4" data-reveal style={{ background: 'var(--ld-li)', ...delay(0) }}>
          <h2>The real menu.<br />Not a guess.</h2>
          <p>Other apps search a food database. Bento pulls your hall’s menu every morning, station by station.</p>
        </div>
        <div className="ld-blk ld-s2 ld-blk--num" data-reveal style={{ background: 'var(--ld-or)', color: '#fff', '--ld-r': '3deg', ...delay(1) }}>
          <span className="ld-num">3</span>
          <p>plates a day, built around your numbers.</p>
        </div>
        <div className="ld-blk ld-s2" data-reveal style={{ background: 'var(--ld-sk)', '--ld-r': '-3deg', ...delay(2) }}>
          <h2>Free.<br />Always.</h2>
          <p>No subscription. No paywall.</p>
        </div>
        <div className="ld-blk ld-s2" data-reveal style={{ background: 'var(--ld-bu)', '--ld-r': '2deg', ...delay(3) }}>
          <h2>Private by<br />default.</h2>
          <p>Your school sees totals, never names.</p>
        </div>
        <div className="ld-blk ld-s2 ld-blk--grad" data-reveal style={{ '--ld-r': '-2deg', ...delay(4) }}>
          <h2>iPhone or<br />any browser.</h2>
          <p>Get the app, or <button type="button" className="ld-inline-link" onClick={onGetStarted}>open Bento on the web</button>.</p>
          <BentoSticker className="ld-blk-sticker" mood="happy" />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="ld-how">
        <h2 className="ld-h2" data-reveal>Three steps.<br /><span className="l">Zero thinking.</span></h2>
        <ol className="ld-steps">
          {STEPS.map((s, i) => (
            <li key={s.num} className={`ld-step ld-step--${s.tone}`} data-reveal style={{ '--ld-r': `${i % 2 ? 3 : -3}deg`, ...delay(i, 120) }}>
              <span className="ld-step-num" aria-hidden="true">{s.num}</span>
              <Phone className="ld-phone--step" src={s.img} alt={s.alt} />
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* FRIENDS BAND */}
      <section className="ld-band">
        <div className="ld-band-inner" data-reveal>
          <div className="ld-band-copy">
            <h2 className="ld-h2">Dinner w/<br />Maya + 2.</h2>
            <p>See who’s at the hall right now. Tap I’m here, team up on quests that reset every Monday, and keep a streak going together.</p>
          </div>
          <Phone className="ld-phone--band" src="/screenshots/buddies.png" alt="The Bento Buddies tab showing Maya at Commons and this week’s quests." />
          <BentoSticker className="ld-band-sticker" />
        </div>
      </section>

      {/* WHY BENTO */}
      <section className="ld-why">
        <h2 className="ld-h2" data-reveal>The only app built<br />for your <span className="o">dining hall.</span></h2>
        <div className="ld-feats">
          {FEATURES.map((f, i) => (
            <div key={f.title} className={`ld-feat ld-feat--${f.tone}`} data-reveal style={delay(i % 3, 90)}>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
        {/* Bento reads the labels the dining hall publishes. It cannot see the kitchen. */}
        <p className="ld-allergen" data-reveal>
          Bento filters on the dietary labels your dining hall publishes. It cannot account for
          cross-contact in the kitchen. If you have a food allergy, confirm ingredients and
          preparation with dining staff before you eat.
        </p>
      </section>

      {/* TRUST */}
      <section className="ld-trust" data-reveal>
        <h2>Your data stays yours.</h2>
        <p>Your goals and restrictions are private. Your school sees anonymous totals, never names or individual records.</p>
      </section>

      {/* FAQ */}
      <section className="ld-faq">
        <h2 className="ld-h2 ld-faq-h" data-reveal>Common questions<br /><span className="p">about Bento</span></h2>
        <div className="ld-faq-list" data-reveal>
          {HOME_FAQS.map(item => <FAQItem key={item.q} {...item} />)}
        </div>
      </section>

      {/* WAITLIST */}
      <section className="ld-wait" id="lh-availability">
        <div className="ld-wait-card" data-reveal>
          <h2 className="ld-h2">Is Bento at<br /><span className="l">your school?</span></h2>
          <p className="ld-wait-sub">Live at Brandeis and BU. Tufts is next. Search your school, or join the waitlist.</p>
          <SchoolCheck />
          <WaitlistForm />
        </div>
      </section>

      {/* UNIVERSITIES */}
      <section className="ld-uni" data-reveal>
        <h2 className="ld-h2">Turn student demand<br />into dining decisions.</h2>
        <p>Bento Pulse shows your team what students want: dietary needs, dish ratings, menu gaps. No surveys.</p>
        <button className="ld-btn" onClick={onGoUniversities}>For dining teams <Arrow /></button>
      </section>

      {/* FINAL CTA */}
      <section className="ld-final">
        <div className="ld-glow" style={{ width: 520, height: 300, background: 'var(--ld-pk)', left: '50%', top: 40, marginLeft: -260, opacity: .3 }} />
        <h2 className="ld-final-h" data-reveal>Your dining hall<br />has good food.<br /><span>Bento finds it.</span></h2>
        <p className="ld-final-sub" data-reveal>Free. Two minutes to set up.</p>
        {/* One centred column: the badge, then the two other ways forward side by side. */}
        <div className="ld-final-ctas" data-reveal>
          <a className="ld-store" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
            <img src="/app-store-badge.svg" alt="Download on the App Store" width="150" height="50" />
          </a>
          <div className="ld-final-links">
            <AndroidLink onGetStarted={onGetStarted} className="ld-final-link" />
            <a className="ld-final-link" href="#lh-availability">See if my school is live <Arrow /></a>
          </div>
        </div>
      </section>
    </div>
  );
}
