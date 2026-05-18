import { useState } from 'react';
import './AppTutorial.css';

const STEPS = [
  {
    emoji: '🍱',
    title: 'Your daily meal plan',
    body: "Each day Bento builds a personalized plan from your dining hall's live menu. Tap a meal to expand it and see what's on your plate.",
  },
  {
    emoji: '✅',
    title: 'Mark meals as eaten',
    body: 'Tap "Mark as Eaten" after a meal to log it. You can also swap items, remove things you don\'t want, or add extras from the dining hall.',
  },
  {
    emoji: '📊',
    title: 'Track your nutrition',
    body: 'The Daily Progress card shows your running calorie and macro totals vs. your targets. It updates live as you confirm meals.',
  },
  {
    emoji: '❤️',
    title: 'Save your favorites',
    body: "Heart items you love — they'll be boosted in your future plans. Find everything you've saved in the Saved tab below.",
  },
];

export default function AppTutorial({ onDone }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const { emoji, title, body } = STEPS[step];

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-sheet">
        <div className="tutorial-handle" />

        <button className="tutorial-skip" onClick={onDone}>Skip</button>

        <div className="tutorial-emoji">{emoji}</div>
        <h2 className="tutorial-title">{title}</h2>
        <p className="tutorial-body">{body}</p>

        <div className="tutorial-dots">
          {STEPS.map((_, i) => (
            <span key={i} className={`tutorial-dot ${i === step ? 'active' : ''}`} />
          ))}
        </div>

        <button className="tutorial-next" onClick={() => isLast ? onDone() : setStep(s => s + 1)}>
          {isLast ? 'Get started' : 'Next'}
        </button>
      </div>
    </div>
  );
}
