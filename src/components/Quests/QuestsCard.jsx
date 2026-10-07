import { useCallback, useEffect, useState } from 'react';
import { QUESTS, computeProgress, questState, weekStartOf } from '../../data/quests';
import { getQuestWeek, claimQuest } from '../../lib/db';
import { haptics } from '../../lib/haptics';
import './QuestsCard.css';

/* This week's three quests. Hidden until the read succeeds, so it never shows
 * progress that is not true. Claiming needs the quest_claims table (migration
 * 042): if it is missing, the card still shows progress but offers no claim. */
export default function QuestsCard() {
  const weekStart = weekStartOf();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => getQuestWeek(weekStart).then(setData).catch(() => {}), [weekStart]);
  useEffect(() => { load(); }, [load]);

  if (!data) return null;
  const progress = computeProgress(data);

  const claim = async (quest) => {
    if (busy) return;
    setBusy(quest.id); setError(false);
    try {
      await claimQuest(quest.id, weekStart);
      haptics.success();
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
        {QUESTS.map((q) => {
          const state = questState(q, progress, data.claimedIds);
          const n = progress[q.id] ?? 0;
          return (
            <li key={q.id} className={`quest ${state}`}>
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
