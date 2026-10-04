import type { CapacitorConfig } from '@capacitor/cli';

/* Native shell configuration.
 *
 * Why .ts, in a project that is otherwise plain JavaScript. Capacitor's loader
 * supports three names: .ts, .js and .json. A .js config is read with
 * `require()`, and this package is `"type": "module"`, so on Node 22 that
 * returns the ES namespace object `{ __esModule, default }` rather than the
 * config. Capacitor reads `appId` off the top level, finds nothing, and fails
 * with "Missing appId" while the value is sitting right there under `.default`.
 * Verified against node_modules/@capacitor/cli/dist/config.js and by calling
 * require() directly.
 *
 * That left .json, which cannot hold a single comment below this line, on the
 * file that fixes a permanent bundle identifier. TypeScript is a dev-only
 * dependency and Capacitor's own documented default, which is the cheaper
 * trade.
 */
const config: CapacitorConfig = {
  // PERMANENT. Once an App ID exists in App Store Connect and a build has been
  // uploaded against it, this cannot change. Registered 4 Oct 2026 with Push
  // Notifications and Sign in with Apple enabled.
  appId: 'com.bentodining.app',

  // The home-screen label, not the App Store listing. The store name is
  // "Bento Dining", set in App Store Connect, and the two are separate fields
  // on purpose: only the store name has to be unique, and iOS truncates a
  // home-screen label at around twelve characters. Do not "correct" this to
  // the store name.
  appName: 'Bento',

  // Vite's output. `npx cap sync` copies this build into the native project,
  // so the app always ships whatever `npm run build` produced. There is no
  // second copy of any screen to maintain.
  webDir: 'dist',

  ios: {
    // The web layer draws its own background, and a white flash between the
    // launch screen and first paint reads as a broken web page rather than an
    // app. Cream matches --bg-app.
    backgroundColor: '#faf7f4',
    // Bounce scrolling at the top of a view is the single clearest "this is a
    // web page" tell inside a webview, and guideline 4.2 is judged on exactly
    // that impression.
    scrollEnabled: true,
    contentInset: 'always',
  },

  server: {
    // Served from the app bundle over a local scheme. No remote URL: pointing
    // the shell at bentodining.com would make this a web viewer, which Apple
    // rejects under 4.2, and would break offline use.
    iosScheme: 'capacitor',
  },
};

export default config;
