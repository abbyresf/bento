import { DIETARY_TAGS } from '../../data/mockMenu';
import './FoodItem.css';

export default function FoodItem({ item, isExpanded, onToggleExpand, onSwap, disabled }) {
  const { name, nutrition, reason, tags, station } = item;

  return (
    <div className={`food-item ${isExpanded ? 'expanded' : ''}`}>
      <div className="food-item-main" onClick={onToggleExpand}>
        <div className="food-item-info">
          <h4 className="food-name">{name}</h4>
          {reason && <p className="food-reason">{reason}</p>}
          <div className="food-tags">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className={`food-tag ${tag}`}>
                {DIETARY_TAGS[tag] || tag}
              </span>
            ))}
          </div>
        </div>

        <div className="food-item-macros">
          <div className="macro">
            <span className="macro-value">{nutrition.calories}</span>
            <span className="macro-label">cal</span>
          </div>
          <div className="macro">
            <span className="macro-value">{nutrition.protein}g</span>
            <span className="macro-label">P</span>
          </div>
          <div className="macro">
            <span className="macro-value">{nutrition.carbs}g</span>
            <span className="macro-label">C</span>
          </div>
          <div className="macro">
            <span className="macro-value">{nutrition.fat}g</span>
            <span className="macro-label">F</span>
          </div>
        </div>

        <button
          className="expand-btn"
          aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>

      {isExpanded && (
        <div className="food-item-details">
          <div className="details-section">
            <h5>Station</h5>
            <p>{station.charAt(0).toUpperCase() + station.slice(1)}</p>
          </div>

          <div className="details-section">
            <h5>Additional Nutrition</h5>
            <div className="nutrition-grid">
              {nutrition.sodium !== undefined && (
                <div className="nutrition-item">
                  <span className="nutrition-label">Sodium</span>
                  <span className="nutrition-value">{nutrition.sodium}mg</span>
                </div>
              )}
              {nutrition.fiber !== undefined && (
                <div className="nutrition-item">
                  <span className="nutrition-label">Fiber</span>
                  <span className="nutrition-value">{nutrition.fiber}g</span>
                </div>
              )}
              {nutrition.sugar !== undefined && (
                <div className="nutrition-item">
                  <span className="nutrition-label">Sugar</span>
                  <span className="nutrition-value">{nutrition.sugar}g</span>
                </div>
              )}
            </div>
          </div>

          <div className="details-section">
            <h5>Dietary Info</h5>
            <div className="all-tags">
              {tags.map((tag) => (
                <span key={tag} className={`food-tag ${tag}`}>
                  {DIETARY_TAGS[tag] || tag}
                </span>
              ))}
            </div>
          </div>

          {!disabled && (
            <button className="swap-btn" onClick={(e) => { e.stopPropagation(); onSwap(); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9"></polyline>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <polyline points="7 23 3 19 7 15"></polyline>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
              </svg>
              Swap for Alternative
            </button>
          )}
        </div>
      )}
    </div>
  );
}
