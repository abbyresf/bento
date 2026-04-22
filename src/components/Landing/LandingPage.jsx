import { useState } from 'react';
import LandingHome from './LandingHome';
import LandingFAQ from './LandingFAQ';
import LandingContact from './LandingContact';
import TermsPage from '../Terms/TermsPage';
import './LandingPage.css';

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'faq', label: 'FAQ' },
  { id: 'terms', label: 'Terms' },
  { id: 'contact', label: 'Contact' },
];

export default function LandingPage({ onGetStarted }) {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-nav-logo">
            <img src="/logo.png" alt="Bento" className="landing-logo-img" />
          </div>
          <nav className="landing-nav-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`landing-nav-tab${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="landing-main">
        {activeTab === 'home' && <LandingHome onGetStarted={onGetStarted} />}
        {activeTab === 'faq' && <LandingFAQ />}
        {activeTab === 'terms' && (
          <div className="landing-terms-wrap">
            <TermsPage />
          </div>
        )}
        {activeTab === 'contact' && <LandingContact />}
      </main>
    </div>
  );
}
