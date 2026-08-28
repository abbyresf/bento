import { useState, useEffect } from 'react';
import { pushSupport, subscribeToPush, getPushEnabled } from '../../lib/push';
import './NotifPrompt.css';

// A short campaign asking students to turn reminders on, running on Monday and
// Tuesday only (both inside the beta window). Notification permission is the one prompt a browser will not let you
// ask for twice: once someone denies it, it cannot be requested again from
// code. So this appears a limited number of times, never nags, and is not shown
// at all to anyone who cannot act on it.
const CAMPAIGN_DAYS = ['2026-08-31', '2026-09-01'];
const DISMISS_KEY = 'bento_notif_prompt_dismissed';

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function NotifPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  useEffect(() => {
    const today = localDate();
    if (!CAMPAIGN_DAYS.includes(today)) return;

    // Dismissed already today. Stored per day so the second day gets one more
    // chance, and so a dismissal never has to be cleaned up later.
    try {
      if (localStorage.getItem(DISMISS_KEY) === today) return;
    } catch { /* localStorage unavailable — fall through and show it */ }

    // Only offer this where tapping the button can actually do something. On an
    // iPhone in a Safari tab the browser will refuse to subscribe, and the
    // install prompt already covers that path — two dialogs asking for
    // different things would be worse than one.
    if (!pushSupport().ok) return;

    let cancelled = false;
    getPushEnabled()
      .then(enabled => { if (!cancelled && !enabled) setShow(true); })
      .catch(() => { /* if we cannot tell, say nothing */ });
    return () => { cancelled = true; };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, localDate()); } catch { /* ignore */ }
    setShow(false);
  };

  const enable = async () => {
    setBusy(true);
    setNote(null);
    const result = await subscribeToPush();
    setBusy(false);
    if (result.ok) {
      dismiss();
      return;
    }
    // A denial is permanent from the browser's side, so say what happened
    // rather than leaving the button looking broken.
    setNote(
      result.reason === 'blocked'
        ? 'Your browser said no. You can re-allow notifications for Bento in its settings.'
        : result.reason === 'dismissed'
          ? 'All good. Settings has the switch whenever you want it.'
          : 'That did not work. Try again from Settings.'
    );
  };

  if (!show) return null;

  return (
    <div className="notif-prompt-overlay" onClick={dismiss}>
      <div className="notif-prompt" onClick={e => e.stopPropagation()}>
        <div className="notif-prompt-icon" aria-hidden="true">🔔</div>
        <h3>Never think about lunch again</h3>
        <p>
          Two a day, lunch and dinner. Your plate is picked before you
          walk in.
        </p>
        {note && <p className="notif-prompt-note">{note}</p>}
        <button className="notif-prompt-yes" onClick={enable} disabled={busy}>
          {busy ? 'One moment…' : 'Sounds good'}
        </button>
        <button className="notif-prompt-no" onClick={dismiss}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
