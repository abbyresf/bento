import { useEffect } from 'react';
import { DIETARY_TAGS } from '../../data/mockMenu';
import { useRatings } from '../../context/RatingsContext';
import { useNutritionDisplay } from '../../context/NutritionDisplayContext';
import { formatServing, itemNutrition, servingsOf, MAX_SERVINGS } from '../../utils/servingSize.js';
import './FoodItem.css';

const BADGE_MIN_AVG   = 4.0;
const BADGE_MIN_COUNT = 5;

export default function FoodItem({ item, isExpanded, onToggleExpand, alternatives, onLoadAlternatives, onSwapToItem, onRemove, onServingsChange, disabled }) {
  const { name, nutrition, reason, tags, station, source, serving } = item;
  const { aggregates } = useRatings();
  const display = useNutritionDisplay();
  const agg = aggregates[item.id];
  const showBadge = agg && agg.avg >= BADGE_MIN_AVG && agg.count >= BADGE_MIN_COUNT;

  // Auto-load alternatives the first time this item is expanded
  useEffect(() => {
    if (isExpanded && alternatives === null && !disabled) {
      onLoadAlternatives?.();
    }
  }, [isExpanded]); // eslint-disable-line

  // Swap suggestions summarise macros in one line; it is built from whichever
  // metrics are visible, and omitted entirely when none are.
  const macroSummary = (n) => [
    display.calories && `${n.calories} cal`,
    display.protein  && `${n.protein}g P`,
    display.carbs    && `${n.carbs}g C`,
    display.fat      && `${n.fat}g F`,
  ].filter(Boolean).join(' \u00b7 ');

  // Shown regardless of the nutrition toggles. A portion description is not a
  // calorie count: "1 cup" tells someone what a serving is without putting a
  // number on their body, which is the thing those toggles exist to hide.
  // Everything on screen reflects how many servings were taken, not one.
  const servings = servingsOf(item);
  const shown = itemNutrition(item);
  const servingLabel = formatServing(serving, servings);

  const step = (delta) => (e) => {
    e.stopPropagation();
    onServingsChange?.(servings + delta);
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    onRemove?.();
  };

  return (
    <div className={`food-item ${isExpanded ? 'expanded' : ''}`}>
      <div className="food-item-main" onClick={onToggleExpand}>
        <div className="food-item-info">
          <h4 className="food-name">
            {name}
            {showBadge && <span className="students-like-badge">Students like this!</span>}
          </h4>
          {/* Which serving table to walk to, when the hall has more than one. */}
          {(source || servingLabel) && (
            <p className="food-meta">
              {source && <span className="food-source">{source}</span>}
              {servingLabel && <span className="food-serving">{servingLabel}</span>}
            </p>
          )}
          {reason && <p className="food-reason">{reason}</p>}
          <div className="food-tags">
            {(tags ?? []).slice(0, 3).map((tag) => (
              <span key={tag} className={`food-tag ${tag}`}>
                {DIETARY_TAGS[tag] || tag}
              </span>
            ))}
          </div>
        </div>

        {/* Each macro is shown only if this person wants to see it; with all
            four hidden the row disappears rather than leaving an empty strip. */}
        {(display.calories || display.protein || display.carbs || display.fat) && (
          <div className="food-item-macros">
            {display.calories && (
              <div className="macro">
                <span className="macro-value">{nutrition?.calories != null ? shown.calories : '\u2014'}</span>
                <span className="macro-label">cal</span>
              </div>
            )}
            {display.protein && (
              <div className="macro">
                <span className="macro-value">{nutrition?.protein != null ? `${shown.protein}g` : '\u2014'}</span>
                <span className="macro-label">P</span>
              </div>
            )}
            {display.carbs && (
              <div className="macro">
                <span className="macro-value">{nutrition?.carbs != null ? `${shown.carbs}g` : '\u2014'}</span>
                <span className="macro-label">C</span>
              </div>
            )}
            {display.fat && (
              <div className="macro">
                <span className="macro-value">{nutrition?.fat != null ? `${shown.fat}g` : '\u2014'}</span>
                <span className="macro-label">F</span>
              </div>
            )}
          </div>
        )}

          {onServingsChange && (
          <div className="servings-stepper" onClick={(e) => e.stopPropagation()}>
            <button
              className="servings-btn"
              onClick={step(-1)}
              disabled={servings <= 1}
              aria-label={`Fewer servings of ${name}`}
            >&minus;</button>
            <span className="servings-count" aria-live="polite">{servings}</span>
            <button
              className="servings-btn"
              onClick={step(1)}
              disabled={servings >= MAX_SERVINGS}
              aria-label={`More servings of ${name}`}
            >+</button>
          </div>
        )}

        <div className="food-item-actions">

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

          {onRemove && (
            <button
              className="remove-btn"
              onClick={handleRemove}
              aria-label="Remove item"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="food-item-details">
          <div className="details-section">
            <h5>Station</h5>
            <p>{station ? station.charAt(0).toUpperCase() + station.slice(1) : '\u2014'}</p>
          </div>

          <div className="details-section">
            <h5>Serving size</h5>
            <p>{servingLabel ?? 'Not listed by the dining hall'}</p>
          </div>

          {display.anyVisible && (
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
          )}

          <div className="details-section">
            <h5>Dietary Info</h5>
            <div className="all-tags">
              {(tags ?? []).map((tag) => (
                <span key={tag} className={`food-tag ${tag}`}>
                  {DIETARY_TAGS[tag] || tag}
                </span>
              ))}
            </div>
          </div>

          {!disabled && (
            <div className="details-section alternatives-section">
              <h5>Swap for</h5>
              {alternatives === null ? (
                <p className="alts-loading">Finding alternatives…</p>
              ) : alternatives.length === 0 ? (
                <p className="alts-empty">No alternatives available</p>
              ) : (
                <div className="alternatives-list">
                  {alternatives.map((alt) => (
                    <button
                      key={alt.id}
                      className="alt-item"
                      onClick={(e) => { e.stopPropagation(); onSwapToItem(alt); }}
                    >
                      <span className="alt-name">{alt.name}</span>
                      {macroSummary(alt.nutrition) && (
                        <span className="alt-macros">{macroSummary(alt.nutrition)}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
