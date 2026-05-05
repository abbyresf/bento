import './StreakBadge.css';

export default function StreakBadge({ streak, onClick }) {
  return (
    <button className="streak-badge" onClick={onClick} aria-label={`${streak}-day streak`}>
      <span className="streak-badge-flame">🔥</span>
      <span className="streak-badge-count">{streak}</span>
    </button>
  );
}
