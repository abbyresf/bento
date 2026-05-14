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
        Menu and nutrition data is sourced from your university's dining systems and may
        not always be current, complete, or accurate. Recipes, ingredients, and portion
        sizes can change without notice.{' '}
        <strong>
          If you have a food allergy, intolerance, or any other medically significant
          dietary restriction, do not rely solely on Bento.
        </strong>{' '}
        Always verify ingredient and allergen information directly with dining staff before
        consuming any item. Bento makes no guarantee that its allergy or dietary filters
        are complete or error-free.
      </>
    ),
  },
  {
    id: 'non-affiliation',
    heading: 'No University Affiliation',
    body: (
      <>
        Bento is an independent application and is{' '}
        <strong>not affiliated with, endorsed by, or sponsored by</strong> any university
        or institution. University names and dining data used within Bento are solely for
        the purpose of identifying the dining locations being described.
      </>
    ),
  },
  {
    id: 'your-data',
    heading: 'Your Data & Privacy',
    body: (
      <>
        To generate your meal plan, Bento collects and stores the following on secure
        third-party servers (Supabase): your height, weight, age, sex, activity level,
        dietary restrictions, food allergies, meal history, and favorited items. This data
        is associated with your account and is used solely to personalize your meal
        suggestions. It is not sold or shared with third parties.{' '}
        <strong>You can permanently delete your account and all associated data</strong>{' '}
        at any time from the Settings screen. Bento uses industry-standard security
        practices, but no system is completely immune to breach — use the app accordingly.
      </>
    ),
  },
  {
    id: 'liability',
    heading: 'Limitation of Liability',
    body: (
      <>
        By using Bento, you acknowledge and agree that the creator(s) of this application
        are <strong>not liable</strong> for any health outcomes, adverse effects, allergic
        reactions, dietary decisions, data loss, or damages of any kind arising from your
        use of or reliance on this app or its content. Nutritional information displayed
        may be inaccurate. You use Bento voluntarily, at your own discretion and risk.
      </>
    ),
  },
];

export default TERMS_SECTIONS;
