import { useState } from 'react';
import LandingHome from './LandingHome';
import LandingFAQ from './LandingFAQ';
import LandingContact from './LandingContact';
import LandingRequestSchool from './LandingRequestSchool';
import TermsPage from '../Terms/TermsPage';
import './LandingPage.css';

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'universities', label: 'For Universities' },
  { id: 'faq', label: 'FAQ' },
  { id: 'terms', label: 'Terms & Conditions' },
  { id: 'contact', label: 'Contact' },
];

export default function LandingPage({ onGetStarted, initialTab = 'home' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setDrawerOpen(false);
  };

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <button
            className="landing-hamburger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <span />
            <span />
            <span />
          </button>
          <div className="landing-nav-logo-wrap">
            <img src="/BentoNoWords.png" alt="Bento" className="landing-logo-img" />
          </div>
          <div className="landing-nav-spacer" />
        </div>
      </header>

      {drawerOpen && (
        <div
          className="landing-drawer-overlay"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <nav className={`landing-drawer${drawerOpen ? ' open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="landing-drawer-header">
          <img src="/logo-cropped-beige.png" alt="Bento" className="landing-drawer-logo" />
          <button
            className="landing-drawer-close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>
        <div className="landing-drawer-items">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`landing-drawer-item${activeTab === tab.id ? ' active' : ''}${tab.id === 'universities' ? ' highlight' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="landing-main">
        {activeTab === 'home' && (
          <LandingHome
            onGetStarted={onGetStarted}
            onGoUniversities={() => handleTabChange('universities')}
          />
        )}
        {activeTab === 'universities' && (
          <div className="landing-coming-soon">
            <h2>University Partnerships</h2>
            <p>This page is coming soon. Reach out via the contact page in the meantime.</p>
          </div>
        )}
        {activeTab === 'faq' && <LandingFAQ />}
        {activeTab === 'terms' && (
          <div className="landing-terms-wrap">
            <TermsPage />
          </div>
        )}
        {activeTab === 'contact' && <LandingContact />}
        {activeTab === 'request' && <LandingRequestSchool />}
      </main>

      <footer className="landing-footer">
        <p className="landing-footer-disclaimer">
          Bento is an independent application and is not affiliated with, endorsed by, or
          sponsored by any university or its dining services. Nutritional information is
          provided for general planning purposes only and may not be accurate. Not a
          substitute for professional medical or dietary advice. Always verify allergen
          information with dining staff.
        </p>
        <p className="landing-footer-links">
          <button className="landing-footer-link" onClick={() => handleTabChange('terms')}>Terms &amp; Conditions</button>
          <span>·</span>
          <button className="landing-footer-link" onClick={() => handleTabChange('faq')}>FAQ</button>
          <span>·</span>
          <button className="landing-footer-link" onClick={() => handleTabChange('contact')}>Contact</button>
        </p>
        <p className="landing-footer-copy">© {new Date().getFullYear()} Bento. All rights reserved.</p>
      </footer>
    </div>
  );
}
