const PRIVACY_SECTIONS = [
  {
    id: 'overview',
    heading: 'Overview',
    body: 'Bento ("we," "us," or "our") is an independent meal planning application for university students. This Privacy Policy explains what personal information we collect, how we use it, who we share it with, and what rights you have over your data. By creating an account or using Bento, you agree to the practices described here.',
  },
  {
    id: 'what-we-collect',
    heading: 'Information We Collect',
    body: 'You give us your email address and password when you register. If you sign in with Google or Apple, we receive your email and an account ID from them instead, and Apple can hide your email behind a relay address. You also give us your age, sex, height, weight, activity level and goal, which we use to work out calorie and macro targets. You give us your dietary restrictions, food allergies and the ingredients you avoid. As you use Bento, we store the meals you confirm, the dishes you rate, your favorites, your streak, the quests you claim and the piece Bento wears. We store your answers to surveys, the suggestions you post and the feedback you send. If you turn on reminders, we store a notification token for your device. We also receive technical data when you use Bento, including your IP address and device type, which our infrastructure providers handle. We do not collect your name, phone number, contacts, photos, location or payment information.',
  },
  {
    id: 'health-data',
    heading: 'Dietary and Health-Related Data',
    body: 'Your restrictions, allergies, body measurements and nutrition goals are sensitive. We use them only to build your plate and your reminders. We do not sell them and we do not share them with advertisers. We never disclose them to your university, dining staff or anyone else in a form that identifies you.',
  },
  {
    id: 'how-we-use',
    heading: 'How We Use Your Information',
    body: 'We use your information to run Bento. That means building your plate from your goals, restrictions and the dining hall menu, keeping your streak and quests, and sending the reminders you turn on. We combine information from many students into counts, such as how many students have a gluten restriction, and share those counts with university dining teams and research partners who work with BentoPulse. Those reports never contain individual records, names or emails. We may use your email to send service messages such as account verification or policy updates. We do not send marketing email without your consent.',
  },
  {
    id: 'sharing',
    heading: 'Information Sharing',
    body: 'We do not sell your personal information. We share it only with the services that run Bento. Supabase stores your data and handles sign in. Vercel hosts the website and the servers that send reminders. Apple delivers notifications to iPhones and handles Sign in with Apple, and Google handles Sign in with Google. If you use the contact form on our website, EmailJS delivers your message to us. These providers handle data for us under their own privacy terms. University dining teams and research partners receive aggregated reports only, never individual records. We may disclose information if the law requires it or to protect people\'s safety. Nothing else is shared. We do not track you across other companies\' apps or websites.',
  },
  {
    id: 'university',
    heading: 'University and Dining Hall Data',
    body: 'Bento is not affiliated with, endorsed by, or sponsored by any university or its dining services. Dining hall menu data used within the app is sourced from publicly available information. We are not responsible for the accuracy or completeness of that data. If you believe dining data is incorrect, please verify directly with your dining hall.',
  },
  {
    id: 'retention',
    heading: 'Data Retention',
    body: 'We keep your account data while your account is active. You can delete your account in Settings and it takes effect at once. Deleting removes your profile, restrictions, meal history, ratings, favorites, streak, quests, survey answers and notification settings. Some things stay. Suggestions are anonymous and not tied to your account, so we cannot find and remove yours. Feedback messages and requests to add a university stay with the link to your account removed. Email bentodining@gmail.com and we will delete one of these within 30 days. Counts that combine many students cannot be traced to you and may remain.',
  },
  {
    id: 'your-rights',
    heading: 'Your Rights',
    body: 'You have the right to access the personal information we hold about you, request corrections to inaccurate data, delete your account and personal data, and withdraw consent to any processing based on consent. Account deletion is available directly in Settings. To exercise any other right, contact us at bentodining@gmail.com. If you are located in the European Economic Area, you also have the right to lodge a complaint with your local data protection authority.',
  },
  {
    id: 'security',
    heading: 'Security',
    body: 'We take reasonable technical and organizational measures to protect your data. All data is encrypted in transit via TLS and at rest via Supabase\'s infrastructure. Passwords are hashed and never stored in plain text. No method of transmission or storage is 100% secure, and we cannot guarantee absolute security. We encourage you to use a strong, unique password for your account.',
  },
  {
    id: 'cookies',
    heading: 'Cookies and Local Storage',
    body: 'Bento uses browser storage and sign-in tokens to keep you signed in and save your preferences. In the iOS app the same information is kept in the app\'s own storage, and the home-screen widget keeps a copy of today\'s plate on your device. We do not use third-party tracking cookies or advertising cookies. Clearing your browser storage or deleting the app signs you out.',
  },
  {
    id: 'notifications',
    heading: 'Notifications',
    body: 'If you turn on reminders, we store a token for your device or browser so we can send them. Apple or your browser\'s push service delivers each notification. We use it only for the reminders you chose, such as meal and streak reminders. You can turn them off in Settings or in your phone\'s settings, and signing out stops reminders on that device.',
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
