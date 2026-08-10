const PRIVACY_SECTIONS = [
  {
    id: 'overview',
    heading: 'Overview',
    body: 'Bento ("we," "us," or "our") is an independent meal planning application for university students. This Privacy Policy explains what personal information we collect, how we use it, who we share it with, and what rights you have over your data. By creating an account or using Bento, you agree to the practices described here.',
  },
  {
    id: 'what-we-collect',
    heading: 'Information We Collect',
    body: 'We collect information you provide directly: your email address and password when you register; dietary restrictions, food allergies, calorie goals, and macro targets you enter during onboarding; and food selections, meal confirmations, and favorites you log while using the app. We also collect limited technical data automatically, including your IP address, browser type, and device information, which is handled by our infrastructure provider Supabase. We do not collect your name, phone number, or payment information.',
  },
  {
    id: 'health-data',
    heading: 'Dietary and Health-Related Data',
    body: 'Dietary restrictions, food allergies, and nutrition goals are considered sensitive data. We treat this information with heightened care. It is used solely to power your personalized meal recommendations and is never sold, rented, or shared with advertisers. It is never disclosed to your university, dining staff, or any third party in a form that identifies you individually.',
  },
  {
    id: 'how-we-use',
    heading: 'How We Use Your Information',
    body: 'We use your information to provide and personalize the Bento service, including generating meal recommendations based on your goals, restrictions, and dining hall menu. We use aggregated and anonymized data — with all individual identifiers removed — to surface trends to university dining administrators (for example, "30% of students have a gluten restriction"), which helps dining services better serve the student population. We may use your email address to send service-related messages such as account verification or policy updates. We do not send marketing emails without your explicit consent.',
  },
  {
    id: 'sharing',
    heading: 'Information Sharing',
    body: 'We do not sell your personal information. We share data in the following limited circumstances: (1) Supabase, our database and authentication provider, stores and processes your data on our behalf under their own privacy and security standards; (2) dining administrators at your university may receive anonymized, aggregated reports — never individual user data; (3) we may disclose information if required by law or to protect the rights and safety of users. No other third-party sharing occurs.',
  },
  {
    id: 'university',
    heading: 'University and Dining Hall Data',
    body: 'Bento is not affiliated with, endorsed by, or sponsored by any university or its dining services. Dining hall menu data used within the app is sourced from publicly available information. We are not responsible for the accuracy or completeness of that data. If you believe dining data is incorrect, please verify directly with your dining hall.',
  },
  {
    id: 'retention',
    heading: 'Data Retention',
    body: 'We retain your account data for as long as your account is active. If you wish to delete your account and all associated data, contact us at bentodining@gmail.com and we will process your request within 30 days. Some anonymized, aggregated records may be retained after deletion as they cannot be linked back to any individual.',
  },
  {
    id: 'your-rights',
    heading: 'Your Rights',
    body: 'You have the right to access the personal information we hold about you, request corrections to inaccurate data, request deletion of your account and personal data, and withdraw consent to any processing based on consent. To exercise any of these rights, contact us at bentodining@gmail.com. If you are located in the European Economic Area, you also have the right to lodge a complaint with your local data protection authority.',
  },
  {
    id: 'security',
    heading: 'Security',
    body: 'We take reasonable technical and organizational measures to protect your data. All data is encrypted in transit via TLS and at rest via Supabase\'s infrastructure. Passwords are hashed and never stored in plain text. No method of transmission or storage is 100% secure, and we cannot guarantee absolute security. We encourage you to use a strong, unique password for your account.',
  },
  {
    id: 'cookies',
    heading: 'Cookies and Local Storage',
    body: 'Bento uses browser local storage and session tokens to keep you logged in and save app preferences. We do not use third-party tracking cookies or advertising cookies. You can clear local storage at any time through your browser settings, though doing so will sign you out of the app.',
  },
  {
    id: 'children',
    heading: "Children's Privacy",
    body: 'Bento is not directed to children under the age of 13 and we do not knowingly collect personal information from anyone under 13. If you believe a child under 13 has provided us with personal information, please contact us at bentodining@gmail.com and we will delete it promptly.',
  },
  {
    id: 'changes',
    heading: 'Changes to This Policy',
    body: 'We may update this Privacy Policy from time to time. When we do, we will update the "Last updated" date at the top of this page. For material changes, we will notify you via the app or by email. Continued use of Bento after changes are posted constitutes your acceptance of the revised policy.',
  },
  {
    id: 'contact',
    heading: 'Contact Us',
    body: 'If you have questions, concerns, or requests regarding this Privacy Policy or your personal data, please contact us at bentodining@gmail.com. We will respond within 30 days.',
  },
];

export default PRIVACY_SECTIONS;
