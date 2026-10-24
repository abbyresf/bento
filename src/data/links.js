/* External destinations the marketing site points at.
 *
 * Here rather than inline so the TestFlight link is in one place. It changes
 * whenever external testing is recreated, and a link left stale in three
 * components sends students to a dead page with nothing to tell you.
 */

/* Public TestFlight link for external testing.
 *
 * iOS and iPadOS only. Every place this is used also offers the web app
 * alongside it, because a student on Android or a laptop cannot install from
 * TestFlight and must not be left without a way in.
 *
 * Find or recreate it in App Store Connect: the app, TestFlight, External
 * Testing, the group, Public Link. A new build does not change it, but
 * deleting the group does.
 */
export const TESTFLIGHT_URL = 'https://testflight.apple.com/join/mQrBSm7D';
