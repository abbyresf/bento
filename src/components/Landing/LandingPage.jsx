import { useState, useEffect } from 'react';
import LandingHome from './LandingHome';
import LandingAbout from './LandingAbout';
import LandingContact from './LandingContact';
import LandingRequestSchool from './LandingRequestSchool';
import LandingUniversities from './LandingUniversities';
import TermsPage from '../Terms/TermsPage';
import PrivacyPage from '../Terms/PrivacyPage';
import { APP_STORE_URL } from '../../data/links';
import './LandingPage.css';

const NAV_TABS = [
  { id: 'home',         label: 'For Students' },
  { id: 'universities', label: 'For Universities' },
  { id: 'about',        label: 'About' },
  { id: 'contact',      label: 'Contact' },
];

export default function LandingPage({ onGetStarted, initialTab = 'home' }) {
  const [activeTab, setActiveTab]   = useState(initialTab);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled]     = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="landing-page">

      {/* ── Nav ── */}
      <header className={`landing-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="landing-nav-inner">

          {/* Mobile: hamburger */}
          <button
            className="landing-hamburger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <span /><span /><span />
          </button>

          {/* Logo */}
          <button className="landing-nav-logo-btn" onClick={() => handleTabChange('home')} aria-label="Bento home">
            <img src="/logo-cropped.png" alt="Bento" className="landing-logo-img" />
          </button>

          {/* Desktop links */}
          <nav className="landing-nav-links" aria-label="Main navigation">
            {NAV_TABS.map(tab => (
              <button
                key={tab.id}
                className={`landing-nav-link${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Desktop CTA */}
          {/* Labelled with the platform, so nobody learns it is iOS only after
              the click. The hero below carries the browser option. */}
          <a className="landing-nav-badge" href={APP_STORE_URL}
            target="_blank" rel="noopener noreferrer">
            <img src="/app-store-badge.svg" alt="Download on the App Store" width="120" height="40" />
          </a>

          {/* Mobile spacer */}
          <div className="landing-nav-spacer" aria-hidden="true" />
        </div>
      </header>

      {/* ── Mobile drawer ── */}
      {drawerOpen && (
        <div className="landing-drawer-overlay" onClick={() => setDrawerOpen(false)} />
      )}

      <nav className={`landing-drawer${drawerOpen ? ' open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="landing-drawer-header">
          <img src="/logo-cropped-beige.png" alt="Bento" className="landing-drawer-logo" />
          <button className="landing-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">×</button>
        </div>
        <div className="landing-drawer-items">
          {NAV_TABS.map(tab => (
            <button
              key={tab.id}
              className={`landing-drawer-item${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          <div className="landing-drawer-divider" />
          <a className="landing-drawer-badge" href={APP_STORE_URL}
            target="_blank" rel="noopener noreferrer"
            onClick={() => setDrawerOpen(false)}>
            <img src="/app-store-badge.svg" alt="Download on the App Store" width="150" height="50" />
          </a>
          <button className="landing-drawer-web" onClick={() => { onGetStarted(); setDrawerOpen(false); }}>
            Or use it in your browser
          </button>
        </div>
      </nav>

      {/* ── Content ── */}
      <main className="landing-main">
        {activeTab === 'home' && (
          <LandingHome onGoUniversities={() => handleTabChange('universities')} />
        )}
        {activeTab === 'universities' && (
          <LandingUniversities />
        )}
        {activeTab === 'about'   && <LandingAbout />}
        {activeTab === 'terms'   && <div className="landing-terms-wrap"><TermsPage /></div>}
        {activeTab === 'privacy' && <div className="landing-terms-wrap"><PrivacyPage /></div>}
        {activeTab === 'contact' && <LandingContact />}
        {activeTab === 'request' && <LandingRequestSchool />}
      </main>

      {/* ── Footer ── */}
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
          <button className="landing-footer-link" onClick={() => handleTabChange('privacy')}>Privacy Policy</button>
          <span>·</span>
          <button className="landing-footer-link" onClick={() => handleTabChange('about')}>About</button>
          <span>·</span>
          <button className="landing-footer-link" onClick={() => handleTabChange('contact')}>Contact</button>
        </p>
        <p className="landing-footer-copy">© {new Date().getFullYear()} Bento. All rights reserved.</p>
      </footer>
    </div>
  );
}
