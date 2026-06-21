import { useState } from 'react';
import { UNIVERSITIES } from '../../data/universities';
import './UniversityPicker.css';

export default function UniversityPicker({ value, onChange, onRequestSchool }) {
  const [query, setQuery] = useState('');

  const q = query.toLowerCase();
  const filtered = UNIVERSITIES.filter((u) =>
    !q ||
    u.name.toLowerCase().includes(q) ||
    u.aliases.some((a) => a.includes(q))
  );

  return (
    <div className="university-picker">
      <div className="university-search-wrap">
        <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="text"
          className="university-search"
          placeholder="Search universities…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="search-clear" type="button" onClick={() => setQuery('')}>
            ×
          </button>
        )}
      </div>

      <div className="university-list">
        {filtered.length === 0 ? (
          <p className="university-empty">No universities found for "{query}"</p>
        ) : (
          filtered.map((uni) => (
            <button
              key={uni.id}
              type="button"
              className={`university-option ${value === uni.id ? 'selected' : ''} ${!uni.available ? 'coming-soon' : ''}`}
              onClick={() => uni.available && onChange(uni.id)}
              disabled={!uni.available}
            >
              <div className="university-info">
                <div className="university-name-row">
                  <span className="university-name">{uni.name}</span>
                  <span className="university-abbr">{uni.abbreviation}</span>
                </div>
                <span className="university-location">{uni.location}</span>
              </div>
              {uni.available ? (
                value === uni.id && (
                  <svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )
              ) : (
                <span className="coming-soon-badge">Coming soon</span>
              )}
            </button>
          ))
        )}
      </div>

      {onRequestSchool && (
        <p className="university-request-prompt">
          Is your school not listed?{' '}
          <button
            type="button"
            className="university-request-link"
            onClick={onRequestSchool}
          >
            Fill out a request!
          </button>
        </p>
      )}
    </div>
  );
}
