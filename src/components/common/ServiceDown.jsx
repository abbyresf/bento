import './ServiceDown.css';

/* Shown when Bento cannot reach its own backend, or when a render crashes.
 *
 * This exists because a database outage used to surface as the raw browser
 * error "Failed to fetch" on the login screen, which tells a student nothing,
 * looks broken rather than temporary, and invites them to delete the app.
 *
 * The copy deliberately does not blame the student, does not use the word
 * error, and gives them one thing to do. */
export default function ServiceDown({ onRetry }) {
  return (
    <div className="svc-down">
      <div className="svc-down-inner">
        <svg className="svc-down-mark" viewBox="0 0 100 100" role="img" aria-label="Bento">
          <rect x="7" y="10" width="86" height="80" rx="14"
                fill="none" stroke="currentColor" strokeWidth="5" opacity="0.35" />
          <line x1="52" y1="14" x2="52" y2="86" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <line x1="52" y1="50" x2="89" y2="50" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        </svg>

        <h1>Bento is being updated</h1>
        <p>
          We are making some changes and the app will be back shortly. Your
          meals, ratings and streak are safe.
        </p>

        <button className="svc-down-btn" onClick={onRetry ?? (() => window.location.reload())}>
          Try again
        </button>

        <p className="svc-down-foot">
          Still not working in a few minutes? Email{' '}
          <a href="mailto:bentodining@gmail.com">bentodining@gmail.com</a> and we
          will know about it.
        </p>
      </div>
    </div>
  );
}
