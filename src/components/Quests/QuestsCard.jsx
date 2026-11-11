import { useCallback, useEffect, useState } from 'react';
import { QUESTS, WATER_QUEST, computeProgress, questState, weekStartOf } from '../../data/quests';
import { useAthlete, useAthleteExtras, useWaterGoalDays } from '../../lib/athlete';
import { getQuestWeek, claimQuest } from '../../lib/db';
import { haptics } from '../../lib/haptics';
import './QuestsCard.css';

/* This week's three quests, and a fourth for water in Athlete mode. Hidden until the read succeeds, so it never shows
 * progress that is not true. Claiming needs the quest_claims table (migration
 * 042): if it is missing, the card still shows progress but offers no claim. */
export default function QuestsCard() {
  const weekStart = weekStartOf();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(false);
  const [justClaimed, setJustClaimed] = useState(null);   // the row that pops after a claim
  // Water lives on the phone and in water_logs. Today's cups re-render the card as they are logged.
  const { athleteMode } = useAthlete();
  const waterOn = useAthleteExtras() && athleteMode;
  const waterDays = useWaterGoalDays(weekStart);

  const load = useCallback(() => getQuestWeek(weekStart).then(setData).catch(() => {}), [weekStart]);
  useEffect(() => { load(); }, [load]);

  if (!data) return null;
  const progress = computeProgress(data);
  const quests = waterOn ? [...QUESTS, WATER_QUEST] : QUESTS;
  if (waterOn) progress[WATER_QUEST.id] = Math.min(waterDays, WATER_QUEST.target);

  const claim = async (quest) => {
    if (busy) return;
    setBusy(quest.id); setError(false);
    haptics.medium();   // felt on the tap itself, before the save comes back
    try {
      await claimQuest(quest.id, weekStart);
      haptics.success();
      setJustClaimed(quest.id);
      setTimeout(() => setJustClaimed((id) => (id === quest.id ? null : id)), 1200);
      await load();
    } catch {
      haptics.warning();
      setError(true);
    } finally { setBusy(null); }
  };

  return (
    <div className="quests-card">
      <h3>This week</h3>
      <ul className="quests-list">
        {quests.map((q) => {
          const state = questState(q, progress, data.claimedIds);
          const n = progress[q.id] ?? 0;
          return (
            <li key={q.id} className={`quest ${state}${justClaimed === q.id ? ' just-claimed' : ''}`}>
              <div className="quest-top">
                <span className="quest-title">{q.title}</span>
                {state === 'claimed' && <span className="quest-done">Claimed</span>}
                {state === 'ready' && data.claimsAvailable && (
                  <button className="quest-claim" onClick={() => claim(q)} disabled={busy === q.id}>Claim</button>
                )}
                {state === 'open' && <span className="quest-count">{n} of {q.target}</span>}
                {state === 'ready' && !data.claimsAvailable && <span className="quest-count">Done</span>}
              </div>
              <div className="quest-bar" aria-hidden="true"><i style={{ width: `${(n / q.target) * 100}%` }} /></div>
            </li>
          );
        })}
      </ul>
      {error && <p className="quest-error" role="alert">Could not save that. Try again.</p>}
      <p className="quest-note">Claimed quests unlock new looks in Bento's closet. Resets every Monday.</p>
    </div>
  );
}
