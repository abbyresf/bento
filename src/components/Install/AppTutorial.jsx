import { useState } from 'react';
import './AppTutorial.css';

const STEPS = [
  {
    bg: '#fff3e8',
    color: '#f47421',
    icon: (
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
    title: 'Welcome to Bento: your daily meal plan',
    body: "Every morning Bento pulls the live dining hall menu and builds a plan around your nutrition goals. No guesswork and no googling.",
  },
  {
    bg: '#e8f3ff',
    color: '#3b7dd8',
    icon: (
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5Z" />
        <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75Z" />
        <path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5Z" />
      </svg>
    ),
    title: "Bento's Pick",
    body: "Let Bento do the thinking. We pick items that hit your calorie and macro targets. Swap, remove, or add extras anytime you want.",
  },
  {
    bg: '#edfaf3',
    color: '#4cae70',
    icon: (
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="9" y1="6" x2="20" y2="6" />
        <line x1="9" y1="12" x2="20" y2="12" />
        <line x1="9" y1="18" x2="20" y2="18" />
        <polyline points="3 6 4 7 6 5" />
        <polyline points="3 12 4 13 6 11" />
        <circle cx="3.5" cy="18" r="0.5" fill="currentColor" stroke="none" />
        <line x1="9" y1="18" x2="14" y2="18" strokeWidth="1.8" />
        <line x1="17" y1="15" x2="17" y2="21" />
        <line x1="14" y1="18" x2="20" y2="18" />
      </svg>
    ),
    title: 'Build My Plate',
    body: "Prefer to choose yourself? Switch to Build My Plate, browse the full dining hall menu by station, and tap to add exactly what you're having.",
  },
  {
    bg: '#fff8ed',
    color: '#e8650a',
    icon: (
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 14.5A5 5 0 0 0 17 9c0-3-2-5-4-7-1 2.5-3 4-3 7a5 5 0 0 0 1 3" />
        <path d="M12 17c-2 0-3.5-1.5-3.5-3.5 0-1.5 1-2.5 1.5-3 .5 1.5 1.5 2 2 2.5.5-1 .5-2.5 1.5-3.5.5 1.5 1.5 2 1.5 4 0 2-1.5 3.5-3 3.5Z" />
      </svg>
    ),
    title: 'Build your streak',
    body: 'Tap "Mark as Eaten" after each meal to log it. Complete all available meals in a day and your streak grows. The higher your streak, the more badges you get!',
  },
  {
    bg: '#f3f0ff',
    color: '#7c5cbf',
    icon: (
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
        <line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    ),
    title: 'Insights & favorites',
    body: "Watch your daily macro progress update live. Heart foods you love to boost them in future plans, and check Insights for your weekly highlights.",
  },
];

export default function AppTutorial({ onDone }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-sheet">
        <div className="tutorial-handle" />
        <button className="tutorial-skip" onClick={onDone}>Skip</button>

        <div className="tutorial-content" key={step}>
          <div className="tutorial-icon-wrap" style={{ background: current.bg }}>
            <span style={{ color: current.color, display: 'flex' }}>{current.icon}</span>
          </div>

          <p className="tutorial-step-label">Step {step + 1} of {STEPS.length}</p>
          <h2 className="tutorial-title">{current.title}</h2>
          <p className="tutorial-body">{current.body}</p>
        </div>

        <div className="tutorial-dots">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`tutorial-dot ${i === step ? 'active' : ''}`}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        <button className="tutorial-next" onClick={() => isLast ? onDone() : setStep(s => s + 1)}>
          {isLast ? "Let's eat!" : 'Next'}
        </button>
      </div>
    </div>
  );
}
