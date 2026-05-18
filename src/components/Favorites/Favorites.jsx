import { STATIONS, DIETARY_TAGS } from '../../data/mockMenu';
import { useFavorites } from '../../context/FavoritesContext';
import './Favorites.css';

const STATION_ORDER = ['breakfast', 'entree', 'grill', 'deli', 'pizza', 'allgood', 'sides', 'soup', 'salad', 'bakery', 'beverage'];

export default function Favorites({ onClose, tabMode = false }) {
  const { favorites, toggleFavorite } = useFavorites();

  const handleUnfavorite = (item) => {
    toggleFavorite(item);
  };

  // Group by station, sorted by display order
  const grouped = {};
  favorites.forEach((item) => {
    const station = item.station || 'entree';
    if (!grouped[station]) grouped[station] = [];
    grouped[station].push(item);
  });
  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    const ai = STATION_ORDER.indexOf(a);
    const bi = STATION_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className={`favorites-panel${tabMode ? ' favorites-panel-page' : ''}`}>
      <div className="favorites-header">
        <h2>Favorites</h2>
        <button className="favorites-close-btn" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <p className="favorites-note">
        Favorited items get a boost the next time your meal plan is generated — on a new day or after changing your settings.
      </p>

      {favorites.length === 0 ? (
        <div className="favorites-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
          <p className="favorites-empty-title">No favorites yet</p>
          <p className="favorites-empty-sub">Tap the heart on any food item to save it here</p>
        </div>
      ) : (
        <div className="favorites-list">
          {sortedGroups.map(([station, items]) => (
            <div key={station} className="favorites-group">
              <p className="favorites-group-label">{STATIONS[station] || station}</p>
              {items.map((item) => (
                <div key={item.id} className="favorite-item">
                  <div className="favorite-item-info">
                    <span className="favorite-name">{item.name}</span>
                    <div className="favorite-meta">
                      <span className="favorite-macros">
                        {item.nutrition?.calories ?? '—'} cal
                        {' · '}{item.nutrition?.protein != null ? `${item.nutrition.protein}g P` : '—'}
                        {' · '}{item.nutrition?.carbs != null ? `${item.nutrition.carbs}g C` : '—'}
                        {' · '}{item.nutrition?.fat != null ? `${item.nutrition.fat}g F` : '—'}
                      </span>
                      {item.tags?.length > 0 && (
                        <div className="favorite-tags">
                          {item.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className={`food-tag ${tag}`}>
                              {DIETARY_TAGS[tag] || tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    className="unfavorite-btn"
                    onClick={() => handleUnfavorite(item)}
                    aria-label="Remove from favorites"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
