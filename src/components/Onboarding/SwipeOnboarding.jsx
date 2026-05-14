import { useState, useRef, useEffect } from 'react';
import { fetchBrandeisMenu } from '../../services/menuFetcher';
import { toggleFavorite } from '../../lib/db';
import './SwipeOnboarding.css';

const STATION_LABELS = {
  entree:    'Entrée',
  grill:     'Grill',
  salad:     'Salad Bar',
  sides:     'Sides',
  soup:      'Soup',
  bakery:    'Bakery & Dessert',
  deli:      'Deli',
  pizza:     'Pizza',
  allgood:   'Allergen-Friendly',
  breakfast: 'Breakfast',
};

const STATION_COLORS = {
  entree:    '#f47421',
  grill:     '#ef4444',
  salad:     '#4cae70',
  sides:     '#8b5cf6',
  soup:      '#f59e0b',
  bakery:    '#ec4899',
  deli:      '#3b82f6',
  pizza:     '#ef4444',
  allgood:   '#4cae70',
  breakfast: '#f59e0b',
};

function stationColor(station) {
  return STATION_COLORS[station] ?? '#64748b';
}

function selectOnboardingItems(menu) {
  const seen = new Set();
  const all = [];
  for (const loc of Object.values(menu.locations)) {
    for (const mealItems of Object.values(loc.meals)) {
      for (const item of mealItems) {
        const key = item.name.toLowerCase().trim();
        if (seen.has(key)) continue;
        if (item.station === 'beverage') continue;
        if (item.nutrition.calories < 80) continue;
        seen.add(key);
        all.push(item);
      }
    }
  }

  const byStation = {};
  for (const item of all) {
    (byStation[item.station] ??= []).push(item);
  }

  // Pick the highest-calorie items per station (more recognisable/substantial)
  const quota = { entree: 6, grill: 4, salad: 4, bakery: 4, deli: 3, soup: 2, sides: 2, pizza: 2, allgood: 2, breakfast: 3 };
  const picks = [];
  for (const [station, limit] of Object.entries(quota)) {
    const pool = (byStation[station] ?? []).sort((a, b) => b.nutrition.calories - a.nutrition.calories);
    picks.push(...pool.slice(0, limit));
  }

  // Shuffle and cap at 22 cards
  return picks.sort(() => Math.random() - 0.5).slice(0, 22);
}

export default function SwipeOnboarding({ onDone }) {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [index, setIndex]         = useState(0);
  const [likedCount, setLikedCount] = useState(0);
  const [done, setDone]           = useState(false);
  const [dragX, setDragX]         = useState(0);
  const [dragging, setDragging]   = useState(false);
  const [flying, setFlying]       = useState(null); // 'left' | 'right' | null

  const startX      = useRef(0);
  const cardRef     = useRef(null);
  const processing  = useRef(false);

  useEffect(() => {
    fetchBrandeisMenu()
      .then(menu => setItems(selectOnboardingItems(menu)))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, []);

  const THRESHOLD = 90;

  const decide = async (liked) => {
    if (processing.current || flying) return;
    processing.current = true;

    if (liked) {
      await toggleFavorite(items[index]);
      setLikedCount(c => c + 1);
    }

    setFlying(liked ? 'right' : 'left');
    setDragX(0);

    setTimeout(() => {
      processing.current = false;
      setFlying(null);
      if (index + 1 >= items.length) {
        setDone(true);
      } else {
        setIndex(i => i + 1);
      }
    }, 380);
  };

  const onPointerDown = (e) => {
    if (flying || processing.current) return;
    startX.current = e.clientX;
    setDragging(true);
    cardRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    setDragX(e.clientX - startX.current);
  };

  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(dragX) >= THRESHOLD) {
      decide(dragX > 0);
    } else {
      setDragX(0);
    }
  };

  if (loading) {
    return (
      <div className="swipe-onboarding swipe-centered">
        <div className="spinner" />
        <p className="swipe-loading-msg">Loading today's menu…</p>
      </div>
    );
  }

  if (fetchError || items.length === 0) {
    return (
      <div className="swipe-onboarding swipe-centered">
        <img src="/logo-cropped.png" alt="Bento" className="swipe-logo" />
        <h2 className="swipe-done-title">Couldn't load today's menu</h2>
        <p className="swipe-done-sub">You can favorite items directly from your meal plan.</p>
        <button className="swipe-done-btn" onClick={onDone}>Continue to app</button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="swipe-onboarding swipe-centered">
        <img src="/logo-cropped.png" alt="Bento" className="swipe-logo" />
        <div className="swipe-done-emoji">🎉</div>
        <h2 className="swipe-done-title">You're all set!</h2>
        {likedCount > 0 ? (
          <p className="swipe-done-sub">
            You saved <strong>{likedCount} {likedCount === 1 ? 'item' : 'items'}</strong>. We'll boost those in your daily plan.
          </p>
        ) : (
          <p className="swipe-done-sub">No favorites yet — you can always heart items from your meal plan.</p>
        )}
        <button className="swipe-done-btn" onClick={onDone}>Go to my meal plan</button>
      </div>
    );
  }

  const item     = items[index];
  const nextItem = items[index + 1];

  const heartOpacity = Math.min(1, Math.max(0, (dragX  - 30) / 60));
  const noOpacity    = Math.min(1, Math.max(0, (-dragX - 30) / 60));

  let cardStyle;
  if (flying === 'right') {
    cardStyle = { transform: 'translateX(130vw) rotate(30deg)', opacity: 0, transition: 'all 0.38s cubic-bezier(0.25,0.46,0.45,0.94)', pointerEvents: 'none' };
  } else if (flying === 'left') {
    cardStyle = { transform: 'translateX(-130vw) rotate(-30deg)', opacity: 0, transition: 'all 0.38s cubic-bezier(0.25,0.46,0.45,0.94)', pointerEvents: 'none' };
  } else {
    cardStyle = {
      transform: `translateX(${dragX}px) rotate(${dragX / 22}deg)`,
      transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)',
    };
  }

  return (
    <div className="swipe-onboarding">
      <div className="swipe-top-bar">
        <img src="/logo-cropped.png" alt="Bento" className="swipe-logo-sm" />
        <button className="swipe-skip-btn" onClick={onDone}>Skip</button>
      </div>

      <div className="swipe-titles">
        <h2>Discover your favorites</h2>
        <p>Swipe right to save, left to pass</p>
      </div>

      <div className="swipe-progress-wrap">
        <div className="swipe-progress-track">
          <div className="swipe-progress-fill" style={{ width: `${(index / items.length) * 100}%` }} />
        </div>
        <span className="swipe-progress-count">{index + 1} / {items.length}</span>
      </div>

      <div className="swipe-card-area">
        {nextItem && (
          <div className="swipe-card swipe-card-back">
            <div className="swipe-card-stripe" style={{ background: stationColor(nextItem.station) }} />
            <div className="swipe-card-body">
              <p className="swipe-station" style={{ color: stationColor(nextItem.station) }}>
                {STATION_LABELS[nextItem.station] ?? nextItem.station}
              </p>
              <h3 className="swipe-item-name">{nextItem.name}</h3>
            </div>
          </div>
        )}

        <div
          ref={cardRef}
          className="swipe-card swipe-card-front"
          style={cardStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="swipe-stamp swipe-stamp-yes" style={{ opacity: heartOpacity }}>❤</div>
          <div className="swipe-stamp swipe-stamp-no"  style={{ opacity: noOpacity }}>✕</div>

          <div className="swipe-card-stripe" style={{ background: stationColor(item.station) }} />
          <div className="swipe-card-body">
            <p className="swipe-station" style={{ color: stationColor(item.station) }}>
              {STATION_LABELS[item.station] ?? item.station}
            </p>
            <h3 className="swipe-item-name">{item.name}</h3>
            {item.nutrition.calories > 0 && (
              <p className="swipe-item-cal">
                {item.nutrition.calories} cal · {item.nutrition.protein}g protein
              </p>
            )}
            {item.tags.length > 0 && (
              <div className="swipe-tags">
                {item.tags.slice(0, 3).map(t => <span key={t} className="swipe-tag">{t}</span>)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="swipe-actions">
        <button className="swipe-btn swipe-btn-no" onClick={() => decide(false)} aria-label="Pass">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <p className="swipe-status">{likedCount > 0 ? `${likedCount} saved` : 'Swipe or tap'}</p>
        <button className="swipe-btn swipe-btn-yes" onClick={() => decide(true)} aria-label="Favorite">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
