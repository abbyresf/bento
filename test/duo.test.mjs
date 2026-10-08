import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCode, isValidCode, formatCode, joinUrl, parseJoinLink, inviteMessage,
  nameProblem, minutesLeft, pingIsLive, presenceLine, hereNow, mealForHour,
  pushText, errorText, redeemText, isMissingFeature, pingUntil, durationLabel,
  DEFAULT_MINUTES, DURATIONS, LEGACY_PING_MINUTES,
} from '../src/data/duo.js';

const NOW = Date.parse('2026-10-08T16:00:00-04:00');
const ago = (min) => new Date(NOW - min * 60000).toISOString();

test('codes are normalized and validated', () => {
  assert.equal(normalizeCode(' abcd-2345 '), 'ABCD2345');
  assert.ok(isValidCode('abcd 2345'));
  assert.ok(!isValidCode('ABCD234'));       // too short
  assert.ok(!isValidCode('ABCD234I'));      // I is not in the alphabet
  assert.ok(!isValidCode('ABCD234O'));
  assert.ok(!isValidCode(null));
  assert.equal(formatCode('abcd2345'), 'ABCD 2345');
});

test('join links round-trip and reject anything else', () => {
  assert.equal(joinUrl('abcd 2345'), 'https://www.bentodining.com/join/ABCD2345');
  assert.equal(parseJoinLink('https://www.bentodining.com/join/ABCD2345'), 'ABCD2345');
  assert.equal(parseJoinLink('https://www.bentodining.com/join/abcd2345/'), 'ABCD2345');
  assert.equal(parseJoinLink('/join/ABCD2345'), 'ABCD2345');
  assert.equal(parseJoinLink('https://evil.example/join/ABCD2345'), null);
  assert.equal(parseJoinLink('https://www.bentodining.com/join/short'), null);
  assert.equal(parseJoinLink('https://www.bentodining.com/app'), null);
  assert.equal(parseJoinLink('com.bentodining.app://auth-callback#access_token=x'), null);
  assert.equal(parseJoinLink(undefined), null);
});

test('invite message carries the link and the name', () => {
  const m = inviteMessage('  Maya ', 'abcd2345');
  assert.match(m, /^Maya invited you/);
  assert.match(m, /https:\/\/www\.bentodining\.com\/join\/ABCD2345$/);
  assert.match(inviteMessage('', 'abcd2345'), /^Share meals with me/);
});

test('names', () => {
  assert.equal(nameProblem('Maya'), null);
  assert.ok(nameProblem('   '));
  assert.ok(nameProblem('x'.repeat(21)));
  assert.equal(nameProblem('x'.repeat(20)), null);
});

const inMin = (min) => new Date(NOW + min * 60000).toISOString();

test('the choices and the default', () => {
  assert.equal(DEFAULT_MINUTES, 60);
  assert.deepEqual(DURATIONS, [30, 60, 90]);
  assert.equal(durationLabel(60), '1 hour');
  assert.equal(durationLabel(30), '30 minutes');
  assert.equal(durationLabel(90), '90 minutes');
});

test('a tap is live until the time it carries, and not after', () => {
  assert.equal(minutesLeft(inMin(60), NOW), 60);
  assert.equal(minutesLeft(inMin(30), NOW), 30);
  assert.equal(minutesLeft(inMin(0.4), NOW), 1);
  assert.equal(minutesLeft(inMin(0), NOW), 0);
  assert.equal(minutesLeft(inMin(-10), NOW), 0);
  assert.equal(minutesLeft(null, NOW), 0);
  assert.equal(minutesLeft('garbage', NOW), 0);
  assert.ok(pingIsLive(inMin(5), NOW));
  assert.ok(!pingIsLive(inMin(-5), NOW));
});

test('the end time comes from here_until, and falls back to the old 90 minutes', () => {
  assert.equal(pingUntil({ here_until: inMin(30), here_at: ago(5) }), Date.parse(inMin(30)));
  assert.equal(pingUntil({ here_at: ago(10) }), Date.parse(ago(10)) + LEGACY_PING_MINUTES * 60000);
  assert.equal(pingUntil({}), null);
  assert.equal(pingUntil(null), null);
});

test('presence line shows hall, meal and the time they tapped', () => {
  const f = { here_hall: 'Usdan', here_meal: 'lunch', here_at: ago(5), here_until: inMin(55) };
  assert.match(presenceLine(f, NOW), /^Usdan, lunch, \d{1,2}:\d\d$/);
  assert.equal(presenceLine({ here_hall: null }, NOW), null);
  assert.equal(presenceLine({ ...f, here_until: inMin(-1) }, NOW), null);        // ended
  assert.equal(presenceLine({ here_hall: 'Usdan', here_meal: 'lunch', here_at: ago(120) }, NOW), null); // old server, 90 min passed
  assert.ok(presenceLine({ here_hall: 'Usdan', here_meal: 'lunch', here_at: ago(30) }, NOW));            // old server, still live
  assert.equal(presenceLine(null, NOW), null);
});

test('hereNow keeps live friends only, newest first', () => {
  const friends = [
    { display_name: 'A', here_hall: 'Usdan', here_meal: 'lunch', here_at: ago(40), here_until: inMin(20) },
    { display_name: 'B', here_hall: null },
    { display_name: 'C', here_hall: 'Sherman', here_meal: 'lunch', here_at: ago(5), here_until: inMin(55) },
    { display_name: 'D', here_hall: 'Usdan', here_meal: 'lunch', here_at: ago(200), here_until: inMin(-100) },
    { display_name: 'E', here_hall: 'Usdan', here_meal: 'lunch', here_at: ago(65), here_until: inMin(-5) },
  ];
  assert.deepEqual(hereNow(friends, NOW).map((f) => f.display_name), ['C', 'A']);
});

test('default meal by hour matches the rest of the app', () => {
  assert.equal(mealForHour(8), 'breakfast');
  assert.equal(mealForHour(9), 'breakfast');
  assert.equal(mealForHour(10), 'lunch');
  assert.equal(mealForHour(13), 'lunch');
  assert.equal(mealForHour(14), 'dinner');
  assert.equal(mealForHour(22), 'dinner');
});

test('push text uses fixed wording', () => {
  assert.equal(pushText('Maya', 'Usdan'), 'Maya is at Usdan');
  assert.equal(pushText('  ', 'Usdan'), 'A buddy is at Usdan');
  assert.equal(pushText('Maya', ''), 'Maya is at the dining hall');
});

test('database errors become plain sentences', () => {
  assert.match(errorText(new Error('too_many_invites')), /5 open invites/);
  assert.match(errorText({ message: 'ping_limit' }), /6/);
  assert.match(errorText('invalid_code'), /did not work/);
  assert.match(errorText(new Error('boom')), /Something went wrong/);
  assert.match(redeemText('too_many_attempts'), /Too many tries/);
  assert.match(redeemText('friend_limit'), /20 buddies/);
});

test('a missing migration is recognised', () => {
  assert.ok(isMissingFeature({ code: 'PGRST202' }));
  assert.ok(isMissingFeature({ code: '42883' }));
  assert.ok(isMissingFeature({ message: 'Could not find the function public.duo_friends' }));
  assert.ok(!isMissingFeature({ code: '23505', message: 'duplicate' }));
  assert.ok(!isMissingFeature(null));
});

test('the server route words the push the same way the app does', async () => {
  const { pushText: server } = await import('../api/duo-notify.js');
  for (const [n, h] of [['Maya', 'Usdan'], ['  ', 'Usdan'], ['Maya', ''], ['  Ana   Li ', ' Sherman ']]) {
    assert.equal(server(n, h), pushText(n, h));
  }
});

test('the widget route returns only what the widget draws, with ISO times', async () => {
  const { buddyJson } = await import('../api/duo-widget.js');
  const out = buddyJson([{
    display_name: 'Maya', hall: 'Usdan', meal: 'lunch',
    here_at: '2026-10-08T16:12:34.567+00:00', here_until: '2026-10-08T17:12:34.567+00:00',
    mascot_outfit: 'scarf', mascot_color: 'cherry', email: 'secret@example.com', user_id: 'x',
  }, { display_name: 'Sam', hall: 'Sherman', meal: 'dinner', here_at: '2026-10-08T22:00:00Z', here_until: '2026-10-08T23:00:00Z' }]);
  assert.deepEqual(out[0], { name: 'Maya', hall: 'Usdan', meal: 'lunch', at: '2026-10-08T16:12:34.567Z', until: '2026-10-08T17:12:34.567Z', outfit: 'scarf', color: 'cherry' });
  assert.equal(out[1].outfit, null);
  assert.equal(out[1].color, null);
  assert.deepEqual(Object.keys(out[0]).sort(), ['at', 'color', 'hall', 'meal', 'name', 'outfit', 'until']);
  assert.deepEqual(buddyJson(null), []);
});
