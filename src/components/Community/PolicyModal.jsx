import { GUIDELINES } from '../../data/communityGuidelines';
import './PolicyModal.css';

export default function PolicyModal({ onClose }) {
  return (
    <div className="policy-overlay" onClick={onClose}>
      <div className="policy-modal" role="dialog" aria-modal="true" aria-label="Community guidelines" onClick={e => e.stopPropagation()}>
        <div className="policy-modal-header">
          <h2>Community Guidelines</h2>
          <button className="policy-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="policy-body">
          {GUIDELINES.map((s, i) => (
            <div key={s.title ?? i}>
              {s.title && <h3>{s.title}</h3>}
              {s.body && <p>{s.body}</p>}
              {s.list && <ul>{s.list.map((li) => <li key={li}>{li}</li>)}</ul>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
