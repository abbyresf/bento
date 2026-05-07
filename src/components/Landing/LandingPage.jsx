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

export default function LandingPage({ onGetStarted, initialTab = 'home' }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-nav-logo">
            <img src="/logo-cropped.png" alt="Bento" className="landing-logo-img" />
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

      <footer className="landing-footer">
        <p className="landing-footer-disclaimer">
          Bento is an independent application and is not affiliated with, endorsed by, or
          sponsored by Brandeis University or its dining services. Nutritional information
          is provided for general planning purposes only and may not be accurate. Not a
          substitute for professional medical or dietary advice. Always verify allergen
          information with dining staff.
        </p>
        <p className="landing-footer-links">
          <button className="landing-footer-link" onClick={() => setActiveTab('terms')}>Terms & Conditions</button>
          <span>·</span>
          <button className="landing-footer-link" onClick={() => setActiveTab('faq')}>FAQ</button>
          <span>·</span>
          <button className="landing-footer-link" onClick={() => setActiveTab('contact')}>Contact</button>
        </p>
        <p className="landing-footer-copy">© {new Date().getFullYear()} Bento. All rights reserved.</p>
      </footer>
    </div>
  );
}
