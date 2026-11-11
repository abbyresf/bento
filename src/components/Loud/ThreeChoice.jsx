import { REACTIONS, reactionFor } from './reactions.js';
import { haptics } from '../../lib/haptics';
import './loud.css';

/* Not good, Fine, Loved it. One control everywhere a dish is rated in the Loud pilot: the rating sheet, onboarding
 * staples and My Ratings. `value` is stars (0 for none). `allowClear` lets a second tap on the chosen answer clear it,
 * and a cleared answer shows as plainly unselected. Without it, a second tap does nothing, so a rating never vanishes
 * by accident. */
export default function ThreeChoice({ value, onChange, allowClear = false, label }) {
  const current = reactionFor(value);
  return (
    <div className="loud-react" role="group" aria-label={label}>
      {REACTIONS.map((r) => (
        <button
          key={r.stars}
          type="button"
          className={r.cls}
          aria-pressed={current === r.stars}
          onClick={() => {
            if (current === r.stars) { if (allowClear) { haptics.selection(); onChange(0); } return; }
            haptics.selection();
            onChange(r.stars);
          }}
        >{r.label}</button>
      ))}
    </div>
  );
}
