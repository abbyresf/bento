import Mascot from '../Mascot/Mascot';

/* The app's own Bento mascot, as a white-edged sticker. Classic colors, so the
 * site never shows a visitor's chosen scheme. */
export function BentoSticker({ className = '', mood = 'cheer' }) {
  return (
    <span className={`ld-sticker ld-stk ${className}`} aria-hidden="true">
      <Mascot mood={mood} hop={false} color={null} size={120} />
    </span>
  );
}

/* Halls that are live today. Kept here so the marquee never names a hall Bento does not read. */
const LIVE_HALLS = ['Sherman', 'Usdan', 'Kosher Table', 'Warren Towers', 'Marciano Commons', 'West Campus', 'Granby Commons'];

export function HallMarquee({ reverse = false, outline = false }) {
  const run = [...LIVE_HALLS, ...LIVE_HALLS];
  return (
    <div className={`ld-marq${reverse ? ' ld-marq--rev' : ''}${outline ? ' ld-marq--outline' : ''}`} aria-hidden="true">
      <div className="ld-marq-track">
        {run.map((h, i) => (
          <span key={i} className="ld-marq-item">{h}<i /></span>
        ))}
      </div>
    </div>
  );
}
