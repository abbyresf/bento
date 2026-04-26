import { useState } from 'react';
import './LandingFAQ.css';

const FAQS = [
  {
    q: 'Is Bento free to use?',
    a: 'Yes — Bento is completely free for all Brandeis University students. No account, no subscription, no credit card.',
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
    a: 'Yes. During setup you can specify allergies and dietary preferences (gluten-free, vegan, nut-free, etc.) and Bento will filter recommendations accordingly. Always double-check with dining staff for your safety as menu data may occasionally be incomplete.',
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
