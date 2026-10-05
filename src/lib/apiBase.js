import { Capacitor } from '@capacitor/core';

/* Where /api/* lives.
 *
 * On the web the functions are same-origin, so the base is empty and URLs stay
 * relative. In the native shell the page origin is https://localhost, which
 * has no /api, so every call 404ed and no menu ever loaded.
 *
 * www, not the apex: bentodining.com answers with a 308 to www.bentodining.com,
 * and a redirect on a cross-origin fetch fails CORS preflight. The functions
 * allow the shell's origin through the headers block in vercel.json.
 */
export const API_BASE = Capacitor.isNativePlatform() ? 'https://www.bentodining.com' : '';
