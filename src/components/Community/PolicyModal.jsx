import './PolicyModal.css';

export default function PolicyModal({ onClose }) {
  return (
    <div className="policy-overlay" onClick={onClose}>
      <div className="policy-modal" onClick={e => e.stopPropagation()}>
        <div className="policy-modal-header">
          <h2>Community Guidelines</h2>
          <button className="policy-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="policy-body">
          <p>The community tab is a space for Brandeis students to share honest feedback about dining. Keep it useful for everyone.</p>

          <h3>What belongs here</h3>
          <ul>
            <li>Suggestions for new menu items or dining improvements</li>
            <li>Honest ratings of food you've tried</li>
            <li>Feedback that helps dining staff understand what students want</li>
          </ul>

          <h3>What will be removed</h3>
          <ul>
            <li>Personal attacks or harassment of any kind</li>
            <li>Content unrelated to dining or campus food</li>
            <li>Spam or repeated identical submissions</li>
            <li>Anything that could identify another student</li>
          </ul>

          <h3>Anonymity</h3>
          <p>All suggestions are fully anonymous. Bento does not store any information linking your name or account to what you post.</p>

          <h3>Reporting</h3>
          <p>If you see something that violates these guidelines, tap the flag icon. Bento reviews all reports and removes content that breaks these rules. Repeated violations may result in loss of community access.</p>
        </div>
      </div>
    </div>
  );
}
