import { BentoSticker, HallMarquee } from './LoudSticker';
import './landingLoud.css';
import './LandingAbout.css';

export default function LandingAbout() {
  return (
    <div className="ld ld-page ld-about">
      <div className="ld-glow" style={{ width: 420, height: 420, background: 'var(--ld-or)', right: '-4%', top: -40, opacity: .32 }} />
      <section className="ld-page-inner ld-about-hero">
        <h1 className="ld-page-h1 ld-enter">Built for the dining hall.<br /><span className="o">By people who eat there.</span></h1>
        <div className="ld-about-intro">
          <p className="ld-page-sub ld-enter">
            Bento started with one question: why is eating well at a dining hall so hard? The menu changes
            daily. Nutrition facts hide in PDFs. Nothing tells you what to put on your plate. So we built Bento.
          </p>
          <BentoSticker className="ld-about-sticker" />
        </div>
      </section>

      <HallMarquee />

      <section className="ld-about-grid">
        <div className="ld-about-blk ld-enter" style={{ background: 'var(--ld-li)' }}>
          <h2>What we do</h2>
          <p>Bento reads your school’s live menu and builds a plate around your goals and restrictions. No logging every bite. One clear answer to “what should I eat today?”</p>
        </div>
        <div className="ld-about-blk ld-enter" style={{ background: 'var(--ld-sk)' }}>
          <h2>Who we are</h2>
          <p>Students building for students. Bento is independent, with no ties to any university or dining service.</p>
        </div>
      </section>

      <section className="ld-founder">
        <div className="ld-founder-card">
          <div className="ld-founder-photo">
            <img src="/team-abigail.jpg" alt="Abigail Resheff" width="600" height="793" loading="lazy" />
          </div>
          <div className="ld-founder-tx">
            <h2>Abigail Resheff</h2>
            <p className="ld-founder-role">Founder, CEO &amp; CTO</p>
            <p>
              Abigail designed and built Bento after one too many confusing meals at Brandeis. She’s a software
              engineer and data scientist building machine learning systems at NASA’s Airspace Operations
              Laboratory. She brings the same rigor to lunch.
            </p>
          </div>
        </div>
      </section>

      <section className="ld-about-contact">
        <h2 className="ld-page-h1">Say hi.</h2>
        <p className="ld-page-sub">Questions, feedback, or want Bento at your school?</p>
        <a className="ld-btn ld-btn--or" href="mailto:bentodining@gmail.com">bentodining@gmail.com</a>
      </section>
    </div>
  );
}
