// Reusable 1-5 star rating widget.
// - onChange(rating): called when user taps a star
// - If interactive is false, renders read-only
// - Tapping the same star again calls onChange with the same value (parent decides null logic)

import { useState } from 'react';

export default function StarRating({ rating = 0, onChange, size = 16, interactive = true, color = '#f47421' }) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || rating;

  return (
    <div
      className="star-rating"
      style={{ display: 'flex', gap: '1px', lineHeight: 1 }}
      onMouseLeave={() => interactive && setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n} star${n !== 1 ? 's' : ''}`}
          onClick={interactive ? (e) => { e.stopPropagation(); onChange?.(n); } : undefined}
          onMouseEnter={() => interactive && setHovered(n)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: interactive ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={n <= display ? color : 'none'}
            stroke={n <= display ? color : '#cbd5e1'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: 'fill 0.1s, stroke 0.1s' }}
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      ))}
    </div>
  );
}
