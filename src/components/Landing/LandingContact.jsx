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
          <p>Contact form coming soon.</p>
          <p className="contact-placeholder-sub">
            In the meantime, reach out to the Bento team directly.
          </p>
        </div>
      </div>
    </div>
  );
}
