export const UNIVERSITIES = [
  {
    id:           'brandeis',
    name:         'Brandeis University',
    abbreviation: 'BU',
    location:     'Waltham, MA',
    available:    true,
    aliases:      ['brandeis'],
    hasKosher:    true,
    labelHalal:   false,
    itemPrefix:   'bh_',
    // Whether the dining hall works with Bento and sees Pulse. Only then may the
    // app say the dining team reads what students confirm and rate (see
    // voiceMessage in src/utils/bentoSays.js). Off until it is true.
    diningPartner: false,
    diningTeamName: 'Brandeis Dining',
  },
  {
    id:           'tufts',
    name:         'Tufts University',
    abbreviation: 'Tufts',
    location:     'Medford, MA',
    available:    true,
    aliases:      ['tufts', 'jumbos'],
    hasKosher:    false,
    labelHalal:   false,
    itemPrefix:   'tu_',
    diningPartner: false,
    diningTeamName: 'Tufts Dining',
  },
  {
    id: 'mit',
    name: 'Massachusetts Institute of Technology',
    abbreviation: 'MIT',
    location: 'Cambridge, MA',
    available: false,
    aliases: ['mit', 'massachusetts', 'mass'],
  },
  {
    id: 'wentworth',
    name: 'Wentworth Institute of Technology',
    abbreviation: 'WIT',
    location: 'Boston, MA',
    available: false,
    aliases: ['wit', 'wentworth'],
  },
  {
    id: 'sjsu',
    name: 'San Jose State University',
    abbreviation: 'SJSU',
    location: 'San Jose, CA',
    available: false,
    aliases: ['sjsu', 'san jose', 'san jose state'],
  },
  {
    id: 'uc-berkeley',
    name: 'UC Berkeley',
    abbreviation: 'UCB',
    location: 'Berkeley, CA',
    available: false,
    aliases: ['ucb', 'berkeley', 'cal', 'uc berkeley'],
  },
];

// A made-up campus for design work and App Store screenshots, so no real school is on show. It exists only in a
// build made with VITE_UI_MOCK=true. Marker: BENTO_UI_MOCK_ACTIVE
if (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_UI_MOCK) {
  UNIVERSITIES.push({
    id: 'demo', name: 'Maple State University', abbreviation: 'Maple', location: 'Anytown, USA', available: true,
    aliases: ['maple'], hasKosher: false, labelHalal: false, itemPrefix: 'demo_',
    diningPartner: true, diningTeamName: 'Maple Dining',
  });
}
