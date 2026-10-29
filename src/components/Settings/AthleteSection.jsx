import { useState } from 'react';
import { useAthlete, updateAthlete, athleteSport } from '../../lib/athlete';
import { useNutritionDisplay } from '../../context/NutritionDisplayContext';
import { LOADS, LOAD_LABELS, athleteSettings, rangesFor, wouldBreakFloor } from '../../utils/athleteTargets';
import { teamsFor, teamById, seasonStatus } from '../../data/athleteTeams';
import './AthleteSection.css';

const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function seasonLine(team) {
  const s = seasonStatus(team, localDate());
  if (s.state === 'in') return `In season until ${shortDate(s.until)}.`;
  if (s.state === 'before') return `Season starts ${shortDate(s.starts)}.`;
  if (s.state === 'after') return `Season ended ${shortDate(s.ended)}.`;
  return null;
}

/* Settings > Athlete. Turn the mode on and pick your team. The team sets the sport's published ranges and, from its schedule,
 * the season. Targets start in the middle of each range, and "Adjust targets" opens the sliders for anyone who wants them.
 * Everything saves as it changes (lib/athlete.js waits for a slider to settle before writing). A change that would put a day
 * under the athlete's resting needs is refused and the last value stays. */
export default function AthleteSection({ onGoProfile }) {
  const athlete = useAthlete();
  const display = useNutritionDisplay();
  const [adjusting, setAdjusting] = useState(false);
  const [note, setNote] = useState(null);

  const teams = teamsFor(athlete.university, athlete.sex);
  const team = teamById(athlete.university, athlete.team);
  const sport = athleteSport(athlete);
  const ranges = rangesFor(sport);
  const body = athlete.body;
  const draft = athlete.custom ?? {};
  const s = athleteSettings(draft, sport);

  const change = (next, lowering) => {
    if (lowering && body && wouldBreakFloor({ ...body, custom: next, sport })) {
      setNote('That would put a day under your resting needs, so Bento kept the last value.');
      return;
    }
    setNote(null);
    updateAthlete({ custom: next });
  };
  const setCarbs = (load, v) => change({ ...draft, carbs: { ...(draft.carbs ?? {}), [load]: v } }, v < s.carbs[load]);
  const setProtein = (v) => change({ ...draft, protein: v }, v < s.protein);
  const setFat = (v) => change({ ...draft, fatShare: v }, v < s.fatShare);
  const resetAll = () => { setNote(null); updateAthlete({ custom: {} }); };

  const grams = (gPerKg) => (body ? ` · ${Math.round(gPerKg * body.weightKg)} g a day` : '');
  const season = team && seasonLine(team);

  return (
    <section className="settings-section athlete-section">
      <h3>Athlete mode</h3>
      <p className="section-note">
        Bento sets your targets from your sport and how hard you train each day. Turn it off and your usual targets come back.
      </p>
      <div className="dietary-toggles">
        <label className={`dietary-toggle ${athlete.athleteMode ? 'active' : ''}`}>
          <input type="checkbox" role="switch" checked={athlete.athleteMode}
            onChange={() => updateAthlete({ athleteMode: !athlete.athleteMode })} />
          <span>Athlete mode</span>
        </label>
      </div>

      {athlete.athleteMode && (<>
        <div className="setting-item athlete-team">
          <label htmlFor="athlete-team">Your team</label>
          {teams.length ? (
            <select id="athlete-team" value={team ? team.id : ''} onChange={(e) => updateAthlete({ team: e.target.value || null })}>
              <option value="">Choose your team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : (
            <p className="section-note">Bento does not list your school's teams yet. Your targets use the general ranges.</p>
          )}
          {season && <p className="athlete-season">{season}</p>}
        </div>

        {!body && (
          <p className="athlete-missing">
            Athlete targets are set per kilogram of body weight. Add your weight in{' '}
            <button type="button" className="athlete-link" onClick={onGoProfile}>Profile</button> to use them.
          </p>
        )}

        <p className="section-note">Pick how hard you train each day on Today. Bento plans more on heavy days.</p>

        {display.anyVisible && (
          <button type="button" className="athlete-adjust" aria-expanded={adjusting} onClick={() => setAdjusting(!adjusting)}>
            {adjusting ? 'Hide target settings' : 'Adjust targets'}
          </button>
        )}

        {adjusting && display.anyVisible && (
          <div className="athlete-sliders">
            {display.carbs && LOADS.map((l) => (
              <Slider key={l} id={`athlete-carbs-${l}`} label={`Carbs on a ${LOAD_LABELS[l].toLowerCase()} day`}
                value={s.carbs[l]} range={ranges.carbs[l]} step={0.5}
                shown={`${s.carbs[l]} g per kg${grams(s.carbs[l])}`} onChange={(v) => setCarbs(l, v)} />
            ))}
            {display.protein && (
              <Slider id="athlete-protein" label="Protein, every day" value={s.protein} range={ranges.protein} step={0.1}
                shown={`${s.protein.toFixed(1)} g per kg${grams(s.protein)}`} onChange={setProtein} />
            )}
            {display.fat && (
              <Slider id="athlete-fat" label="Fat, share of the day" value={Math.round(s.fatShare * 100)}
                range={ranges.fatShare.map((x) => x * 100)} step={1}
                shown={`${Math.round(s.fatShare * 100)}%`} onChange={(v) => setFat(v / 100)} />
            )}
            {note && <p className="athlete-note" role="status">{note}</p>}
            <button type="button" className="btn-secondary" onClick={resetAll}>Back to the starting values</button>
          </div>
        )}

        <p className="athlete-source">
          Ranges follow the {ranges.source}. They are a starting point, not medical advice. A sports dietitian can set numbers
          for you.
        </p>
      </>)}
    </section>
  );
}

function Slider({ id, label, value, range, step, shown, onChange }) {
  return (
    <div className="athlete-slider">
      <div className="athlete-slider-head">
        <label htmlFor={id}>{label}</label>
        <span className="athlete-slider-value">{shown}</span>
      </div>
      <input id={id} type="range" min={range[0]} max={range[1]} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      <div className="athlete-slider-range" aria-hidden="true"><span>{range[0]}</span><span>{range[1]}</span></div>
    </div>
  );
}
