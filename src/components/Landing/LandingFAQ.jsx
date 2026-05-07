import { useState } from 'react';
import './LandingFAQ.css';

const FAQS = [
  {
    q: 'Is Bento free to use?',
    a: 'Yes. Bento is completely free for all university students. No account, no subscription, and no credit card needed.',
  },
  {
    q: 'How does Bento get the dining hall menu?',
    a: 'Bento pulls your university\'s live dining menu directly so your meal plan always reflects what\'s actually being served that day. No manual data entry required.',
  },
  {
    q: 'Is this real medical or nutritional advice?',
    a: 'No. Bento is a general-purpose planning tool based on publicly available nutrition data and standard TDEE calculations. It is not a substitute for advice from a registered dietitian, doctor, or other health professional.',
  },
  {
    q: 'How does the meal recommendation work?',
    a: 'Bento uses a scoring algorithm that weighs your macro targets, calorie budget, dietary restrictions, and past favorites. It tries to maximize how close your plate gets to your daily goals given what\'s available at each station.',
  },
  {
    q: 'Will Bento remember my preferences?',
    a: 'Yes. Your dietary restrictions, calorie goals, and favorited foods are all saved to your account. Favorites also get a boost in the recommendation engine so the more you use Bento, the better it fits your taste.',
  },
  {
    q: 'Which universities does Bento support?',
    a: 'Bento currently supports Brandeis University dining halls. Additional locations will be added in future updates.',
  },
  {
    q: 'Can I use Bento if I have food allergies?',
    a: 'Yes, you can specify allergies and dietary preferences during setup and Bento will filter recommendations accordingly. However, Bento\'s allergy filters are based on dining hall data that may be incomplete or out of date. Do not rely solely on Bento for allergy safety. Always verify ingredients and allergens directly with dining staff before eating.',
  },
  {
    q: 'Is Bento affiliated with Brandeis University?',
    a: 'No. Bento is an independent application and is not affiliated with, endorsed by, or sponsored by Brandeis University or its dining services. Brandeis dining data is used solely to identify what is being served.',
  },
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item${open ? ' open' : ''}`}>
      <button className="faq-question" onClick={() => setOpen((v) => !v)}>
        <span>{q}</span>
        <span className="faq-chevron">{open ? '−' : '+'}</span>
      </button>
      {open && <p className="faq-answer">{a}</p>}
    </div>
  );
}

export default function LandingFAQ() {
  return (
    <div className="landing-faq">
      <div className="faq-inner">
        <h1 className="faq-heading">Frequently Asked Questions</h1>
        <div className="faq-list">
          {FAQS.map((item) => (
            <FAQItem key={item.q} {...item} />
          ))}
        </div>
      </div>
    </div>
  );
}
