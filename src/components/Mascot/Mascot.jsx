/* Bento, the mascot, for use anywhere in the app.
 *
 * The same character as in onboarding (the logo with a face), in three moods:
 *   happy   a smile, the default
 *   cheer   arms up and closed happy eyes, for good news
 *   sleepy  eyes closed and a small z, for late at night
 *
 * It idles (a slow breath) and blinks, and hops once when it first appears.
 * Under reduced motion it holds still. `size` is the rendered height in px. */
import { colorFor } from '../../data/mascotColors';
import { useMascotColor } from '../../lib/mascotColor';

const NV = '#24384F', OR = '#FD8F2A', GR = '#77BD3E', CR = '#FDECD7';
const GOLD = '#FFC53D';

/* The closet. Each piece is drawn in the mascot's own coordinates (the body is
   x 14 to 106, y 16 to 102), so it sits right in every mood. `back` pieces are
   drawn before the body, everything else after it. */
const WEAR = {
  gradcap: (
    // Sits on top of the head, not over the colour blocks, so the whole piece is
    // lifted 12 units. The tassel hangs from the right corner of the board.
    <g className="mc-wear" transform="translate(0 -12)">
      <path d="M38 27v9c0 6 44 6 44 0v-9" fill="#1A2A3D" />
      <path d="M60 4L102 19 60 34 18 19z" fill={NV} />
      <path d="M96 20v17" stroke={OR} strokeWidth="3" strokeLinecap="round" />
      <circle cx="96" cy="40" r="4" fill={OR} />
    </g>
  ),
  headband: (
    <g className="mc-wear">
      <path d="M16 36Q60 22 104 36" stroke={OR} strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M16 36Q60 22 104 36" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" strokeDasharray="2 9" opacity="0.7" />
    </g>
  ),
  sunglasses: (
    <g className="mc-wear">
      <rect x="31" y="67" width="27" height="19" rx="8" fill="#1A2A3D" stroke={NV} strokeWidth="3" />
      <rect x="62" y="67" width="27" height="19" rx="8" fill="#1A2A3D" stroke={NV} strokeWidth="3" />
      <path d="M58 74h4" stroke={NV} strokeWidth="3" strokeLinecap="round" />
      <path d="M36 72l8-2M67 72l8-2" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />
    </g>
  ),
  sprout: (
    <g className="mc-wear mc-sway">
      <path d="M60 16V4" stroke={NV} strokeWidth="4" strokeLinecap="round" />
      <path d="M60 7Q44 -3 36 9 52 15 60 7z" fill={GR} stroke={NV} strokeWidth="3" strokeLinejoin="round" />
      <path d="M60 7Q76 -3 84 9 68 15 60 7z" fill={GR} stroke={NV} strokeWidth="3" strokeLinejoin="round" />
    </g>
  ),
  scarf: (
    // One green scarf with one outline and one dash pattern. The tail is drawn
    // first and the wrap over it, so the wrap goes around the neck on top and
    // the tail hangs from underneath it.
    <g className="mc-wear">
      <path d="M82 98V122Q89 127 96 122V98z" fill={GR} stroke={NV} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M89 108V120" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" strokeDasharray="3 6" opacity="0.65" />
      <path d="M17 96Q60 106 103 96" stroke={NV} strokeWidth="14" strokeLinecap="round" fill="none" />
      <path d="M17 96Q60 106 103 96" stroke={GR} strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M17 96Q60 106 103 96" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" strokeDasharray="3 8" opacity="0.65" />
    </g>
  ),
  bowtie: (
    // Under the chin, level with the scarf, not on the face.
    <g className="mc-wear">
      <path d="M60 100L42 91V109z" fill={OR} stroke={NV} strokeWidth="3" strokeLinejoin="round" />
      <path d="M60 100L78 91V109z" fill={OR} stroke={NV} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="60" cy="100" r="5.5" fill={GOLD} stroke={NV} strokeWidth="3" />
    </g>
  ),
  flower: (
    <g className="mc-wear">
      <g transform="translate(88 18)">
        <circle cx="0" cy="-9" r="7" fill="#FF8FA3" stroke={NV} strokeWidth="2.4" />
        <circle cx="9" cy="-2" r="7" fill="#FF8FA3" stroke={NV} strokeWidth="2.4" />
        <circle cx="5" cy="8" r="7" fill="#FF8FA3" stroke={NV} strokeWidth="2.4" />
        <circle cx="-5" cy="8" r="7" fill="#FF8FA3" stroke={NV} strokeWidth="2.4" />
        <circle cx="-9" cy="-2" r="7" fill="#FF8FA3" stroke={NV} strokeWidth="2.4" />
        <circle cx="0" cy="0" r="5" fill={GOLD} stroke={NV} strokeWidth="2.4" />
      </g>
    </g>
  ),
  chefhat: (
    <g className="mc-wear">
      <circle cx="41" cy="9" r="11" fill="#fff" stroke={NV} strokeWidth="3" />
      <circle cx="60" cy="2" r="13" fill="#fff" stroke={NV} strokeWidth="3" />
      <circle cx="79" cy="9" r="11" fill="#fff" stroke={NV} strokeWidth="3" />
      <rect x="35" y="10" width="50" height="22" rx="5" fill="#fff" stroke={NV} strokeWidth="3" />
    </g>
  ),
  partyhat: (
    // The stripes run across the cone, each one ending on its two edges, so
    // they follow its shape. The cone's edges run from (60,-6) to (38,22) and (82,22).
    <g className="mc-wear">
      <path d="M60 -6L82 22H38z" fill={OR} stroke={NV} strokeWidth="3" strokeLinejoin="round" />
      <path d="M53.5 6.5L69.5 9.5M48 13.5L74 17.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
      <circle cx="60" cy="-6" r="5" fill={GOLD} stroke={NV} strokeWidth="2.4" />
    </g>
  ),
  crown: (
    <g className="mc-wear">
      <path d="M34 22L38 2l14 11 8-13 8 13 14-11 4 20z" fill={GOLD} stroke={NV} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="60" cy="14" r="3.4" fill="#FF6B8A" stroke={NV} strokeWidth="1.8" />
      <circle cx="44" cy="17" r="2.4" fill={GR} stroke={NV} strokeWidth="1.6" />
      <circle cx="76" cy="17" r="2.4" fill={GR} stroke={NV} strokeWidth="1.6" />
    </g>
  ),
  cape: (
    <g className="mc-wear mc-cape">
      <path d="M26 38Q-12 66 -4 108Q28 98 60 108Q92 98 124 108Q132 66 94 38z" fill="#E8553A" stroke={NV} strokeWidth="3" strokeLinejoin="round" />
      <path d="M6 94Q14 70 28 56M114 94Q106 70 92 56" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0.45" />
    </g>
  ),
};
const BACK = new Set(['cape']);

/* `color` is a scheme id from data/mascotColors.js. Left out, the mascot wears the
 * signed-in student's own color. A buddy's Bento passes theirs, and null means classic. */
export default function Mascot({ mood = 'happy', size = 64, hop = true, outfit = null, color }) {
  const own = useMascotColor();
  const scheme = colorFor(color === undefined ? own : color);
  const BD = scheme.body, INK = scheme.ink;
  const cheer = mood === 'cheer';
  const sleepy = mood === 'sleepy';
  return (
    <svg
      className={`mc${hop ? ' mc-hop' : ''}`}
      viewBox="-8 -4 136 124"
      style={{ height: size, width: 'auto' }}
      aria-hidden="true"
    >
      <ellipse cx="60" cy="110" rx="32" ry="5" fill="rgba(36,56,80,0.16)" />
      <g className="mc-body">
        {outfit && BACK.has(outfit) && WEAR[outfit]}
        <g fill={BD}>
          <rect x="32" y="96" width="20" height="14" rx="7" />
          <rect x="68" y="96" width="20" height="14" rx="7" />
        </g>
        {cheer ? (
          <>
            <path d="M16 56Q4 44 6 30M104 56Q116 44 114 30" stroke={BD} strokeWidth="7" strokeLinecap="round" fill="none" />
            <circle cx="6" cy="30" r="5" fill={CR} stroke={INK} strokeWidth="3" />
            <circle cx="114" cy="30" r="5" fill={CR} stroke={INK} strokeWidth="3" />
          </>
        ) : (
          <>
            <path d="M16 64Q4 70 7 82M104 64Q116 70 113 82" stroke={BD} strokeWidth="7" strokeLinecap="round" fill="none" />
            <circle cx="7" cy="82" r="5" fill={CR} stroke={INK} strokeWidth="3" />
            <circle cx="113" cy="82" r="5" fill={CR} stroke={INK} strokeWidth="3" />
          </>
        )}
        <rect x="14" y="16" width="92" height="86" rx="28" fill={BD} />
        <circle cx="44" cy="44" r="15" fill={scheme.a} />
        <rect x="62" y="29" width="32" height="30" rx="12" fill={scheme.b} />
        <path d="M21 68h78v14a13 13 0 0 1-13 13H34a13 13 0 0 1-13-13z" fill={CR} />
        {cheer || sleepy ? (
          <g stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none">
            {cheer ? <path d="M40 78q6-8 12 0M68 78q6-8 12 0" /> : <path d="M40 76q6 6 12 0M68 76q6 6 12 0" />}
          </g>
        ) : (
          <g className="mc-eyes">
            <ellipse className="mc-eye" cx="46" cy="77" rx="4.4" ry="5.8" fill={INK} />
            <ellipse className="mc-eye" cx="74" cy="77" rx="4.4" ry="5.8" fill={INK} />
            <circle cx="47.6" cy="74.6" r="1.6" fill="#fff" />
            <circle cx="75.6" cy="74.6" r="1.6" fill="#fff" />
          </g>
        )}
        <ellipse cx="35" cy="86" rx="5.5" ry="3.2" fill="#FF9E86" opacity="0.75" />
        <ellipse cx="85" cy="86" rx="5.5" ry="3.2" fill="#FF9E86" opacity="0.75" />
        {sleepy ? (
          <path d="M54 86q6 4 12 0" stroke={INK} strokeWidth="2.8" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M52 84q8 11 16 0z" fill="#E8553A" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
        )}
        {outfit && !BACK.has(outfit) && WEAR[outfit]}
        {sleepy && <text x="96" y="22" fontSize="18" fontWeight="900" fill={INK} className="mc-z">z</text>}
      </g>
    </svg>
  );
}
