/* The streak art: one bento box, seen from above, that packs itself over time.
 *
 * Drawn from the original illustration (data/badgeArt.js, built by scripts/build-badge-art.py),
 * split into the ten stages of a lunch being packed:
 *   1  First Grain      a first mound of rice
 *   2  Rice Packed      the rice fills its compartment, with sesame and a band of nori
 *   3  Greens In        the green leaf divider, and edamame
 *   4  Greens Packed    broccoli and a pea shoot
 *   5  Protein In       two rolls of tamagoyaki
 *   6  Protein Packed   a yakitori skewer
 *   7  Fruit In         orange slices and a cherry
 *   8  Fruit Packed     the pleated paper cup
 *   9  Garnished        a pickled plum on the rice, and the little fish soy bottle
 *   10 Full Box         steam and chopsticks: ready to eat
 *
 * `level` is 0 to 10 and matches `fill` in data/badges.js. Level 0 is the empty tray. `ghost`
 * draws the next piece faintly so the box shows what is coming. `justAdded` makes the newest
 * piece drop in, for the celebration.
 *
 * The original has no empty compartments, and its dark outlines were one shape shared by every
 * item, so the tray and compartments are drawn here and each item's outline is rebuilt from its
 * own shapes. Everything is in the original's 1024 coordinates. */
import { useId } from 'react';
import { ART } from '../../data/badgeArt';
import { clampLevel, piecesAt, ghostPieces, arrivedAt } from '../../data/badgeBox';
import './BentoBox.css';

const DARK = '#0C192F';
const NAVY = '#243859';
const WELL = '#1A2D48';
const OUTLINE = 9;
const THIN = 6;

const NAMES = [
  'an empty bento box', 'a first mound of rice', 'rice with sesame and nori', 'a leaf divider and edamame',
  'broccoli and a pea shoot', 'two rolls of tamagoyaki', 'tamagoyaki and a skewer', 'orange slices and a cherry',
  'a paper cup, oranges and a cherry', 'a pickled plum and a fish soy bottle', 'a full bento box with steam and chopsticks',
];

const Paths = ({ group }) => ART[group].paths.map(([fill, d], i) => <path key={i} fill={fill} d={d} />);

function Outline({ group, width = OUTLINE }) {
  return <path d={ART[group].outline} fill={DARK} stroke={DARK} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" />;
}

/* One item, drawn with its outline underneath. `ids` carries this instance's clip path ids, so
 * several boxes on one screen never share them. */
function Piece({ name, ids }) {
  switch (name) {
    case 'mound':
      return (
        <g clipPath={`url(#${ids.left})`}>
          <g clipPath={`url(#${ids.mound})`}><RiceBody ids={ids} /></g>
          <ellipse cx="325" cy="892" rx="185" ry="100" fill="none" stroke={DARK} strokeWidth="8" />
        </g>
      );
    case 'rice':
      return <g clipPath={`url(#${ids.left})`}><RiceBody ids={ids} /></g>;
    case 'nori':
      return <g clipPath={`url(#${ids.left})`}><rect x="150" y="668" width="360" height="99" fill="#2D292D" /><Paths group="nori" /></g>;
    case 'tamago':
      return (
        <g>
          {/* The second roll was traced around the skewer, so the skewer's footprint is a bite out of it. A full
              roll goes underneath, and the darker orange of its right end is drawn on top with a clean edge,
              so it looks whole while the skewer is not there yet. */}
          <rect x="668" y="429" width="150" height="189" rx="42" fill="#FEA13C" stroke={DARK} strokeWidth={OUTLINE} />
          <Outline group="tamago" /><Paths group="tamago" />
          <path d="M764 429H776A42 42 0 0 1 818 471V576A42 42 0 0 1 776 618H764Q754 523 764 429Z" fill="#DC661D" />
        </g>
      );
    case 'chop':
      return <g><Outline group="chop" width={THIN} /><Paths group="chop" /></g>;
    case 'steam':
      return (
        <g>
          <path fill="#F3E9CD" d={ART.steam.paths[0][1]} clipPath={`url(#${ids.steam[0]})`} />
          <path fill="#F3E9CD" d={ART.steam.paths[1][1]} clipPath={`url(#${ids.steam[1]})`} />
          <path fill="#F3E9CD" d={ART.steam.paths[2][1]} clipPath={`url(#${ids.steam[2]})`} />
          {ART.steam.wisps.map((pts, i) => <polygon key={i} className="bb-steam" style={{ animationDelay: `${i * 0.6}s` }} fill="#F3E9CD" points={pts} />)}
        </g>
      );
    default:
      return ART[name].outline ? <g><Outline group={name} /><Paths group={name} /></g> : <g><Paths group={name} /></g>;
  }
}

/* Bumpy rice edge for the two stretches the original hides: the top under the steam, and the bottom under
 * the chopsticks. Same size of bump as the edge the original draws. */
function bumps(x0, x1, y, rise, step) {
  let d = '';
  const dir = x1 >= x0 ? 1 : -1;
  for (let x = x0; dir * (x1 - x) > 0.1; x += dir * step) d += `Q${x + dir * step / 2} ${y + rise} ${x + dir * step} ${y}`;
  return d;
}
const TOP_EDGE = `M180 172${bumps(180, 450, 172, -12, 18)}`;
const riceTopClip = `M100 148H180V172${bumps(180, 450, 172, -12, 18)}V148H520V900H100Z`;
function leftBumps(x, y0, y1, rise, step) {
  let d = '';
  for (let y = y0; y - step >= y1 - 0.1; y -= step) d += `Q${x + rise} ${y - step / 2} ${x} ${y - step}`;
  return d;
}
const gapShape = (grow) => `M150 190H510V${862 + grow}${bumps(510, 150, 862 + grow, 14, 18)}${leftBumps(150, 862 + grow, 190, -11, 18)}Z`;

/* The rice. Its own shapes carry the bumpy edge, so the outline is rebuilt from them. The rice was traced
 * around the chopsticks and the steam, which left gaps where they lie. Those are filled with rice color
 * underneath (clipped so the bumps along the top, bottom and left stay as they were drawn). */
function GapShapes({ fill, stroke, width }) {
  return (
    <g fill={fill} stroke={stroke} strokeWidth={width} strokeLinejoin="round">
      {ART.riceGap.paths.map(([, d], i) => <path key={i} d={d} />)}
      {ART.steam.paths.map(([, d], i) => <path key={`s${i}`} d={d} />)}
      <rect x="420" y="170" width="88" height="700" rx="26" />
      <path d="M150 400L150 676L228 676Z" />
    </g>
  );
}

function RiceBody({ ids }) {
  return (
    <g clipPath={`url(#${ids.top})`}>
      <Outline group="rice" />
      {/* a dark rim under the filler, so the filled stretch gets an outline like the rest of the rice */}
      <g clipPath={`url(#${ids.gapOuter})`}><GapShapes fill={DARK} stroke={DARK} width={39} /></g>
      <g clipPath={`url(#${ids.gap})`}><GapShapes fill="#F1EEE6" stroke="#F1EEE6" width={30} /></g>
      <Paths group="rice" />
      <path d={TOP_EDGE} fill="none" stroke={DARK} strokeWidth="8" strokeLinejoin="round" />
    </g>
  );
}

export default function BentoBox({ level = 0, size = 120, ghost = false, justAdded = false, className = '' }) {
  const lv = clampLevel(level);
  const uid = useId().replace(/:/g, '');
  const ids = {
    left: `${uid}left`, mound: `${uid}mound`, gap: `${uid}gap`, gapOuter: `${uid}gapo`, top: `${uid}top`,
    steam: [`${uid}sa`, `${uid}sb`, `${uid}sc`],
  };
  const fresh = justAdded ? new Set(arrivedAt(lv)) : new Set();
  const cuts = ART.steam.cuts;
  return (
    <svg
      viewBox="50 15 940 980" width={size} height={size * (980 / 940)}
      className={`bb${className ? ` ${className}` : ''}`}
      role="img" aria-label={lv >= 10 ? 'A full bento box' : lv === 0 ? 'An empty bento box' : `A bento box with ${NAMES[lv]}`}
    >
      <defs>
        <clipPath id={ids.left}><rect x="140" y="148" width="372" height="740" rx="62" /></clipPath>
        <clipPath id={ids.mound}><ellipse cx="325" cy="892" rx="185" ry="100" /></clipPath>
        <clipPath id={ids.gap}><path d={gapShape(0)} /></clipPath>
        <clipPath id={ids.gapOuter}><path d={gapShape(6)} /></clipPath>
        <clipPath id={ids.top}><path d={riceTopClip} /></clipPath>
        {cuts.map((y, i) => <clipPath key={i} id={ids.steam[i]}><rect x="0" y={y} width="1100" height="1100" /></clipPath>)}
      </defs>
      <rect x="108" y="118" width="806" height="798" rx="88" fill={NAVY} stroke={DARK} strokeWidth="9" />
      <rect x="140" y="148" width="372" height="740" rx="62" fill={WELL} stroke={DARK} strokeWidth="8" />
      <rect x="540" y="142" width="352" height="240" rx="60" fill={WELL} stroke={DARK} strokeWidth="8" />
      <rect x="540" y="400" width="352" height="222" rx="60" fill={WELL} stroke={DARK} strokeWidth="8" />
      <rect x="540" y="642" width="352" height="248" rx="60" fill={WELL} stroke={DARK} strokeWidth="8" />
      {ghost && ghostPieces(lv).map((p) => (
        <g key={`ghost-${p.name}`} className="bb-ghost"><Piece name={p.name} ids={ids} /></g>
      ))}
      {piecesAt(lv).map((p) => (
        <g key={p.name} className={fresh.has(p.name) ? 'bb-new' : undefined}><Piece name={p.name} ids={ids} /></g>
      ))}
    </svg>
  );
}
