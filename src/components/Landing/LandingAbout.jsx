import './LandingAbout.css';

const TEAM = [
  {
    name: 'Abigail Resheff',
    role: 'Founder, CEO & CTO',
    photo: '/team-abigail.png',
    bio: 'Abigail designed and built Bento from the ground up, out of frustration with her own dining hall experience at Brandeis. A software engineer and data scientist, she currently develops machine learning systems for NASA\'s Airspace Operations Laboratory, and believes the same rigor that goes into flight simulation should go into figuring out what to eat for lunch.',
  },
  {
    name: 'Allison Fuller',
    role: 'Head of Strategy & Marketing',
    photo: '/team-allison.jpg',
    bio: 'Allison leads Bento\'s business strategy and marketing, working to connect the product with the students and universities that need it most.',
  },
];

export default function LandingAbout() {
  return (
    <div className="landing-about">

      <section className="lab-hero">
        <p className="lab-eyebrow">About</p>
        <h1 className="lab-heading">
          Built for the dining hall.<br />
          By people who eat there.
        </h1>
        <p className="lab-intro">
          Bento started as a simple question: why is it so hard to eat well at a dining hall?
          The menu changes every day, nutrition data is buried in PDFs, and nothing helps you
          figure out what to actually put on your plate. We built Bento to fix that.
        </p>
      </section>

      <section className="lab-what">
        <div className="lab-what-inner">
          <div className="lab-what-block">
            <h2 className="lab-block-title">What we do</h2>
            <p className="lab-block-body">
              Bento pulls your university's live dining menu and builds a personalized meal plan
              around your nutrition goals and dietary restrictions. No logging every bite. No
              spreadsheets. Just a clear answer to "what should I eat today?"
            </p>
          </div>
          <div className="lab-what-block">
            <h2 className="lab-block-title">Who we are</h2>
            <p className="lab-block-body">
              Bento is an independent product built by students, for students. We are not
              affiliated with any university or dining service. We just think campus nutrition
              can be a lot better.
            </p>
          </div>
        </div>
      </section>

      <section className="lab-team">
        <p className="lab-eyebrow">The team</p>
        <div className="lab-team-list">
          {TEAM.map(({ name, role, photo, bio }) => (
            <div key={name} className="lab-card">
              <div className="lab-card-photo-wrap">
                <img src={photo} alt={name} className="lab-card-photo" />
              </div>
              <div className="lab-card-text">
                <p className="lab-card-name">{name}</p>
                <p className="lab-card-role">{role}</p>
                <p className="lab-card-bio">{bio}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="lab-contact">
        <h2 className="lab-contact-hed">Get in touch</h2>
        <p className="lab-contact-body">
          Questions, feedback, or want to bring Bento to your school?
        </p>
        <a className="lab-contact-link" href="mailto:bentodining@gmail.com">
          bentodining@gmail.com
        </a>
      </section>

    </div>
  );
}
