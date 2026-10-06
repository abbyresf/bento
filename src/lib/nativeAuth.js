import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { supabase } from './supabase';

/* Google sign-in inside the native shell.
 *
 * The web flow redirects the whole page to Google and back to /app. The shell
 * cannot do that. Its origin is https://localhost, so there is nothing for
 * Google to come back to, and Google refuses to run inside an embedded webview
 * at all. So the sign-in happens in the system browser sheet, and the way back
 * is a custom URL scheme that iOS hands to this app.
 *
 *   1. Ask Supabase for the Google URL without navigating (skipBrowserRedirect).
 *   2. Open it in the browser sheet.
 *   3. Google returns to Supabase, which redirects to NATIVE_REDIRECT with the
 *      tokens in the URL fragment. This is Supabase's implicit flow, the same
 *      one the web client already uses.
 *   4. iOS opens the app with that URL, we close the sheet, and setSession
 *      stores the session. onAuthStateChange does the rest, as it does on web.
 *
 * NATIVE_REDIRECT must be in Supabase, Authentication, URL Configuration,
 * Redirect URLs. Without it Supabase ignores the redirect and falls back to the
 * Site URL, and sign-in appears to finish on a web page.
 *
 * The scheme is registered in ios/App/App/Info.plist (CFBundleURLTypes).
 */
export const NATIVE_REDIRECT = 'com.bentodining.app://auth-callback';

// Set while a sign-in is waiting for iOS to hand the app its redirect.
let pending = null;

function paramsFrom(url) {
  // Tokens arrive in the fragment. Errors can arrive in the fragment or the
  // query, depending on where Supabase sent them.
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  return new URLSearchParams(hash || query);
}

async function handleUrl(url) {
  if (!url?.startsWith(NATIVE_REDIRECT)) return;
  await Browser.close().catch(() => {});

  const p = paramsFrom(url);
  const done = pending;
  pending = null;
  try {
    const error = p.get('error_description') || p.get('error');
    if (error) throw new Error(error);
    const access_token = p.get('access_token');
    const refresh_token = p.get('refresh_token');
    if (!access_token || !refresh_token) throw new Error('Sign-in did not return a session.');
    const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
    if (sessionError) throw sessionError;
    done?.resolve();
  } catch (err) {
    console.warn('[auth] callback failed: ' + err.message);
    done?.reject(err);
  }
}

/* Call once at startup. Registering here, not inside signIn, means a redirect
 * that arrives while the app is being relaunched is still handled. */
export function initNativeAuthLinks() {
  if (!Capacitor.isNativePlatform()) return;
  App.addListener('appUrlOpen', ({ url }) => { handleUrl(url); });
  // Closing the sheet without finishing is a cancel, not an error.
  Browser.addListener('browserFinished', () => {
    const done = pending;
    pending = null;
    done?.resolve();
  });
}

export async function signInWithGoogleNative() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const finished = new Promise((resolve, reject) => { pending = { resolve, reject }; });
  await Browser.open({ url: data.url });
  return finished;
}

/* Sign in with Apple, native only.
 *
 * App Store guideline 4.8 requires it wherever another social login is offered,
 * and Google is. iOS shows its own system sheet, so there is no browser and no
 * redirect. The sheet returns an identity token, and Supabase checks it.
 *
 * Supabase must have the Apple provider enabled with this app's bundle id in
 * "Authorized Client IDs". No Services ID or key is needed for this flow, which
 * is only for web sign-in.
 *
 * The nonce guards against a replayed token. Apple is given the SHA-256 of a
 * random value and puts that hash in the token. Supabase is given the raw
 * value, hashes it itself, and compares. Swapping the two makes every sign-in
 * fail with a nonce mismatch.
 */
const APPLE_CLIENT_ID = 'com.bentodining.app';

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function signInWithAppleNative() {
  const rawNonce = [...crypto.getRandomValues(new Uint8Array(16))]
    .map(b => b.toString(16).padStart(2, '0')).join('');

  let identityToken;
  try {
    const { response } = await SignInWithApple.authorize({
      clientId: APPLE_CLIENT_ID,
      // Required by the plugin's API, unused by the native sheet.
      redirectURI: 'https://www.bentodining.com/app',
      scopes: 'email name',
      nonce: await sha256Hex(rawNonce),
    });
    identityToken = response.identityToken;
  } catch (err) {
    // Closing the sheet is a cancel, not an error. iOS reports it as code 1001.
    if (/1001|cancel/i.test(`${err?.code ?? ''} ${err?.message ?? ''}`)) return;
    throw err;
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
}
