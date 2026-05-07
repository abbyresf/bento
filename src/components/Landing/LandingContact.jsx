import './LandingContact.css';

export default function LandingContact() {
  return (
    <div className="landing-contact">
      <div className="contact-inner">
        <h1 className="contact-heading">Contact Us</h1>
        <p className="contact-sub">
          Have a question, a bug report, or just want to say hi? We'd love to hear from you.
        </p>
        <div className="contact-placeholder">
          <span className="contact-placeholder-icon">✉️</span>
          <p>
            Email us at{' '}
            <a href="mailto:bentodining@gmail.com" className="contact-email-link">bentodining@gmail.com</a>
          </p>
          <p className="contact-placeholder-sub">
            We typically respond within 1–2 business days.
          </p>
        </div>
      </div>
    </div>
  );
}
