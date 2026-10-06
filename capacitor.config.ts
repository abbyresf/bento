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
    // Bounce scrolling is controlled in CSS (src/native.css), because iOS draws
    // the bounce as background past the content and it reads as a web page.
    scrollEnabled: true,
    // 'never' makes the web view edge to edge and leaves every inset to CSS
    // env(safe-area-inset-*). This was 'always', which made iOS inset the page
    // AND the CSS padded it again: the tab bar floated above the screen edge
    // with a strip of background under it, and about 270px of dead space sat
    // below the last card. Found on 6 Oct 2026 in the simulator.
    contentInset: 'never',
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
    // THIS HAS NO EFFECT, and an earlier version of this comment claimed it did.
    // WKWebView handles http and https itself, so Capacitor checks
    // WKWebView.handlesURLScheme and silently falls back to its default,
    // 'capacitor' (CAPInstanceDescriptor.swift). The page origin is therefore
    // capacitor://localhost, which was measured in the simulator on 6 Oct 2026
    // by printing location.origin. It was believed to be https://localhost, and a
    // CORS rule for that origin blocked every menu request.
    //
    // Anything the app calls cross-origin must allow capacitor://localhost, or
    // allow any origin as the public menu endpoints do. Supabase already does.
    // The line below is left so the config does not appear to change, but it
    // could be deleted.
    iosScheme: 'https',
  },
};

export default config;
