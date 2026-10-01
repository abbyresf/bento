import { useCallback, useEffect, useRef, useState } from 'react';
import './PulseCarousel.css';

/* Screens from the Bento Pulse demo account.
 *
 * This replaces a dashboard drawn in JSX. That mockup had to be kept in sync
 * with a product it only resembled, and it showed one screen; these are the
 * real views, so what a dining director sees here is what they would get.
 *
 * The figures are demo data, which the frame says out loud. The first screen
 * carries that notice in the product itself; the rest do not, so the label
 * belongs on the frame rather than on one slide.
 */
const SLIDES = [
  {
    src: '/screenshots/pulse/overview.png', w: 1874, h: 1184,
    title: 'Today at a glance',
    body: 'Confirmations, active students, how much of each plate came back, and the shifts worth knowing about written out in plain language.',
    alt: 'The Pulse overview: meals confirmed, active students, plate eaten and servings left, an insights panel, a 30-day confirmations chart and a meal-type split.',
  },
  {
    src: '/screenshots/pulse/items-waste.png', w: 1890, h: 1408,
    title: 'What gets taken, and what comes back',
    body: 'The most-selected dishes beside the ones students leave, measured only from the plates where a student reported how much they finished.',
    alt: 'Top items over 30 days, reported dietary needs by share of students, and a plate-waste table showing how much of each dish was eaten.',
  },
  {
    src: '/screenshots/pulse/patterns-feedback.png', w: 1880, h: 1376,
    title: 'Patterns you can staff around',
    body: 'Demand by weekday, how each hall performs, which dishes rate well, and the suggestions students upvoted most.',
    alt: 'Demand by day of week, a per-dining-hall breakdown, student suggestions with agree counts, and highest and lowest rated dishes.',
  },
  {
    src: '/screenshots/pulse/surveys.png', w: 1552, h: 1384,
    title: 'Ask your campus directly',
    body: 'Publish one question to everyone or to a single dietary group, and watch the answers land while it runs.',
    alt: 'The survey composer with question, format, options, audience and duration, above results from a live survey and a closed one.',
  },
];

const ADVANCE_MS = 5000;

export default function PulseCarousel() {
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // One scroll container with snap points, rather than a transform. That gives
  // a phone its swipe and a trackpad its horizontal scroll for free, and the
  // buttons below drive the same mechanism, so there is only one notion of
  // where the carousel is.
  const goTo = useCallback((i) => {
    const track = trackRef.current;
    if (!track) return;
    const count = SLIDES.length;
    const next = (i + count) % count;
    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
  }, []);

  // The scroll position is the source of truth, so a manual swipe and a button
  // press update the dots the same way.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const w = track.clientWidth || 1;
        setIndex(Math.round(track.scrollLeft / w));
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      // Advancing a carousel nobody is looking at just burns battery, and the
      // reader would come back to a slide they never saw arrive.
      if (document.visibilityState !== 'visible') return;
      const track = trackRef.current;
      if (!track) return;
      // Read the position from the track rather than from state. The interval
      // then does not depend on the current slide, so it is not torn down and
      // rebuilt on every change, which would restart the five seconds each
      // time, and nothing has to write a ref during render to arrange that.
      const w = track.clientWidth || 1;
      goTo(Math.round(track.scrollLeft / w) + 1);
    }, ADVANCE_MS);
    return () => clearInterval(t);
  }, [paused, goTo]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); goTo(index - 1); }
  };

  return (
    <div
      className="pc"
      role="group"
      aria-roledescription="carousel"
      aria-label="Bento Pulse screens"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div className="pc-frame">
        <div
          className="pc-track"
          ref={trackRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          aria-label="Screens, use the left and right arrow keys"
        >
          {SLIDES.map((s, i) => (
            <div
              className="pc-slide"
              key={s.src}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${SLIDES.length}: ${s.title}`}
            >
              <img
                src={s.src}
                alt={s.alt}
                className="pc-img"
                width={s.w}
                height={s.h}
                loading={i === 0 ? 'eager' : 'lazy'}
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Polite, so the caption is announced after a slide settles rather than
          interrupting whatever is being read. */}
      <div className="pc-caption" aria-live="polite">
        {/* Sits with the caption rather than floating over the screens. The
            images are different heights and are centred, so an absolutely
            placed tag landed above the shorter ones instead of on them. */}
        <p className="pc-caption-title">
          {SLIDES[index].title}
          <span className="pc-demo-tag">Demo data</span>
        </p>
        <p className="pc-caption-body">{SLIDES[index].body}</p>
      </div>

      <div className="pc-controls">
        <button className="pc-arrow" onClick={() => goTo(index - 1)} aria-label="Previous screen">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className="pc-dots">
          {SLIDES.map((s, i) => (
            <button
              key={s.src}
              className={`pc-dot${i === index ? ' is-current' : ''}`}
              onClick={() => goTo(i)}
              aria-label={`Go to ${s.title}`}
              aria-current={i === index ? 'true' : undefined}
            />
          ))}
        </div>

        <button className="pc-arrow" onClick={() => goTo(index + 1)} aria-label="Next screen">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
