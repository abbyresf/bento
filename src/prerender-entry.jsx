/* SSR entry used only at build time by scripts/prerender.mjs.
 *
 * The homepage shipped `<div id="root"></div>` and nothing else, so anything
 * that does not execute JavaScript saw an empty page: link previews in
 * iMessage and Slack, and any LLM or crawler reading the site. Even a
 * JS-capable crawler saw blank, because App returns null until
 * supabase.auth.getSession() resolves over the network.
 *
 * This renders the landing page to real HTML at build time. It is never
 * bundled into the client build and never runs in a browser.
 *
 * No router wrapper: nothing under LandingPage calls a router hook, so there is
 * no history to stand in for. LandingPage's own tab state starts on 'home', so
 * only the homepage renders.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import LandingPage from './components/Landing/LandingPage.jsx';

export function render() {
  // A prerendered page has no click handlers. Every control here is re-bound by
  // React the moment the bundle boots.
  return renderToStaticMarkup(
    <LandingPage onGetStarted={() => {}} initialTab="home" />
  );
}
