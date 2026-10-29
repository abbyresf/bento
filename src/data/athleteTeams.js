/* The varsity teams at each school, for Athlete mode.
 *
 * Teams and season dates are read from each school's athletics site. A season runs from the first listed contest to the last,
 * so it covers conference play and any postseason game already on the schedule. Bento shows only "in season" or not, because
 * the schedules give contest dates and nothing about when pre-season or post-season starts.
 *
 * Refresh every academic year, and when a spring schedule is posted. Brandeis: brandeisjudges.com/sports/<team>/schedule,
 * read 29 Oct 2026 from each page's structured game data. Tennis lists only its fall dates so far.
 *
 * `sport` picks the published guidance in utils/athleteTargets.js (SPORT_GUIDANCE). */

export const TEAMS = {
  brandeis: [
    { id: 'womens-basketball',          name: "Women's Basketball",         sex: 'female', sport: 'basketball', seasons: [['2026-11-06', '2027-02-27']] },
    { id: 'womens-cross-country',       name: "Women's Cross Country",      sex: 'female', sport: 'cross-country', seasons: [['2026-09-05', '2026-11-21']] },
    { id: 'womens-fencing',             name: "Women's Fencing",            sex: 'female', sport: 'fencing',    seasons: [['2026-11-07', '2027-03-25']] },
    { id: 'womens-soccer',              name: "Women's Soccer",             sex: 'female', sport: 'soccer',     seasons: [['2026-09-01', '2026-11-07']] },
    { id: 'softball',                   name: 'Softball',                   sex: 'female', sport: 'softball',   seasons: [['2027-03-13', '2027-05-15']] },
    { id: 'womens-swimming-and-diving', name: "Women's Swimming and Diving", sex: 'female', sport: 'swimming',  seasons: [['2026-10-24', '2027-02-10']] },
    { id: 'womens-tennis',              name: "Women's Tennis",             sex: 'female', sport: 'tennis',     seasons: [['2026-09-11', '2026-10-09']] },
    { id: 'womens-track-and-field',     name: "Women's Track and Field",    sex: 'female', sport: 'track',      seasons: [['2026-12-04', '2027-05-20']] },
    { id: 'womens-volleyball',          name: "Women's Volleyball",         sex: 'female', sport: 'volleyball', seasons: [['2026-09-01', '2026-11-15']] },
    { id: 'baseball',                   name: 'Baseball',                   sex: 'male',   sport: 'baseball',   seasons: [['2027-02-27', '2027-04-29']] },
    { id: 'mens-basketball',            name: "Men's Basketball",           sex: 'male',   sport: 'basketball', seasons: [['2026-11-07', '2027-02-27']] },
    { id: 'mens-cross-country',         name: "Men's Cross Country",        sex: 'male',   sport: 'cross-country', seasons: [['2026-09-05', '2026-11-21']] },
    { id: 'mens-fencing',               name: "Men's Fencing",              sex: 'male',   sport: 'fencing',    seasons: [['2026-11-07', '2027-03-25']] },
    { id: 'mens-soccer',                name: "Men's Soccer",               sex: 'male',   sport: 'soccer',     seasons: [['2026-09-01', '2026-11-07']] },
    { id: 'mens-swimming-and-diving',   name: "Men's Swimming and Diving",  sex: 'male',   sport: 'swimming',   seasons: [['2026-10-24', '2027-02-10']] },
    { id: 'mens-tennis',                name: "Men's Tennis",               sex: 'male',   sport: 'tennis',     seasons: [['2026-09-11', '2026-10-10']] },
    { id: 'mens-track-and-field',       name: "Men's Track and Field",      sex: 'male',   sport: 'track',      seasons: [['2026-12-04', '2027-05-20']] },
  ],
};

/* The teams a student is shown. Someone who gave male in onboarding sees men's teams, female sees women's, and anyone else
 * sees both. An empty list means Bento does not have this school's teams yet. */
export function teamsFor(university, sex) {
  const all = TEAMS[university] ?? [];
  if (sex === 'male' || sex === 'female') return all.filter((t) => t.sex === sex);
  return all;
}

export const teamById = (university, id) => (TEAMS[university] ?? []).find((t) => t.id === id) ?? null;

/* Where a team is in its season on `date` (YYYY-MM-DD):
 *   { state: 'in', until }   between the first and last listed contest
 *   { state: 'before', starts }   a listed season is still to come
 *   { state: 'after', ended }   every listed season is over
 *   { state: 'unknown' }   no dates */
export function seasonStatus(team, date) {
  const seasons = [...(team?.seasons ?? [])].sort(([a], [b]) => a.localeCompare(b));
  if (!seasons.length) return { state: 'unknown' };
  const now = seasons.find(([s, e]) => date >= s && date <= e);
  if (now) return { state: 'in', until: now[1] };
  const next = seasons.find(([s]) => s > date);
  if (next) return { state: 'before', starts: next[0] };
  return { state: 'after', ended: seasons[seasons.length - 1][1] };
}
