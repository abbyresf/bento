import TERMS_SECTIONS from './termsSections.jsx';
import './TermsPage.css';

export default function TermsPage() {
  return (
    <div className="terms-page">
      <div className="terms-page-header">
        <h1>Terms &amp; Conditions</h1>
        <p className="terms-page-sub">Last updated April 2026</p>
      </div>

      <div className="terms-page-body">
        <p className="terms-page-intro">
          Bento is a free meal planning tool for Brandeis University students. By using
          this app you agreed to the following at first launch. These terms are provided
          here for your reference.
        </p>

        {TERMS_SECTIONS.map((section) => (
          <section key={section.id} className="terms-page-section">
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}

        <p className="terms-page-footer-note">
          Questions or concerns? Reach out to the Bento team directly.
        </p>
      </div>
    </div>
  );
}
