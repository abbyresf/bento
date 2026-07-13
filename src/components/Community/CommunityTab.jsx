import { useState, useEffect, useCallback } from 'react';
import { useRatings } from '../../context/RatingsContext';
import { getSuggestions, getMyEmphasizes, submitSuggestion, toggleEmphasize, flagSuggestion } from '../../lib/db';
import PolicyModal from './PolicyModal';
import StarRating from './StarRating';
import './CommunityTab.css';

// "Students like this!" threshold: avg >= 4.0 and at least 5 ratings
const BADGE_MIN_AVG   = 4.0;
const BADGE_MIN_COUNT = 5;

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Food Leaderboard ─────────────────────────────────────────────────────────

function FoodLeaderboard({ aggregates }) {
  const ranked = Object.values(aggregates)
    .filter(a => a.count >= 2)
    .sort((a, b) => b.avg - a.avg || b.count - a.count)
    .slice(0, 10);

  if (ranked.length === 0) return (
    <div className="leaderboard-empty">
      <p>No ratings yet. Be the first to rate a dish!</p>
    </div>
  );

  return (
    <div className="leaderboard-list">
      {ranked.map((item, i) => (
        <div key={item.name} className="leaderboard-item">
          <span className="leaderboard-rank">#{i + 1}</span>
          <span className="leaderboard-name">{item.name}</span>
          <div className="leaderboard-right">
            <StarRating rating={Math.round(item.avg)} size={13} interactive={false} />
            <span className="leaderboard-avg">{item.avg.toFixed(1)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Suggestion Feed ──────────────────────────────────────────────────────────

function SuggestionCard({ suggestion, emphasized, onEmphasize, onFlag, flagged }) {
  const [localCount, setLocalCount]       = useState(suggestion.emphasize_count);
  const [localEmphasized, setEmphasized]  = useState(emphasized);
  const [localFlagged, setFlagged]        = useState(flagged);
  const [submitting, setSubmitting]       = useState(false);

  const handleEmphasize = async () => {
    if (submitting) return;
    setSubmitting(true);
    const optimistic = !localEmphasized;
    setEmphasized(optimistic);
    setLocalCount(c => optimistic ? c + 1 : Math.max(0, c - 1));
    const result = await onEmphasize(suggestion.id);
    if (result) {
      setEmphasized(result.emphasized);
      setLocalCount(result.emphasize_count);
    }
    setSubmitting(false);
  };

  const handleFlag = async () => {
    if (localFlagged) return;
    setFlagged(true);
    await onFlag(suggestion.id);
  };

  return (
    <div className="suggestion-card">
      <p className="suggestion-content">{suggestion.content}</p>
      <div className="suggestion-footer">
        <span className="suggestion-time">{timeAgo(suggestion.created_at)}</span>
        <div className="suggestion-actions">
          <button
            className={`emphasize-btn${localEmphasized ? ' active' : ''}`}
            onClick={handleEmphasize}
            aria-label={localEmphasized ? 'Remove emphasis' : 'Emphasize this suggestion'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={localEmphasized ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
            </svg>
            <span>{localCount}</span>
          </button>
          <button
            className={`flag-btn${localFlagged ? ' flagged' : ''}`}
            onClick={handleFlag}
            aria-label="Flag this suggestion"
            disabled={localFlagged}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill={localFlagged ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
              <line x1="4" y1="22" x2="4" y2="15"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Compose Sheet ────────────────────────────────────────────────────────────

function ComposeSheet({ onClose, onSubmitted }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const max = 300;

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitSuggestion(trimmed);
      onSubmitted?.();
      onClose();
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="compose-overlay" onClick={onClose}>
      <div className="compose-sheet" onClick={e => e.stopPropagation()}>
        <div className="compose-header">
          <h3>New Suggestion</h3>
          <button className="compose-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <p className="compose-anon-note">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Your suggestion is completely anonymous
        </p>
        <textarea
          className="compose-textarea"
          placeholder="Suggest a new menu item, share dining feedback, or ask for a change…"
          value={text}
          onChange={e => setText(e.target.value.slice(0, max))}
          rows={5}
          autoFocus
        />
        <div className="compose-footer">
          <span className={`compose-count${text.length > max - 20 ? ' warning' : ''}`}>
            {text.length}/{max}
          </span>
          {error && <span className="compose-error">{error}</span>}
          <button
            className="compose-submit"
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
          >
            {submitting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Tab ─────────────────────────────────────────────────────────────────

export default function CommunityTab() {
  const { aggregates } = useRatings();
  const [showPolicy, setShowPolicy]       = useState(false);
  const [showCompose, setShowCompose]     = useState(false);
  const [suggestions, setSuggestions]     = useState([]);
  const [myEmphasizes, setMyEmphasizes]   = useState(new Set());
  const [myFlags, setMyFlags]             = useState(new Set());
  const [sortOrder, setSortOrder]         = useState('emphasize_count'); // or 'created_at'
  const [loading, setLoading]             = useState(true);

  const loadSuggestions = useCallback(async () => {
    const [suggs, emph] = await Promise.all([
      getSuggestions({ orderBy: sortOrder }),
      getMyEmphasizes(),
    ]);
    setSuggestions(suggs);
    setMyEmphasizes(emph);
    setLoading(false);
  }, [sortOrder]);

  useEffect(() => {
    setLoading(true);
    loadSuggestions();
  }, [loadSuggestions]);

  const handleEmphasize = async (suggestionId) => {
    const result = await toggleEmphasize(suggestionId);
    if (result) {
      setMyEmphasizes(prev => {
        const next = new Set(prev);
        result.emphasized ? next.add(suggestionId) : next.delete(suggestionId);
        return next;
      });
    }
    return result;
  };

  const handleFlag = async (suggestionId) => {
    await flagSuggestion(suggestionId);
    setMyFlags(prev => new Set([...prev, suggestionId]));
  };

  return (
    <div className="community-tab">

      {/* Policy banner */}
      <button className="community-policy-btn" onClick={() => setShowPolicy(true)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Community Guidelines
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      {/* Food leaderboard */}
      <section className="community-section">
        <h2 className="community-section-title">Top Rated This Week</h2>
        <FoodLeaderboard aggregates={aggregates} />
      </section>

      {/* Suggestion forum */}
      <section className="community-section">
        <div className="suggestions-header">
          <h2 className="community-section-title">Student Suggestions</h2>
          <div className="sort-toggle">
            <button
              className={sortOrder === 'emphasize_count' ? 'active' : ''}
              onClick={() => setSortOrder('emphasize_count')}
            >
              Top
            </button>
            <button
              className={sortOrder === 'created_at' ? 'active' : ''}
              onClick={() => setSortOrder('created_at')}
            >
              New
            </button>
          </div>
        </div>

        {loading ? (
          <div className="community-loading">Loading…</div>
        ) : suggestions.length === 0 ? (
          <div className="suggestions-empty">
            <p>No suggestions yet. Be the first!</p>
          </div>
        ) : (
          <div className="suggestions-list">
            {suggestions.map(s => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                emphasized={myEmphasizes.has(s.id)}
                flagged={myFlags.has(s.id)}
                onEmphasize={handleEmphasize}
                onFlag={handleFlag}
              />
            ))}
          </div>
        )}
      </section>

      {/* Compose FAB */}
      <button className="compose-fab" onClick={() => setShowCompose(true)} aria-label="New suggestion">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
      </button>

      {showPolicy  && <PolicyModal onClose={() => setShowPolicy(false)} />}
      {showCompose && <ComposeSheet onClose={() => setShowCompose(false)} onSubmitted={loadSuggestions} />}
    </div>
  );
}
