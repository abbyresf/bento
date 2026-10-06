/* The mark at the head of each onboarding step.
 *
 * One system, not seven pictures: a rounded-square tile in the style of an Apple
 * app icon, a single bold glyph drawn in one consistent stroke, and a small
 * caption beside it. The tile is 72px, so it never crowds the headline, never
 * crops, and never adds scroll.
 *
 * Every glyph is drawn on the same 48-unit grid with the same round-capped
 * stroke, so they read as a set. Motion is the same for all of them too: the
 * tile springs in, the glyph draws itself on, a band of light crosses once, and
 * a soft glow breathes behind it. */
const GLYPHS = {
  // Columns under a pediment.
  university: (
    <>
      <path pathLength="1" d="M8 19L24 9l16 10z" />
      <path pathLength="1" d="M12 22v13M20 22v13M28 22v13M36 22v13" />
      <path pathLength="1" d="M8 39h32" />
    </>
  ),
  // A person.
  basics: (
    <>
      <circle pathLength="1" cx="24" cy="16" r="7" />
      <path pathLength="1" d="M10 40c1-9 6-14 14-14s13 5 14 14" />
    </>
  ),
  // A bolt.
  activity: <path pathLength="1" d="M27 6L12 27h11l-2 15 15-22H25z" />,
  // A target.
  goals: (
    <>
      <circle pathLength="1" cx="24" cy="24" r="16" />
      <circle pathLength="1" cx="24" cy="24" r="8" />
      <circle pathLength="1" cx="24" cy="24" r="1.6" fill="currentColor" />
    </>
  ),
  // A leaf.
  dietary: (
    <>
      <path pathLength="1" d="M10 36C8 20 18 9 38 9c1 20-9 30-24 28" />
      <path pathLength="1" d="M10 38C16 28 24 22 32 17" />
    </>
  ),
  // Three bars.
  numbers: <path pathLength="1" d="M12 38V26M24 38V12M36 38V20" />,
  // A check.
  review: <path pathLength="1" d="M11 25l9 9 18-20" />,
};

const META = {
  university: ['Campus',   'orange'],
  basics:     ['About you', 'navy'],
  activity:   ['Activity',  'green'],
  goals:      ['Goal',      'orange'],
  dietary:    ['Diet',      'green'],
  numbers:    ['Numbers',   'navy'],
  review:     ['Your plan', 'orange'],
};

export default function StepArt({ kind }) {
  const glyph = GLYPHS[kind];
  if (!glyph) return null;
  const [caption, tone] = META[kind];
  return (
    <div className={`step-mark tone-${tone}`} aria-hidden="true">
      <div className="step-mark-tile">
        <span className="step-mark-glow" />
        <svg viewBox="0 0 48 48" className="step-mark-glyph">{glyph}</svg>
        <span className="step-mark-sheen" />
      </div>
      <span className="step-mark-caption">{caption}</span>
    </div>
  );
}
