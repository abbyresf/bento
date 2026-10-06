/* Bento, the mascot, for use anywhere in the app.
 *
 * The same character as in onboarding (the logo with a face), in three moods:
 *   happy   a smile, the default
 *   cheer   arms up and closed happy eyes, for good news
 *   sleepy  eyes closed and a small z, for late at night
 *
 * It idles (a slow breath) and blinks, and hops once when it first appears.
 * Under reduced motion it holds still. `size` is the rendered height in px. */
const NV = '#24384F', OR = '#FD8F2A', GR = '#77BD3E', CR = '#FDECD7';

export default function Mascot({ mood = 'happy', size = 64, hop = true }) {
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
        <g fill={NV}>
          <rect x="32" y="96" width="20" height="14" rx="7" />
          <rect x="68" y="96" width="20" height="14" rx="7" />
        </g>
        {cheer ? (
          <>
            <path d="M16 56Q4 44 6 30M104 56Q116 44 114 30" stroke={NV} strokeWidth="7" strokeLinecap="round" fill="none" />
            <circle cx="6" cy="30" r="5" fill={CR} stroke={NV} strokeWidth="3" />
            <circle cx="114" cy="30" r="5" fill={CR} stroke={NV} strokeWidth="3" />
          </>
        ) : (
          <>
            <path d="M16 64Q4 70 7 82M104 64Q116 70 113 82" stroke={NV} strokeWidth="7" strokeLinecap="round" fill="none" />
            <circle cx="7" cy="82" r="5" fill={CR} stroke={NV} strokeWidth="3" />
            <circle cx="113" cy="82" r="5" fill={CR} stroke={NV} strokeWidth="3" />
          </>
        )}
        <rect x="14" y="16" width="92" height="86" rx="28" fill={NV} />
        <circle cx="44" cy="44" r="15" fill={OR} />
        <rect x="62" y="29" width="32" height="30" rx="12" fill={GR} />
        <path d="M21 68h78v14a13 13 0 0 1-13 13H34a13 13 0 0 1-13-13z" fill={CR} />
        {cheer || sleepy ? (
          <g stroke={NV} strokeWidth="3.4" strokeLinecap="round" fill="none">
            {cheer ? <path d="M40 78q6-8 12 0M68 78q6-8 12 0" /> : <path d="M40 76q6 6 12 0M68 76q6 6 12 0" />}
          </g>
        ) : (
          <g className="mc-eyes">
            <ellipse className="mc-eye" cx="46" cy="77" rx="4.4" ry="5.8" fill={NV} />
            <ellipse className="mc-eye" cx="74" cy="77" rx="4.4" ry="5.8" fill={NV} />
            <circle cx="47.6" cy="74.6" r="1.6" fill="#fff" />
            <circle cx="75.6" cy="74.6" r="1.6" fill="#fff" />
          </g>
        )}
        <ellipse cx="35" cy="86" rx="5.5" ry="3.2" fill="#FF9E86" opacity="0.75" />
        <ellipse cx="85" cy="86" rx="5.5" ry="3.2" fill="#FF9E86" opacity="0.75" />
        {sleepy ? (
          <path d="M54 86q6 4 12 0" stroke={NV} strokeWidth="2.8" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M52 84q8 11 16 0z" fill="#E8553A" stroke={NV} strokeWidth="2.6" strokeLinejoin="round" />
        )}
        {sleepy && <text x="96" y="22" fontSize="18" fontWeight="900" fill={NV} className="mc-z">z</text>}
      </g>
    </svg>
  );
}
