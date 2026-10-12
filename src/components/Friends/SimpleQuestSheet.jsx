import { useState, useEffect } from 'react';
import { pickBentoPlate, requestTwin, sendNudge } from '../../lib/duo';
import BuddyPick from './BuddyPick';
import './Friends.css';

/* The quests that need nothing more than a buddy: Bento plate, Cover for me, Twin day and Outfit swap. Choose a buddy, read
 * what will happen, confirm. Nothing is sent until the confirm button is tapped. */
const KINDS = {
  bento: {
    title: 'Bento plate',
    intro: 'Who is it with?',
    ask: (n) => `You and ${n} each eat a plate with a protein, a vegetable and a grain today or tomorrow, then tap I did it.`,
    button: 'Start',
    run: (id) => pickBentoPlate(id),
    done: (n) => `Started. ${n} will see it in their quests.`,
  },
  cover: {
    title: 'Cover for me',
    intro: 'Who needs a nudge?',
    ask: (n) => `Bento sends ${n} one short reminder to confirm a meal. It counts when they confirm one today. You can nudge until 8pm.`,
    button: 'Send nudge',
    run: (id) => sendNudge(id),
    done: (n) => `Nudged ${n}. It counts when they confirm a meal.`,
  },
  twin: {
    title: 'Twin day',
    intro: 'Who is your twin?',
    ask: (n) => `Ask ${n} to match outfits today. If they agree, both Bentos wear your outfit until midnight.`,
    button: 'Ask',
    run: (id) => requestTwin(id, 'twin'),
    done: (n) => `Asked ${n}. They will see it in their quests.`,
  },
  outfit: {
    title: 'Outfit swap',
    intro: 'Who do you swap with?',
    ask: (n) => `Ask ${n} to swap outfits today. If they agree, your Bento wears theirs and theirs wears yours until midnight.`,
    button: 'Ask',
    run: (id) => requestTwin(id, 'swap'),
    done: (n) => `Asked ${n}. They will see it in their quests.`,
  },
};

const PROBLEMS = {
  exists: (n) => `You and ${n} already have this going.`,
  too_late: () => 'Nudges stop at 8pm. Try tomorrow.',
  already_confirmed: (n) => `${n} has already confirmed a meal today, so there is nothing to nudge.`,
  limit: () => 'You have sent five nudges today. Try tomorrow.',
  offline: () => 'You need a connection for this.',
};

export default function SimpleQuestSheet({ kind, friends, onClose, onDone }) {
  const k = KINDS[kind];
  const [friend, setFriend] = useState(null);
  const [step, setStep] = useState('buddy');            // 'buddy' | 'ask' | 'done'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const go = async () => {
    setBusy(true); setError(null);
    const res = await k.run(friend.friend_id);
    setBusy(false);
    if (res.ok) { setStep('done'); onDone?.(); return; }
    setError((PROBLEMS[res.status] ?? (() => 'Something went wrong. Try again.'))(friend.display_name));
  };

  return (
    <div className="fr-overlay" onClick={onClose}>
      <div className="fr-sheet" role="dialog" aria-modal="true" aria-label={k.title} onClick={(e) => e.stopPropagation()}>
        <div className="fr-head">
          <h3>{k.title}</h3>
          <button className="fr-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {step === 'buddy' && (
          <>
            <p className="fr-note" style={{ marginTop: 0 }}>{k.intro}</p>
            <BuddyPick friends={friends} onChoose={(f) => { setFriend(f); setStep('ask'); }} />
          </>
        )}

        {step === 'ask' && (
          <>
            <p className="fr-note" style={{ marginTop: 0 }}>{k.ask(friend.display_name)}</p>
            {error && <p className="fr-error">{error}</p>}
            <div className="fr-actions">
              <button className="fr-btn" disabled={busy} onClick={go}>{k.button}</button>
              <button className="fr-btn-quiet" onClick={() => { setStep('buddy'); setError(null); }}>Back</button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <p className="fr-ok" style={{ marginTop: 0 }}>{k.done(friend.display_name)}</p>
            <div className="fr-actions">
              <button className="fr-btn" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
