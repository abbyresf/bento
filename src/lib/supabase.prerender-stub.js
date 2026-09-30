/* Stands in for src/lib/supabase.js during the build-time prerender only.
 *
 * The real module runs a browser: with no VITE_SUPABASE_* set it calls
 * document.createElement to show an error banner, and there is no document in
 * Node. Vercel builds without a .env.local, so the prerender crashed there
 * while succeeding locally, which is the kind of gap only a real deploy finds.
 *
 * Nothing on the landing page touches Supabase while rendering. The one call,
 * submitWaitlistEntry, runs from the waitlist form's submit handler in a
 * browser, long after this stub is gone. So the prerender does not need a
 * client, it only needs the import to resolve.
 *
 * Throwing on any access keeps that honest. If prerendered code ever does reach
 * for the database, the build fails loudly here instead of quietly baking a
 * half-rendered page into the homepage.
 */
export const supabase = new Proxy({}, {
  get(_target, prop) {
    throw new Error(
      `Supabase was accessed during the homepage prerender (property "${String(prop)}"). ` +
      'Prerendered code must not read the database. Move that work into an event ' +
      'handler or an effect, which only run in the browser.'
    );
  },
});
