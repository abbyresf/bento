/* Bento, the mascot.
 *
 * The character is the logo itself: the same navy box with the orange dot, the
 * green block and the cream tray, given a face, little arms and feet. Each
 * onboarding step has its own pose and prop, and a line of chat in a speech
 * bubble. Duolingo is the reference: a character with moods does more for a
 * college app than any set of icons, and it makes a long setup feel like a
 * conversation.
 *
 * It is about 90px tall and sits in a row beside its bubble, so it never crops
 * and never adds more than a glance of height. Plain inline SVG and CSS, so
 * there is nothing to download.
 *
 * Coordinates: the body sits at x 14 to 106, y 14 to 100 in a 140 by 120 box.
 * The strip to the right is room for props. */
const NV = '#24384F', OR = '#FD8F2A', GR = '#77BD3E', CR = '#FDECD7';

const SAYS = {
  university: 'Hey! Where do you eat?',
  basics:     "A few quick questions. I won't tell!",
  activity:   'How much do you move?',
  goals:      'What are we aiming for?',
  dietary:    'Anything I should skip?',
  numbers:    'Numbers on or off? Your call.',
  review:     'Look at you! All set!',
};

const Arm = ({ side, raised, className = '' }) => {
  const left = side === 'l';
  const d = raised
    ? (left ? 'M16 56 Q4 44 6 30' : 'M104 56 Q116 44 114 30')
    : (left ? 'M16 62 Q4 68 7 80' : 'M104 62 Q116 68 113 80');
  return (
    <g className={className}>
      <path d={d} stroke={NV} strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx={raised ? (left ? 6 : 114) : (left ? 7 : 113)} cy={raised ? 30 : 80} r="5" fill={CR} stroke={NV} strokeWidth="3" />
    </g>
  );
};

/* Props, one per step. */
const PROPS = {
  university: (
    <g className="m-cap">
      <path d="M60 2L102 17 60 32 18 17z" fill={NV} stroke="#fff" strokeWidth="0" />
      <path d="M38 25v9c0 6 44 6 44 0v-9" fill="#1A2A3D" />
      <g className="m-tassel">
        <path d="M96 18v18" stroke={OR} strokeWidth="3" strokeLinecap="round" />
        <circle cx="96" cy="39" r="4" fill={OR} />
      </g>
    </g>
  ),
  basics: null,
  activity: (
    <>
      <path d="M17 34Q60 20 103 34" stroke={OR} strokeWidth="10" strokeLinecap="round" fill="none" />
      <g className="m-speed" stroke={NV} strokeWidth="3.5" strokeLinecap="round" opacity="0.5">
        <path d="M-4 40h-8M-2 54h-12M-4 68h-8" />
      </g>
    </>
  ),
  goals: (
    <g className="m-flag">
      <path d="M118 28V-2" stroke={NV} strokeWidth="4" strokeLinecap="round" />
      <path className="m-flag-cloth" d="M118 -2l22 7-22 8z" fill={GR} stroke={NV} strokeWidth="3" strokeLinejoin="round" />
    </g>
  ),
  dietary: (
    <g className="m-sprout">
      <path d="M60 14V3" stroke={NV} strokeWidth="4" strokeLinecap="round" />
      <path d="M60 6Q44 -4 36 8 52 14 60 6z" fill={GR} stroke={NV} strokeWidth="3" strokeLinejoin="round" />
      <path d="M60 6Q76 -4 84 8 68 14 60 6z" fill={GR} stroke={NV} strokeWidth="3" strokeLinejoin="round" />
    </g>
  ),
  numbers: (
    <g className="m-bars">
      <rect className="m-bar" style={{ '--i': 0 }} x="118" y="74" width="9" height="22" rx="3" fill={OR} stroke={NV} strokeWidth="2.5" />
      <rect className="m-bar" style={{ '--i': 1 }} x="129" y="58" width="9" height="38" rx="3" fill={GR} stroke={NV} strokeWidth="2.5" />
    </g>
  ),
  review: (
    <g className="m-confetti">
      <circle cx="10" cy="14" r="4" fill={OR} />
      <rect x="116" y="8" width="8" height="8" rx="2" fill={GR} transform="rotate(20 120 12)" />
      <circle cx="124" cy="46" r="3.5" fill="#FF6B8A" />
      <rect x="-2" y="48" width="7" height="7" rx="2" fill={GR} transform="rotate(-18 1 51)" />
      <path d="M118 80l3 6 6 1-5 4 2 6-6-3-6 3 2-6-5-4 6-1z" fill="#FFC53D" stroke={NV} strokeWidth="2" strokeLinejoin="round" />
    </g>
  ),
};

export default function StepArt({ kind }) {
  if (!SAYS[kind]) return null;
  const cheering = kind === 'review';
  const waving = kind === 'university' || kind === 'basics';
  const flagArm = kind === 'goals';

  return (
    <div className="step-mark" aria-hidden="true">
      <svg className="mascot" viewBox="-16 -8 160 124">
        <ellipse className="m-shadow" cx="60" cy="108" rx="34" ry="5" fill="rgba(36,56,80,0.16)" />
        <g className="m-hop">
          <g className="m-feet" fill={NV}>
            <rect x="32" y="94" width="20" height="14" rx="7" />
            <rect x="68" y="94" width="20" height="14" rx="7" />
          </g>

          <Arm side="l" raised={cheering} className={cheering ? 'm-cheer' : ''} />
          <Arm side="r" raised={cheering || flagArm} className={waving ? 'm-wave' : cheering ? 'm-cheer r' : ''} />

          {/* The body is the logo. */}
          <rect x="14" y="14" width="92" height="86" rx="28" fill={NV} />
          <circle cx="44" cy="42" r="15" fill={OR} />
          <rect x="62" y="27" width="32" height="30" rx="12" fill={GR} />
          <path d="M21 66h78v14a13 13 0 0 1-13 13H34a13 13 0 0 1-13-13z" fill={CR} />

          {/* The face lives on the tray. */}
          {cheering ? (
            <g stroke={NV} strokeWidth="3.4" strokeLinecap="round" fill="none">
              <path d="M40 76q6-8 12 0M68 76q6-8 12 0" />
            </g>
          ) : (
            <g className="m-eyes">
              <ellipse className="m-eye" cx="46" cy="75" rx="4.4" ry="5.8" fill={NV} />
              <ellipse className="m-eye" cx="74" cy="75" rx="4.4" ry="5.8" fill={NV} />
              <circle cx="47.6" cy="72.6" r="1.6" fill="#fff" />
              <circle cx="75.6" cy="72.6" r="1.6" fill="#fff" />
            </g>
          )}
          <ellipse cx="35" cy="84" rx="5.5" ry="3.2" fill="#FF9E86" opacity="0.75" />
          <ellipse cx="85" cy="84" rx="5.5" ry="3.2" fill="#FF9E86" opacity="0.75" />
          <path d="M52 82q8 11 16 0z" fill="#E8553A" stroke={NV} strokeWidth="2.6" strokeLinejoin="round" />

          {PROPS[kind]}
        </g>
      </svg>
      <div className="step-bubble">{SAYS[kind]}</div>
    </div>
  );
}
