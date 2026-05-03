import { BADGES, getEarnedBadges } from '../../data/badges';
import './BadgesPanel.css';

export default function BadgesPanel({ longestStreak, onClose }) {
  const earnedIds = new Set(getEarnedBadges(longestStreak).map(b => b.id));

  return (
    <>
      <div className="badges-overlay" onClick={onClose} />
      <div className="badges-panel">
        <div className="badges-panel-header">
          <h2>Badges</h2>
          <button className="badges-panel-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p className="badges-panel-sub">
          {earnedIds.size} of {BADGES.length} earned
        </p>
        <div className="badges-list">
          {BADGES.map(badge => {
            const isEarned = earnedIds.has(badge.id);
            return (
              <div key={badge.id} className={`badge-row ${isEarned ? 'earned' : 'locked'}`}>
                <div className="badge-row-emoji">{isEarned ? badge.emoji : '🔒'}</div>
                <div className="badge-row-info">
                  <div className="badge-row-name">{badge.name}</div>
                  <div className="badge-row-desc">
                    {isEarned ? badge.description : `Reach a ${badge.days}-day streak`}
                  </div>
                </div>
                {isEarned && (
                  <svg className="badge-row-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
