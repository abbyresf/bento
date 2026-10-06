/* One animated illustration per onboarding step.
 *
 * Plain inline SVG animated with CSS, so there is no image to download and no
 * animation library. Every shape is drawn in the logo's colours. Strokes draw
 * themselves on, fills pop in, and a few things keep moving once the scene has
 * landed, so the screen is never entirely still. */
const OR = '#FD8F2A', GR = '#77BD3E', NV = '#24384F', CR = '#FDECD7';

const ART = {
  // A campus: dome, columns and steps, with a flag that waves.
  university: (
    <>
      <path className="draw" d="M30 112h100M40 112V76M62 112V76M98 112V76M120 112V76M32 76h96" stroke={NV} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path className="pop" style={{ '--d': '700ms' }} d="M38 76a42 42 0 0 1 84 0z" fill={OR} />
      <path className="draw" style={{ '--d': '500ms' }} d="M80 34V16" stroke={NV} strokeWidth="4" strokeLinecap="round" />
      <path className="flag" d="M80 16l22 7-22 7z" fill={GR} />
    </>
  ),
  // A person on a scale, the figure dropping onto it.
  basics: (
    <>
      <rect className="pop" x="34" y="98" width="92" height="22" rx="8" fill={NV} />
      <rect className="pop" style={{ '--d': '120ms' }} x="50" y="104" width="60" height="6" rx="3" fill={CR} />
      <g className="drop">
        <circle cx="80" cy="40" r="15" fill={OR} />
        <path d="M54 94c0-20 11-32 26-32s26 12 26 32z" fill={GR} />
      </g>
    </>
  ),
  // A bolt of energy inside a ring that pulses.
  activity: (
    <>
      <circle className="ring" cx="80" cy="66" r="48" stroke={GR} strokeWidth="5" fill="none" />
      <circle className="ring b" cx="80" cy="66" r="48" stroke={OR} strokeWidth="3" fill="none" />
      <path className="pop bolt" style={{ '--d': '300ms' }} d="M88 24L56 74h20l-8 36 36-54H80z" fill={OR} stroke={NV} strokeWidth="4" strokeLinejoin="round" />
    </>
  ),
  // A target, with the arrow thudding into the centre.
  goals: (
    <>
      <circle className="pop" cx="80" cy="66" r="48" fill={CR} stroke={NV} strokeWidth="5" />
      <circle className="pop" style={{ '--d': '120ms' }} cx="80" cy="66" r="30" fill={GR} />
      <circle className="pop" style={{ '--d': '220ms' }} cx="80" cy="66" r="13" fill={OR} />
      <g className="arrow">
        <path d="M80 66L140 6" stroke={NV} strokeWidth="5" strokeLinecap="round" />
        <path d="M128 4l14 0 0 14" stroke={NV} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  ),
  // A bowl that fills, with leaves rising out of it.
  dietary: (
    <>
      <path className="pop" d="M24 70h112c0 30-24 48-56 48S24 100 24 70z" fill={NV} />
      <path className="fillup" d="M34 74h92c-2 22-20 36-46 36S36 96 34 74z" fill={GR} />
      <path className="leaf l1" d="M60 70c-14-22-4-40 14-44 4 20-2 34-14 44z" fill={OR} />
      <path className="leaf l2" d="M90 70c-4-22 8-38 28-38 0 20-12 34-28 38z" fill={GR} stroke={NV} strokeWidth="3" />
    </>
  ),
  // Bars that grow to different heights.
  numbers: (
    <>
      <rect className="bar" style={{ '--h': '58px', '--d': '0ms' }} x="26" y="30" width="26" height="86" rx="6" fill={OR} />
      <rect className="bar" style={{ '--h': '86px', '--d': '120ms' }} x="62" y="30" width="26" height="86" rx="6" fill={GR} />
      <rect className="bar" style={{ '--h': '44px', '--d': '240ms' }} x="98" y="30" width="26" height="86" rx="6" fill={NV} />
      <path className="draw" style={{ '--d': '600ms' }} d="M22 120h108" stroke={NV} strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  // A badge with a check, and rays.
  review: (
    <>
      <g className="rays">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M80 6v14" stroke={OR} strokeWidth="5" strokeLinecap="round" transform={`rotate(${i * 30} 80 66)`} />
        ))}
      </g>
      <circle className="pop" style={{ '--d': '120ms' }} cx="80" cy="66" r="38" fill={GR} stroke={NV} strokeWidth="5" />
      <path className="draw" style={{ '--d': '520ms' }} d="M62 68l13 13 25-27" stroke="#fff" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export default function StepArt({ kind }) {
  const art = ART[kind];
  if (!art) return null;
  return (
    <svg className={`step-art art-${kind}`} viewBox="0 0 160 132" aria-hidden="true">
      {art}
    </svg>
  );
}
