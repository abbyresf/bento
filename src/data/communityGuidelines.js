/* Campus community guidelines. One source for the full guidelines (PolicyModal) and the short rules shown the first
 * time someone opens the Feed. Keep the two in step, and keep both true to how the feed works. The hide thresholds
 * stay unpublished on purpose (owner's call, 2026-11-12), so neither text states them:
 * three reports hide a post or reply (072, 074), six downvotes with more down than up hide a post (072), and Bento
 * moderators remove and restore from bentodining.com/moderator (078). */

export const RULES_SUMMARY = [
  'Talk about food and the dining halls.',
  'Critique the food, never the people. No attacks on students or staff.',
  'Never name or identify another person.',
  'No hate, threats, harassment or spam.',
  'Flag anything that breaks these rules.',
];

export const GUIDELINES = [
  {
    body: 'Campus is the anonymous feed for students at your school. Use Campus to share what is good, what is not, and what you want changed at the dining halls.',
  },
  {
    title: 'What belongs here',
    list: [
      'Honest takes on dishes and halls',
      'Tips on what is fresh today and what to skip',
      'Suggestions for dining services',
      'Replies and votes that keep threads useful',
    ],
  },
  {
    title: 'What gets removed',
    list: [
      'Personal attacks or harassment of students, dining staff or anyone else',
      'Hate speech, threats or sexual content',
      'Names, photos, handles or details that identify a person',
      'Spam, ads or selling',
      'Posts about anything illegal or dangerous',
    ],
  },
  {
    title: 'Who reads Campus',
    body: 'Students at your school and your school\'s dining staff. Bento moderators review the feed.',
  },
  {
    title: 'Anonymity',
    body: 'Posts and replies carry no name. Bento does not store who wrote a post or reply, and moderators do not see authors. Your votes, reposts and reports are saved to your account so the app remembers them. Nobody else sees them.',
  },
  {
    title: 'Reports and removal',
    body: 'Tap the flag on a post or reply that breaks these rules. The post leaves your feed at once. Bento moderators review reports, remove what breaks the rules and restore what was hidden by mistake.',
  },
  {
    title: 'Questions',
    body: 'Disagree with a removal? Email bentodining@gmail.com.',
  },
];
