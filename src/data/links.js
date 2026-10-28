/* External destinations the marketing site points at.
 *
 * Here rather than inline so each link is in one place and a stale one is
 * fixed once.
 */

/* The App Store page for Bento Dining. The id is the app's Apple ID, so the link
 * works from the moment the app is live and never changes with a new version.
 *
 * iOS only. Every place this is used also offers the web app alongside it, so
 * a student on Android or a laptop is never left without a way in.
 */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6819101083';

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
