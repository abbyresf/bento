import { useState } from 'react';
import TERMS_SECTIONS from './termsSections.jsx';
import './TermsGate.css';

export default function TermsGate({ onAccept }) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="terms-screen">
      <div className="terms-card">
        <div className="terms-logo-row">
          <img src="/logo-cropped.png" alt="Bento" className="terms-logo" />
        </div>

        <h1 className="terms-title">Before you continue</h1>
        <p className="terms-subtitle">
          Please read and agree to the following before using Bento.
        </p>

        <div className="terms-body">
          {TERMS_SECTIONS.map((section) => (
            <section key={section.id} className="terms-section">
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>

        <label className="terms-checkbox-row">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="terms-checkbox"
          />
          <span>
            I have read and understand the above. I agree to use Bento for general
            informational purposes only and acknowledge it is not a substitute for
            professional medical or nutritional advice.
          </span>
        </label>

        <button
          className="terms-continue-btn"
          disabled={!checked}
          onClick={onAccept}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
