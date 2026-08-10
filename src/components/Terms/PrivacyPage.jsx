import PRIVACY_SECTIONS from './privacySections.jsx';
import './TermsPage.css';

export default function PrivacyPage() {
  return (
    <div className="terms-page">
      <div className="terms-page-header">
        <h1>Privacy Policy</h1>
        <p className="terms-page-sub">Last updated August 2026</p>
      </div>

      <div className="terms-page-body">
        <p className="terms-page-intro">
          Bento collects personal and health-related data to power your meal recommendations.
          This policy explains exactly what we collect, how we use it, and your rights over it.
          We do not sell your data. We do not share individual user data with your university or dining hall.
        </p>

        {PRIVACY_SECTIONS.map((section) => (
          <section key={section.id} className="terms-page-section">
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}

        <p className="terms-page-footer-note">
          Questions about your data? Contact us at bentodining@gmail.com.
        </p>
      </div>
    </div>
  );
}
