import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setThemePref } from '../lib/db';

/* Three states, not a boolean. A settings-only light/dark switch means a
   student with their phone in dark mode opens Bento to a bright cream screen,
   so "system" is the default and has to stay a real, distinct choice.

   localStorage is the source of truth on load. Reading the preference from
   Supabase first would flash the wrong theme on every page load while the
   request is in flight, so the network round trip only ever writes. */

const STORAGE_KEY = 'bento_theme';
const VALID = ['system', 'light', 'dark'];

const ThemeContext = createContext({
  theme: 'system',
  resolved: 'light',
  setTheme: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext);
}

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

// Kept in sync with the inline boot script in index.html. That script runs
// before first paint to stop the flash; this is the same logic for React.
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Without this the iOS status bar and the Android address bar stay cream
  // while the app underneath is navy.
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = dark ? '#24384F' : '#FBF9F7';

  return dark ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored);
  const [resolved, setResolved] = useState(() =>
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark'
      : 'light'
  );

  useEffect(() => {
    setResolved(applyTheme(theme));
  }, [theme]);

  // On "system", follow the OS live rather than only at load.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(applyTheme('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (!VALID.includes(next)) return;
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }

    // Second, and never blocking.
    setThemePref(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
