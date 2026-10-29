import './lib/startupGuard.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import './motion.css'
import './native.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import HalloweenGift from './components/Mascot/HalloweenGift.jsx'
import { initNativeAuthLinks } from './lib/nativeAuth'
import { initKeyboardInset } from './lib/keyboard'

// Screenshot driver, design builds only. Removed from every release bundle.
if (import.meta.env.VITE_UI_MOCK) {
  try {
    localStorage.setItem('bento_splash_ts', String(Date.now()));
    localStorage.setItem('bento_install_prompted', '1');
    localStorage.setItem('bento_tutorial_done', '1');
  } catch { /* design build only */ }
  window.__shotQuery = location.search;   // the router may rewrite the URL before the driver reads it
  import('./lib/mockDriver.js');
}

/* HashRouter in the native shell, BrowserRouter on the web.
 *
 * The web keeps real paths. Switching it to hashes would turn every URL into
 * bentodining.com/#/..., breaking existing links, the /admin/join/:token invite
 * links, and the sitemap, canonical and structured data already indexed.
 *
 * The app cannot use them. Pages are served from a local scheme rather than
 * over http, and the history API that <Navigate> relies on does not work
 * against that origin, so the first redirect left a blank screen with nothing
 * rendered and nothing thrown. Hash routing needs no history entries.
 *
 * Decided by testing in the shell rather than pre-emptively, which is what
 * IOS_SPEC.md step 3 asked for.
 */
const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter

// Scopes src/native.css to the app, so the website is untouched.
if (Capacitor.isNativePlatform()) document.documentElement.classList.add('is-native')

// Listens for the Google sign-in redirect on native. Does nothing on the web.
initNativeAuthLinks()
initKeyboardInset()

// Above the router: App returns early for auth, landing and onboarding, so a
// provider mounted inside it would leave those screens untethered to the theme.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <Router>
          <App />
          <HalloweenGift />
          {/* The script loads from /_vercel/insights, which does not exist in
              the shell's local origin and 404s on every launch. */}
          {!Capacitor.isNativePlatform() && <Analytics />}
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
