import { useTheme } from '../../context/ThemeContext';
import './ThemePreview.css';

/* Three states, not a switch. A light/dark toggle that ignores the OS means
   someone whose phone is in dark mode opens Bento to a bright cream screen,
   so System is a real option and the default.

   Sitting in the Today header for the palette review. Its home is Settings. */

const OPTIONS = [
  { id: 'system', label: 'System' },
  { id: 'light',  label: 'Light'  },
  { id: 'dark',   label: 'Dark'   },
];

export default function ThemePreview() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="theme-preview" role="group" aria-label="Theme">
      {OPTIONS.map(opt => (
        <button
          key={opt.id}
          type="button"
          className={`theme-preview-btn${theme === opt.id ? ' active' : ''}`}
          aria-pressed={theme === opt.id}
          onClick={() => setTheme(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
