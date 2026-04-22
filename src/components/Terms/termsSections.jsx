// Single source of truth for all terms & conditions text.
// Used by both TermsGate (initial acceptance) and TermsPage (reference tab).

const TERMS_SECTIONS = [
  {
    id: 'not-medical-advice',
    heading: 'Not Medical Advice',
    body: (
      <>
        Bento is a general-purpose meal planning tool and is{' '}
        <strong>not a medical application</strong>. Nothing in this app constitutes medical
        advice, diagnosis, or treatment of any kind. Calorie and macronutrient targets are
        calculated using standard Total Daily Energy Expenditure (TDEE) formulas —
        mathematical estimates based on the information you provide. These are general
        guidelines only and may not reflect your individual health needs, medical history,
        or body composition.
      </>
    ),
  },
  {
    id: 'consult-professional',
    heading: 'Consult a Professional',
    body: (
      <>
        If you have a medical condition, a history of or concern about disordered eating,
        specific dietary requirements, or any other health consideration, please consult a
        qualified healthcare provider or registered dietitian{' '}
        <strong>before</strong> making changes to your diet based on this app. Bento is
        not a substitute for professional medical or nutritional guidance.
      </>
    ),
  },
  {
    id: 'menu-accuracy',
    heading: 'Menu & Nutrition Accuracy',
    body: (
      <>
        Menu and nutrition data is sourced from Brandeis University dining systems and may
        not always be current, complete, or accurate. Recipes, ingredients, and portion
        sizes can change without notice. If you have a food allergy, intolerance, or other
        medically significant dietary restriction, always verify directly with dining
        services before consuming any item.
      </>
    ),
  },
  {
    id: 'liability',
    heading: 'Limitation of Liability',
    body: (
      <>
        By using Bento, you acknowledge and agree that the creator(s) of this application
        are <strong>not liable</strong> for any health outcomes, adverse effects, dietary
        decisions, or damages of any kind arising from your use of or reliance on this app
        or its content. You use Bento voluntarily, at your own discretion and risk.
      </>
    ),
  },
  {
    id: 'your-data',
    heading: 'Your Data',
    body: (
      <>
        All data you enter (height, weight, goals, dietary preferences) is stored
        exclusively on your device using your browser&apos;s local storage. Nothing is
        transmitted to any server or shared with third parties.
      </>
    ),
  },
];

export default TERMS_SECTIONS;
