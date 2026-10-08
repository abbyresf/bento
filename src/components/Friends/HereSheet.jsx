import { useState, useEffect } from 'react';
import { pingHere } from '../../lib/duo';
import { mealForHour, DURATIONS, DEFAULT_MINUTES, durationLabel } from '../../data/duo';
import './Friends.css';

/* "I'm here": pick the hall, the meal, and who hears about it.
 *
 * Nothing is sent until the button is tapped. Friends with sharing switched off
 * are listed but cannot be ticked, so it is clear why they will not be told. */
export default function HereSheet({ halls, friends, onClose, onSent }) {
  const sharing = friends.filter((f) => f.i_share !== false);
  const [hall, setHall] = useState(halls.length === 1 ? halls[0].name : '');
  const [meal, setMeal] = useState(mealForHour(new Date().getHours()));
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [picked, setPicked] = useState(() => new Set(sharing.map((f) => f.friend_id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const send = async () => {
    if (!hall || picked.size === 0) return;
    setBusy(true); setError(null);
    const res = await pingHere({ hall, meal, friendIds: [...picked], minutes });
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    onSent({ hall, meal, reached: res.reached, minutes });
  };

  return (
    <div className="fr-overlay" onClick={onClose}>
      <div className="fr-sheet" role="dialog" aria-modal="true" aria-label="I'm here" onClick={(e) => e.stopPropagation()}>
        <div className="fr-head">
          <h3>I'm here</h3>
          <button className="fr-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <span className="fr-label" style={{ marginTop: 0 }}>Dining hall</span>
        <div className="fr-choices">
          {halls.map((h) => (
            <button key={h.id} className="fr-choice" aria-pressed={hall === h.name} onClick={() => setHall(h.name)}>{h.name}</button>
          ))}
        </div>

        <span className="fr-label">Meal</span>
        <div className="fr-choices">
          {['breakfast', 'lunch', 'dinner'].map((m) => (
            <button key={m} className="fr-choice" aria-pressed={meal === m} onClick={() => setMeal(m)}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <span className="fr-label">For how long</span>
        <div className="fr-choices">
          {DURATIONS.map((m) => (
            <button key={m} className="fr-choice" aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{durationLabel(m)}</button>
          ))}
        </div>

        <span className="fr-label">Tell</span>
        <div className="fr-checks">
          {friends.map((f) => {
            const off = f.i_share === false;
            return (
              <label key={f.friend_id} className={`fr-check${off ? ' is-off' : ''}`}>
                <input type="checkbox" disabled={off} checked={!off && picked.has(f.friend_id)} onChange={() => toggle(f.friend_id)} />
                <span>{f.display_name}{off ? ' (sharing is off)' : ''}</span>
              </label>
            );
          })}
        </div>

        <p className="fr-note">Buddies see the hall and the time. It ends by itself after {durationLabel(minutes)}, or when you tap I've left.</p>
        {error && <p className="fr-error">{error}</p>}
        <div className="fr-actions">
          <button className="fr-btn" onClick={send} disabled={busy || !hall || picked.size === 0}>
            {busy ? 'Telling them…' : 'Tell buddies'}
          </button>
        </div>
      </div>
    </div>
  );
}
