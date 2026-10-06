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

  // The name on the phone and in the store: Bento Dining.
  //
  // This was 'Bento' on the theory that only the store name has to be unique
  // and the home-screen label could be shorter. Apple disagreed. Builds 4.1 and
  // 5.1 were both rejected at processing with error 90129, "The bundle uses a
  // bundle name or display name that is already taken", and 'Bento' is taken
  // several times over. The real values live in ios/App/App/Info.plist
  // (CFBundleDisplayName and CFBundleName), which cap sync does not rewrite.
  appName: 'Bento Dining',

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

  plugins: {
    PushNotifications: {
      // Show a reminder that arrives while the app is open. Without this iOS
      // delivers it silently to the web layer and nothing appears on screen.
      presentationOptions: ['alert', 'sound'],
    },
  },

  server: {
    // Still served from the app bundle. There is no `url` here, and there must
    // not be: pointing the shell at bentodining.com would make this a web
    // viewer, which Apple rejects under 4.2, and would break offline use.
    //
    // The scheme only names the local origin. Capacitor's default, 'capacitor',
    // gives pages an origin of capacitor://localhost, and APIs that check CORS
    // reject a non-http(s) Origin header. Supabase does, so every auth and data
    // call failed, getSession() rejected, and App.jsx sat on its
    // `session === undefined` branch rendering null: a blank screen with no
    // error, because nothing threw. 'https' makes the origin https://localhost,
    // which servers accept, and changes nothing about where the files come from.
    iosScheme: 'https',
  },
};

export default config;
