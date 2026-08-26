import { useState } from 'react';
import {
  UtensilsCrossed,
  Sparkles,
  ClipboardList,
  Star,
  Users,
  BarChart2,
} from 'lucide-react';
import './AppTutorial.css';

const STEPS = [
  {
    bg: '#fff3e8',
    color: '#f47421',
    Icon: UtensilsCrossed,
    title: 'Your dining hall, every morning',
    body: 'Bento pulls your dining hall\'s live menu each day and builds a meal plan around your calorie and macro goals.',
  },
  {
    bg: '#f0f4ff',
    color: '#3b7dd8',
    Icon: Sparkles,
    title: "Bento's Pick",
    body: 'We pick items that fit your targets. Swap, remove, or add anytime.',
  },
  {
    bg: '#edfaf3',
    color: '#4cae70',
    Icon: ClipboardList,
    title: 'Build My Plate',
    body: 'Prefer to choose yourself? Browse the full menu by station and tap to add what you\'re having.',
  },
  {
    bg: '#fdf2f8',
    color: '#c026d3',
    Icon: Star,
    title: 'Rate your meals',
    body: 'Rate dishes after you eat. Your ratings feed the leaderboard and make your future plans smarter.',
  },
  {
    bg: '#f0fdfa',
    color: '#0d9488',
    Icon: Users,
    title: 'Community',
    body: 'See what students at your school are eating and rating. Your feedback goes straight to your dining admin.',
  },
  {
    bg: '#f3f0ff',
    color: '#7c5cbf',
    Icon: BarChart2,
    title: 'Insights',
    body: 'Track your nutrition week by week. See calorie trends, top foods, and how your habits change over time.',
  },
];

export default function AppTutorial({ onDone }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const { Icon } = current;

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-sheet">
        <div className="tutorial-handle" />
        <button className="tutorial-skip" onClick={onDone}>Skip</button>

        <div className="tutorial-content" key={step}>
          <div className="tutorial-icon-wrap" style={{ background: current.bg }}>
            <Icon size={34} color={current.color} strokeWidth={1.8} />
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
