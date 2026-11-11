import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMealHistory, getNutritionTargets, getStreak, getUserProfile } from '../../lib/db';
import { UNIVERSITIES } from '../../data/universities';
import Mascot from '../Mascot/Mascot';
import LoudMyRatings from '../MyRatings/LoudMyRatings';
import InsightsPanel from '../Insights/InsightsPanel';
import Closet from '../Mascot/Closet';
import { weekSummary, activeDays } from './youStats.js';
import './loud.css';
import './loud-you.css';

const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

async function fetchYou() {
  const [profile, history, targets, streak] = await Promise.all([
    getUserProfile(), getMealHistory().catch(() => []), getNutritionTargets().catch(() => null), getStreak().catch(() => null),
  ]);
  return { profile, history: history ?? [], proteinTarget: targets?.macros?.protein ?? targets?.protein ?? null, streak };
}

/* The You tab in the Loud pilot. Insights and My Ratings live here now: the week at a glance, protein by day against
 * the goal, the last two weeks as a streak calendar, then links to ratings, badges and settings. */
export default function LoudYou({ onOpenSettings }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState('home');   // home | ratings | insights
  const [closet, setCloset] = useState(false);

  useEffect(() => {
    let live = true;
    fetchYou().then((d) => { if (live) setData(d); });
    return () => { live = false; };
  }, [page]);

  if (page === 'ratings') return <Sub title="Your ratings" onBack={() => setPage('home')}><LoudMyRatings tabMode /></Sub>;
  if (page === 'insights') return <Sub title="Insights" onBack={() => setPage('home')}><InsightsPanel tabMode onClose={() => setPage('home')} /></Sub>;

  const week = data ? weekSummary(data.history, data.proteinTarget) : null;
  const cal = data ? activeDays(data.history) : [];
  const school = UNIVERSITIES.find((u) => u.id === data?.profile?.university);
  const streak = data?.streak?.currentStreak ?? 0;
  const best = data?.streak?.longestStreak ?? 0;
  const maxP = Math.max(data?.proteinTarget ?? 0, ...(week?.proteinByDay ?? [0]), 1);

  return (
    <section className="loud loud-you" aria-label="You">
      <span className="loud-glow" style={{ background: 'var(--or)', width: 240, height: 240, right: -60, top: 30 }} />
      <span className="loud-glow" style={{ background: 'var(--sk)', width: 220, height: 220, left: -70, top: 440 }} />

      <div className="ly-head">
        <button type="button" className="ly-av" onClick={() => setCloset(true)} aria-label="Open Bento's closet"><Mascot size={48} hop={false} /></button>
        <div>
          <h1 className="ly-title">You</h1>
          <span className="ly-sub">{school?.shortName ?? school?.name ?? ''}{school && streak ? ' · ' : ''}{streak ? `${streak}-day streak` : ''}</span>
        </div>
      </div>

      <div className="ly-k">This week</div>
      <div className="ly-stats">
        <div style={{ background: 'var(--or)' }}><b>{week?.mealsLogged ?? '–'}</b><span>meals logged</span></div>
        <div style={{ background: 'var(--li)' }}><b>{week ? `${week.avgProtein}g` : '–'}</b><span>avg protein</span></div>
        <div style={{ background: 'var(--sk)' }}><b>{week?.newDishes ?? '–'}</b><span>new dishes</span></div>
      </div>

      {week && data.proteinTarget ? (
        <div className="ly-card loud-glass">
          <div className="ly-card-head"><span>Protein by day</span><span className="hit">{week.daysOnGoal} of 7 on goal</span></div>
          <div className="ly-chart" style={{ '--goal': `${Math.round((data.proteinTarget / maxP) * 100)}%` }}>
            {week.proteinByDay.map((p, i) => (
              <i key={week.days[i]} className={p >= data.proteinTarget * 0.8 ? 'on' : ''} style={{ height: `${Math.max(4, Math.round((p / maxP) * 100))}%` }} title={`${p}g`} />
            ))}
          </div>
          <div className="ly-days">{week.days.map((d) => <span key={d}>{DAY_LETTER[new Date(`${d}T12:00:00`).getDay()]}</span>)}</div>
          <div className="ly-goal-label">Goal {Math.round(data.proteinTarget)}g</div>
        </div>
      ) : null}

      <div className="ly-card loud-glass">
        <div className="ly-card-head"><span>Last two weeks</span><span>{best ? `Best streak ${best}` : ''}</span></div>
        <div className="ly-cal">
          {cal.map((c) => <i key={c.day} className={`${c.logged ? 'on' : ''}${c.today ? ' today' : ''}`} title={c.day} />)}
        </div>
      </div>

      <div className="ly-links loud-glass">
        <button type="button" onClick={() => setCloset(true)}>Closet<span>›</span></button>
        <button type="button" onClick={() => setPage('ratings')}>Your ratings<span>›</span></button>
        <button type="button" onClick={() => setPage('insights')}>Insights<span>›</span></button>
        <button type="button" onClick={onOpenSettings}>Settings<span>›</span></button>
      </div>
      {closet && createPortal(<Closet onClose={() => setCloset(false)} />, document.body)}
    </section>
  );
}

function Sub({ title, onBack, children }) {
  return (
    <section className="loud loud-you is-sub" aria-label={title}>
      <button type="button" className="ly-back" onClick={onBack}>‹ You</button>
      {children}
    </section>
  );
}
