import { haptics } from '../../lib/haptics';
import { useFriends } from '../../lib/friendsStore';
import { hereNow } from '../../data/duo';
import './BottomNav.css';

export default function BottomNav({ activeTab, onTabChange }) {
  const { status, friends } = useFriends();
  const someoneOut = hereNow(friends).length > 0;
  const tabs = [
    {
      id: 'today',
      label: 'Today',
      icon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
    },
    {
      id: 'friends',
      label: 'Friends',
      dot: someoneOut,
      icon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8.5" cy="8" r="3.5"/>
          <path d="M2 20v-1.5a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5V20"/>
          <circle cx="17" cy="9" r="2.8"/>
          <path d="M17.5 14a4.2 4.2 0 0 1 4.5 4.2V20"/>
        </svg>
      ),
    },
    {
      id: 'ratings',
      label: 'My Ratings',
      // This one genuinely uses `active`: the star fills in on the current tab.
      // The other three ignore it.
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ),
    },
    {
      id: 'community',
      label: 'Community',
      icon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
    },
    {
      id: 'insights',
      label: 'Insights',
      icon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10"/>
          <line x1="12" y1="20" x2="12" y2="4"/>
          <line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      ),
    },
  ].filter((t) => t.id !== 'friends' || status !== 'unavailable');

  return (
    <nav className="bottom-nav">
      {tabs.map(tab => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`bottom-nav-tab${active ? ' active' : ''}`}
            onClick={() => {
              if (!active) haptics.selection();
              onTabChange(tab.id);
            }}
            aria-label={tab.dot ? `${tab.label}, a friend is at a dining hall` : tab.label}
          >
            {tab.icon(active)}
            {tab.dot && !active ? <span className="bottom-nav-dot" aria-hidden="true" /> : null}
            <span className="bottom-nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
