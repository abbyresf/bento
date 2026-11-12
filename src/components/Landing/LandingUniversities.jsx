import { useState } from 'react';
import emailjs from '@emailjs/browser';
import PulseCarousel from './PulseCarousel';
import './LandingUniversities.css';

/* Bento Pulse, for dining administrators. The Loud palette and type, held back:
 * sentence case, one accent, no stickers, so it reads as a product a director can
 * take to leadership. */

const STATS = [
  { num: '0',   label: 'hours of data entry for your staff' },
  { num: '7',   label: 'dietary needs tracked from day one' },
  { num: 'No',  label: 'integration with your dining system' },
  { num: 'CSV', label: 'export for stakeholder reports' },
];

const FEATURES = [
  { title: 'Back menu decisions with usage data.', desc: 'See which dishes students choose, how often, and at which meal. When leadership asks why a menu changed, you have the numbers.' },
  { title: 'Spot problems before end-of-semester surveys.', desc: 'Week-over-week comparisons show falling participation and menu gaps while there’s still time to respond.' },
  { title: 'Know your accommodation needs.', desc: 'See the share of students who report vegetarian, vegan, kosher, halal, gluten-free, dairy-free and nut-free needs. Plan menus around your campus’s real numbers.' },
  { title: 'Hand leadership the report.', desc: 'Export charts and metrics to CSV. Bring the numbers to your next meeting without building a deck from scratch.' },
  { title: 'Student suggestions in one place.', desc: 'Students post suggestions from the Bento app and upvote each other’s. Every one lands in Pulse, sorted and searchable.' },
  { title: 'Ask students directly.', desc: 'Send a one-question survey to every student or to one dietary group, and watch the results arrive while it runs.' },
];

const STEPS = [
  { title: 'Students plan meals with Bento.', desc: 'Each student gets a daily plan built from your dining hall menu, their dietary needs and their goals. Every meal they confirm is a data point.' },
  { title: 'Pulse builds your dashboard.', desc: 'Confirmed meals flow into your dashboard as students log them. No uploads, no integration with your dining system, nothing for IT to set up.' },
  { title: 'Your team acts on the numbers.', desc: 'Find your most popular dishes, track nutrition trends, spot accommodation gaps, read student suggestions and share findings with leadership.' },
];

const TRUST = [
  { title: 'Aggregates only.', body: 'Pulse shows totals and shares, never individual students. No names, no individual records, and nothing crosses to another campus.' },
  { title: 'No work for IT.', body: 'Bento reads your published dining menus. No API, no data migration, nothing for your technical staff to build or maintain.' },
  { title: 'Built for dining staff.', body: 'No analyst needed. Pulse is made for the people who run campus dining.' },
];

export default function LandingUniversities() {
  const [consultStatus, setConsultStatus] = useState('idle'); // idle | sending | success | error

  const handleConsultSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const name        = data.get('name') || '';
    const institution = data.get('institution') || '';
    const email       = data.get('email') || '';
    const role        = data.get('role') || '';
    setConsultStatus('sending');
    try {
      await emailjs.send(
        'service_0fhib6k',
        'template_4r7zn6c',
        {
          from_name: `${name}${institution ? ', ' + institution : ''}`,
          reply_to:  email,
          subject:   `Consultation Request${institution ? ': ' + institution : ''}`,
          message:   `Name: ${name}\nInstitution: ${institution}\nRole: ${role}\nEmail: ${email}`,
        },
        { publicKey: 'urTn8G5d8khZF0NfZ' },
      );
      setConsultStatus('success');
      e.target.reset();
    } catch {
      setConsultStatus('error');
    }
  };

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="landing-universities lpu">

      <section className="lpu-hero">
        <div className="lpu-wrap">
          <img className="lpu-wordmark" src="/bentopulse-light.png" alt="Bento Pulse" width="1075" height="257" />
          <h1 className="lpu-h1">
            Your system knows what’s served.<br />
            <span>Pulse shows what students choose.</span>
          </h1>
          <p className="lpu-lede">
            Pulse shows your dining team what students confirm at each meal, the dietary needs
            they report and the feedback they leave. One dashboard, scoped to your campus.
          </p>
          <div className="lpu-actions">
            <button className="lpu-btn lpu-btn--primary" onClick={() => scrollTo('lpu-consult')}>Book a free consultation</button>
            <button className="lpu-btn lpu-btn--ghost" onClick={() => scrollTo('lpu-mockup-section')}>See the dashboard</button>
          </div>
        </div>
      </section>

      <section className="lpu-stats" aria-label="At a glance">
        <div className="lpu-wrap lpu-stats-grid">
          {STATS.map(s => (
            <div key={s.label} className="lpu-stat">
              <span className="lpu-stat-num">{s.num}</span>
              <span className="lpu-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="lpu-section" id="lpu-mockup-section">
        <div className="lpu-wrap">
          <div className="lpu-head">
            <h2 className="lpu-h2">Built around your team’s questions.</h2>
            <p className="lpu-sub">
              Every dining program tracks something different. We set Pulse up around the questions
              your team already asks. Tell us what matters on your campus and we’ll track it.
            </p>
          </div>
          <PulseCarousel />
          <p className="lpu-note">Screens from a demo account with generated figures. Your view shows your own campus.</p>
        </div>
      </section>

      <section className="lpu-section">
        <div className="lpu-wrap">
          <div className="lpu-head">
            <h2 className="lpu-h2">Answers your team can act on.</h2>
          </div>
          <div className="lpu-features">
            {FEATURES.map(f => (
              <div key={f.title} className="lpu-feature">
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lpu-section">
        <div className="lpu-wrap">
          <div className="lpu-head">
            <h2 className="lpu-h2">Live on your campus in under a week.</h2>
          </div>
          <ol className="lpu-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="lpu-step">
                <span className="lpu-step-num" aria-hidden="true">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lpu-section lpu-trust">
        <div className="lpu-wrap lpu-trust-grid">
          {TRUST.map(t => (
            <div key={t.title} className="lpu-trust-item">
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lpu-section lpu-consult" id="lpu-consult">
        <div className="lpu-wrap lpu-consult-grid">
          <div>
            <h2 className="lpu-h2">Let’s talk about your campus.</h2>
            <p className="lpu-sub">
              Pricing depends on your campus size and needs. Start with a free 30-minute call and
              we’ll walk you through Pulse for your dining program.
            </p>
            <ul className="lpu-terms">
              <li>Custom pricing, sized to your student body</li>
              <li>Free first consultation</li>
              <li>Reply within one business day</li>
            </ul>
          </div>

          {consultStatus === 'success' ? (
            <div className="lpu-done" role="status">
              <h3>Request received.</h3>
              <p>We’ll reply within one business day to set up a time.</p>
            </div>
          ) : (
            <form className="lpu-form" onSubmit={handleConsultSubmit}>
              <div className="lpu-form-row">
                <label className="lpu-field">
                  <span>Your name</span>
                  <input name="name" type="text" placeholder="Jane Smith" required />
                </label>
                <label className="lpu-field">
                  <span>Institution</span>
                  <input name="institution" type="text" placeholder="State University" required />
                </label>
              </div>
              <div className="lpu-form-row">
                <label className="lpu-field">
                  <span>Work email</span>
                  <input name="email" type="email" placeholder="jane@university.edu" required />
                </label>
                <label className="lpu-field">
                  <span>Your role</span>
                  <input name="role" type="text" placeholder="Director of Dining Services" />
                </label>
              </div>
              {consultStatus === 'error' && (
                <p className="lpu-error">Something went wrong. Email us at <a href="mailto:bentodining@gmail.com">bentodining@gmail.com</a>.</p>
              )}
              <button className="lpu-btn lpu-btn--primary" type="submit" disabled={consultStatus === 'sending'}>
                {consultStatus === 'sending' ? 'Sending…' : 'Request a free consultation'}
              </button>
            </form>
          )}
        </div>
      </section>

    </div>
  );
}
