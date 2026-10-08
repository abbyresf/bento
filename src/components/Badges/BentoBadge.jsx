/* The badge art: one bento box, seen from above, filling up.
 *
 * Drawn rather than shipped as images. Ten tiers as PNGs would be ten assets to
 * load and re-export every time a colour changes; as SVG it is weightless, sharp
 * at any size, and the box outline can follow the theme so it does not vanish on
 * the navy ground.
 *
 * `level` is 0 to 10 and matches `fill` in data/badges.js. Every element below
 * declares the level it appears at, so the same component draws a locked empty
 * box, any intermediate tier, and the finished box.
 *
 * Colour discipline: only the four logo colours. Fruit is small orange segments
 * rather than a new hue, so nothing off-palette creeps in. The box outline and
 * interior read from tokens with literal fallbacks, because the token layer is
 * still an unmerged branch.
 */

// A shade deeper than the brand cream. #FEEAD7 sits almost exactly on the light
// card surface, so rice drawn in it showed only its outline and read as rings
// rather than grains. This keeps the cream family and still reads on navy.
const RICE   = '#F7E0C3';
const FERN   = '#77BE3D';
const ORANGE = '#FD8F2A';

export default function BentoBadge({ level = 0, size = 64, className = '' }) {
  const on = (n) => level >= n;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={level >= 10 ? 'A full bento box' : `A bento box, ${level} of 10 filled`}
    >
      {/* Box body. Stroke follows the theme so the outline survives on navy. */}
      <rect
        x="7" y="10" width="86" height="80" rx="14"
        fill="var(--surface, #FFFDF9)"
        stroke="var(--text-primary, #24384F)"
        strokeWidth="5"
      />

      {/* Dividers: one big compartment on the left, three stacked on the right. */}
      <g stroke="var(--text-primary, #24384F)" strokeWidth="3" strokeLinecap="round" opacity="0.9">
        <line x1="52" y1="14" x2="52" y2="86" />
        <line x1="52" y1="37" x2="89" y2="37" />
        <line x1="52" y1="63" x2="89" y2="63" />
      </g>

      {/* ── Rice, left compartment ── */}
      {on(1) && (
        <g>
          {/* A few grains: the box has been started, not filled. Solid, with a
              hairline only, so they read as rice and not as rings. */}
          <ellipse cx="23" cy="68" rx="6.5" ry="4.2" fill={RICE} stroke="var(--text-primary, #24384F)" strokeWidth="1.2" transform="rotate(-18 23 68)" />
          <ellipse cx="34" cy="74" rx="6.5" ry="4.2" fill={RICE} stroke="var(--text-primary, #24384F)" strokeWidth="1.2" transform="rotate(12 34 74)" />
          <ellipse cx="27" cy="79" rx="6" ry="4" fill={RICE} stroke="var(--text-primary, #24384F)" strokeWidth="1.2" transform="rotate(-6 27 79)" />
        </g>
      )}
      {on(2) && (
        <g>
          {/* Compartment packed. Drawn over the grains so it reads as filling up. */}
          <rect
            x="14" y="20" width="32" height="60" rx="9"
            fill={RICE} stroke="var(--text-primary, #24384F)" strokeWidth="3"
          />
          {/* Sesame, so the rice is not a blank slab */}
          <circle cx="24" cy="34" r="1.8" fill="var(--text-primary, #24384F)" opacity="0.55" />
          <circle cx="34" cy="45" r="1.8" fill="var(--text-primary, #24384F)" opacity="0.55" />
          <circle cx="22" cy="58" r="1.8" fill="var(--text-primary, #24384F)" opacity="0.55" />
          <circle cx="33" cy="68" r="1.8" fill="var(--text-primary, #24384F)" opacity="0.55" />
        </g>
      )}

      {/* ── Greens, top right ── */}
      {on(3) && (
        <circle cx="63" cy="26" r="7" fill={FERN} stroke="var(--text-primary, #24384F)" strokeWidth="2.5" />
      )}
      {on(4) && (
        <g stroke="var(--text-primary, #24384F)" strokeWidth="2.5">
          <circle cx="76" cy="22" r="6" fill={FERN} />
          <circle cx="80" cy="31" r="5" fill={FERN} />
        </g>
      )}

      {/* ── Protein, middle right ── */}
      {on(5) && (
        <rect x="57" y="44" width="15" height="11" rx="3.5"
              fill={ORANGE} stroke="var(--text-primary, #24384F)" strokeWidth="2.5" />
      )}
      {on(6) && (
        <rect x="74" y="44" width="15" height="11" rx="3.5"
              fill={ORANGE} stroke="var(--text-primary, #24384F)" strokeWidth="2.5" />
      )}

      {/* ── Fruit, bottom right. Orange segments, so no new hue enters. ── */}
      {on(7) && (
        <circle cx="63" cy="75" r="6" fill={ORANGE} stroke="var(--text-primary, #24384F)" strokeWidth="2.5" />
      )}
      {on(8) && (
        <g stroke="var(--text-primary, #24384F)" strokeWidth="2.5">
          <circle cx="77" cy="71" r="5.5" fill={ORANGE} />
          <circle cx="79" cy="81" r="4.5" fill={ORANGE} />
        </g>
      )}

      {/* ── Garnish: the divider leaf that sits in a real bento ── */}
      {on(9) && (
        <path
          d="M46 24 q8 12 0 24 q-6 -12 0 -24 z"
          fill={FERN} stroke="var(--text-primary, #24384F)" strokeWidth="2"
        />
      )}

      {/* ── Finished: chopsticks resting across the packed box ──
           Cream with a hairline, so they read as light wood over the orange
           food rather than merging into it. Kept inside the viewBox. */}
      {on(10) && (
        <g stroke="var(--text-primary, #24384F)" strokeWidth="1.4" strokeLinecap="round">
          <line x1="16" y1="83" x2="88" y2="34" stroke="#FEEAD7" strokeWidth="5.5" />
          <line x1="16" y1="83" x2="88" y2="34" strokeWidth="1.2" fill="none" opacity="0.85" />
          <line x1="20" y1="89" x2="92" y2="40" stroke="#FEEAD7" strokeWidth="5.5" />
          <line x1="20" y1="89" x2="92" y2="40" strokeWidth="1.2" fill="none" opacity="0.85" />
        </g>
      )}
    </svg>
  );
}
