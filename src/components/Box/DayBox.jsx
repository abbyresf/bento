import { useState } from 'react';
import Glyph from './Glyphs';
import CountUp from '../common/CountUp';
import { glyphsFor } from '../../utils/foodGlyph';
import { boxVoice } from '../../utils/boxVoice';
import { haptics } from '../../lib/haptics';
import './DayBox.css';

/* Today as a lunchbox. The three compartments are the three shapes in the Bento logo: the orange circle is breakfast, the
 * fern block is lunch, the cream strip is dinner. A planned meal shows the food in it, a confirmed meal gets a check, and
 * when every meal Bento is planning is confirmed the lid closes. Tapping a compartment opens that meal below.
 *
 * meals: [{ id, active, items, confirmed, note }] in day order. `note` replaces the label when a meal is off ("skipped",
 * "eating out"). */
const NV = '#24384F';

// Where each compartment's food goes, by how many glyphs it holds. [x, y] centres in the 340 by 250 box.
const SPOTS = {
  breakfast: { 1: [[96, 76]], 2: [[78, 78], [114, 78]], 3: [[96, 58], [77, 92], [115, 92]], size: 34 },
  lunch: { 1: [[245, 79]], 2: [[224, 79], [266, 79]], 3: [[212, 79], [245, 79], [278, 79]], size: 38 },
  dinner: { 1: [[171, 196]], 2: [[142, 196], [200, 196]], 3: [[113, 196], [171, 196], [229, 196]], size: 44 },
};
const LABEL = { breakfast: [96, 123, 'middle'], lunch: [245, 118, 'middle'], dinner: [171, 172, 'middle'] };
const FILL = { breakfast: '#FD8F2A', lunch: '#77BE3D', dinner: '#FEEAD7' };

function Compartment({ meal, index, onOpen }) {
  const { id, active, items = [], confirmed, note } = meal;
  const glyphs = active ? glyphsFor(items, id === 'dinner' ? 3 : id === 'breakfast' ? 3 : 3) : [];
  const spots = SPOTS[id][glyphs.length] ?? [];
  const planned = glyphs.length > 0;
  const [lx, ly, anchor] = LABEL[id];
  const fillOpacity = !active ? 0.18 : planned ? 1 : 0.3;
  const shape = id === 'breakfast'
    ? <circle cx="96" cy="84" r="56" />
    : id === 'lunch'
      ? <rect x="170" y="28" width="150" height="102" rx="30" />
      : <rect x="22" y="150" width="298" height="80" rx="30" />;
  const check = { breakfast: [136, 44], lunch: [296, 48], dinner: [298, 172] }[id];
  const dark = id === 'dinner';
  return (
    <g
      className="daybox-comp pop-in"
      style={{ '--i': index + 1, transformBox: 'fill-box', transformOrigin: 'center' }}
      role="button" tabIndex={0}
      aria-label={`${id}${note ? `, ${note}` : planned ? (confirmed ? ', confirmed' : ', planned') : ', nothing planned'}`}
      onClick={() => { haptics.selection(); onOpen?.(id); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(id); } }}
    >
      <g fill={active ? FILL[id] : '#FEEAD7'} fillOpacity={fillOpacity} stroke={active ? 'none' : '#6B7F95'} strokeWidth="2" strokeDasharray={active ? undefined : '6 6'}>
        {shape}
      </g>
      {active && !planned && <g fill="none" stroke={dark ? '#C9B79B' : '#fff'} strokeOpacity="0.55" strokeWidth="2" strokeDasharray="5 7">{shape}</g>}
      {glyphs.map((g, i) => {
        const [x, y] = spots[i];
        return (
          <g key={g} transform={`translate(${x - SPOTS[id].size / 2} ${y - SPOTS[id].size / 2})`} className="daybox-glyph" style={{ '--g': i }}>
            <Glyph id={g} size={SPOTS[id].size} />
          </g>
        );
      })}
      <text x={lx} y={ly} textAnchor={anchor} className={`daybox-label${dark ? ' dark' : ''}`}>
        {note ?? id}
      </text>
      {confirmed && active && planned && (
        <g className="daybox-check" transform={`translate(${check[0]} ${check[1]})`}>
          <circle r="13" fill={NV} />
          <path d="M-6 0.5L-1.5 5L6.5 -4.5" fill="none" stroke="#FFFDF9" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </g>
  );
}

export default function DayBox({ meals, calories, calorieTarget, protein, seed = 0, onOpenMeal }) {
  const active = meals.filter((m) => m.active);
  const packed = active.length > 0 && active.every((m) => m.confirmed);
  const [peek, setPeek] = useState(false);
  const closed = packed && !peek;
  const line = boxVoice({ meals, seed });

  return (
    <section className="daybox" aria-label="Today's box">
      <p className="daybox-kicker">today</p>
      <h2 className="daybox-line">{line}</h2>
      <div className="daybox-numbers">
        <div><span className="daybox-n"><CountUp value={Math.round(calories)} duration={900} group /></span><span className="daybox-u">{calorieTarget ? `of ${Math.round(calorieTarget).toLocaleString()} cal` : 'cal'}</span></div>
        <div><span className="daybox-n"><CountUp value={Math.round(protein)} duration={900} /></span><span className="daybox-u">g protein</span></div>
      </div>
      <svg className="daybox-svg" viewBox="0 0 340 250" role="group" aria-label="Breakfast, lunch and dinner">
        <rect x="4" y="4" width="332" height="242" rx="46" fill={NV} />
        {meals.map((m, i) => <Compartment key={m.id} meal={m} index={i} onOpen={onOpenMeal} />)}
        <g
          className={`daybox-lid${closed ? ' closed' : ' open'}`}
          onClick={() => { if (packed) { haptics.medium(); setPeek((p) => !p); } }}
          role={packed ? 'button' : undefined} tabIndex={packed ? 0 : undefined}
          aria-label={packed ? (closed ? 'Lid is on. Tap to look inside' : 'Tap to close the lid') : undefined}
          style={{ pointerEvents: packed ? 'auto' : 'none' }}
        >
          <rect x="4" y="4" width="332" height="242" rx="46" fill="#2E4764" stroke={NV} strokeWidth="6" />
          <rect x="22" y="22" width="296" height="206" rx="34" fill="none" stroke="#3F5C7C" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
          <circle cx="116" cy="125" r="24" fill="#FD8F2A" />
          <rect x="150" y="101" width="74" height="48" rx="16" fill="#77BE3D" />
          <text x="170" y="196" textAnchor="middle" className="daybox-lid-text">packed</text>
        </g>
      </svg>
      {packed && <p className="daybox-peek">{closed ? 'tap the lid to peek' : 'tap to close the lid'}</p>}
    </section>
  );
}
