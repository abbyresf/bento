import { BADGES, getEarnedBadges, fillForStreak, nextBadge } from '../../data/badges';
import { Suspense, lazy } from 'react';
import BentoBoxThumb from './BentoBoxThumb';
import './BadgesPanel.css';

// The full-detail drawing is the heavy part, so it loads when the panel opens.
const BentoBox = lazy(() => import('./BentoBox'));

/* The streak badges, as one bento box that packs itself.
 *
 * The top shows the box as it is now, with the next piece faintly in place so you can see
 * what is coming. Below, every tier is listed with the box as it looks at that tier, in
 * full color once earned and as the empty tray while locked. The streak that counts is the
 * longest one, so a broken streak never takes a piece back out. */
export default function BadgesPanel({ longestStreak, onClose }) {
  const earnedIds = new Set(getEarnedBadges(longestStreak).map((b) => b.id));
  const level = fillForStreak(longestStreak);
  const next = nextBadge(longestStreak);
  const toGo = next ? next.days - longestStreak : 0;
  const current = level > 0 ? BADGES.find((b) => b.fill === level) : null;

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

        <div className="badges-scroll">
          <div className="badges-hero">
            <Suspense fallback={<BentoBoxThumb level={level} size={210} />}>
              <BentoBox level={level} size={210} ghost />
            </Suspense>
            <div className="badges-hero-name">{current ? current.name : 'An empty box'}</div>
            <div className="badges-hero-sub">
              {next
                ? `Next: ${next.name}. ${toGo} more day${toGo === 1 ? '' : 's'}.`
                : 'The box is packed. Nicely done.'}
            </div>
            <div className="badges-hero-count">{earnedIds.size} of {BADGES.length} earned</div>
          </div>

          <div className="badges-list">
            {BADGES.map((badge) => {
              const isEarned = earnedIds.has(badge.id);
              return (
                <div key={badge.id} className={`badge-row ${isEarned ? 'earned' : 'locked'}`}>
                  {/* Locked tiers show what they will look like, in gray, so there is something to aim for. */}
                  <div className="badge-row-art">
                    <BentoBoxThumb level={badge.fill} size={60} className={isEarned ? '' : 'bb-locked'} />
                  </div>
                  <div className="badge-row-info">
                    <div className="badge-row-name">{badge.name}</div>
                    <div className="badge-row-desc">
                      {isEarned ? badge.description : `Reach a ${badge.days}-day streak`}
                    </div>
                    <div className="badge-row-adds">Adds: {badge.adds}</div>
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
      </div>
    </>
  );
}
