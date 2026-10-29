import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS, teamsFor, teamById, seasonStatus } from '../src/data/athleteTeams.js';

test('a student sees the teams for the sex they gave, or both', () => {
  const men = teamsFor('brandeis', 'male');
  const women = teamsFor('brandeis', 'female');
  assert.ok(men.length && men.every((t) => t.sex === 'male'));
  assert.ok(women.length && women.every((t) => t.sex === 'female'));
  assert.equal(teamsFor('brandeis', null).length, men.length + women.length);
  assert.equal(teamsFor('brandeis', 'other').length, TEAMS.brandeis.length);
  assert.deepEqual(teamsFor('nowhere', 'male'), []);
});

test('every team has a unique id, a sport and well formed season dates', () => {
  for (const [school, teams] of Object.entries(TEAMS)) {
    assert.equal(new Set(teams.map((t) => t.id)).size, teams.length, school);
    for (const t of teams) {
      assert.ok(t.sport, t.id);
      for (const [s, e] of t.seasons) {
        assert.match(s, /^\d{4}-\d{2}-\d{2}$/);
        assert.match(e, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(s <= e, t.id);
      }
    }
  }
});

test('where a team is in its season', () => {
  const soccer = teamById('brandeis', 'womens-soccer');
  assert.deepEqual(seasonStatus(soccer, '2026-10-29'), { state: 'in', until: '2026-11-07' });
  assert.deepEqual(seasonStatus(soccer, '2026-09-01'), { state: 'in', until: '2026-11-07' });   // the first contest counts
  assert.deepEqual(seasonStatus(soccer, '2026-08-15'), { state: 'before', starts: '2026-09-01' });
  assert.deepEqual(seasonStatus(soccer, '2026-12-01'), { state: 'after', ended: '2026-11-07' });
  assert.deepEqual(seasonStatus({ seasons: [] }, '2026-10-29'), { state: 'unknown' });
  assert.deepEqual(seasonStatus(null, '2026-10-29'), { state: 'unknown' });
});

test('an unknown team id finds nothing', () => {
  assert.equal(teamById('brandeis', 'quidditch'), null);
});
