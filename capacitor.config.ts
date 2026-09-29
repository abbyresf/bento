import type { CapacitorConfig } from '@capacitor/cli';

/* Native shell configuration.
 *
 * `appId` is the bundle identifier and is PERMANENT once an App ID exists in
 * App Store Connect and a build has been uploaded. Change it here, before
 * `npx cap add ios`, if a different one is wanted.
 *
 * `webDir` points at Vite's output. `npx cap sync` copies that build into the
 * native project, so the native app always ships whatever `npm run build`
 * produced. There is no second copy of the app to maintain.
 */
const config: CapacitorConfig = {
  appId: 'com.bentodining.app',
  appName: 'Bento',
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
