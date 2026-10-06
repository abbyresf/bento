// Web push subscription management.
//
// iOS is the constraint that shapes this whole file. Safari delivers web push
// only to a PWA installed to the home screen — never to a browser tab — and it
// refuses a permission request that does not come from a user gesture. A denied
// permission is also close to unrecoverable: the browser will not ask again,
// and the student has to dig through system settings. So nothing here happens
// automatically; every path starts from an explicit tap.

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/**
 * Why this device can or cannot receive push, as a single verdict the UI can
 * act on. The distinction that matters is 'needs-install': not a failure, just
 * a step the student has not taken, and the only case worth prompting about.
 */
export function pushSupport() {
  // The native app talks to APNs through the push-notifications plugin, so none
  // of the browser checks below apply. Permission is checked at the tap.
  if (Capacitor.isNativePlatform()) return { ok: true, reason: null };
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: 'not-configured' };
  }
  // Safari exposes PushManager in a tab but rejects subscription unless the
  // app was launched from the home screen.
  if (isIOS() && !isStandalone()) {
    return { ok: false, reason: 'needs-install' };
  }
  if (Notification.permission === 'denied') {
    return { ok: false, reason: 'blocked' };
  }
  return { ok: true, reason: null };
}

// VAPID keys travel as base64url; the browser wants raw bytes.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function platform() {
  if (isIOS()) return 'ios';
  if (/Android/i.test(navigator.userAgent)) return 'android';
  return 'desktop';
}

/**
 * Ask for permission and register this device. Must be called from a click.
 * Returns { ok, reason } rather than throwing, so the caller can explain
 * exactly what happened instead of showing a generic failure.
 */
export async function subscribeToPush() {
  const support = pushSupport();
  if (!support.ok) return support;
  if (Capacitor.isNativePlatform()) return subscribeNative();

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: permission === 'denied' ? 'blocked' : 'dismissed' };
  }

  const registration = await navigator.serviceWorker.ready;

  // Reuse an existing subscription rather than minting a second one for the
  // same device, which would produce duplicate notifications.
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'signed-out' };

  const json = subscription.toJSON();
  const { data: profile } = await supabase
    .from('profiles').select('university').eq('id', user.id).maybeSingle();

  // The endpoint is unique per subscription, so upserting on it keeps one row
  // per device even when a student re-subscribes.
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id:    user.id,
    endpoint:   json.endpoint,
    p256dh:     json.keys?.p256dh,
    auth:       json.keys?.auth,
    platform:   platform(),
    university: profile?.university ?? null,
    failure_count: 0,
  }, { onConflict: 'endpoint' });
  if (error) return { ok: false, reason: 'save-failed' };

  await supabase.from('profiles').update({
    push_enabled: true,
    push_opted_out_at: null,
  }).eq('id', user.id);

  return { ok: true, reason: null };
}

/**
 * Turn reminders off. The browser permission is deliberately left alone — it
 * cannot be re-requested once revoked, so the switch that gates sending is the
 * profile flag, and the subscription row is removed so nothing is sent.
 */
export async function unsubscribeFromPush() {
  const { data: { user } } = await supabase.auth.getUser();

  if (Capacitor.isNativePlatform() && user) {
    // The switch is account-wide, so every native token for this account goes.
    await supabase.from('push_subscriptions')
      .delete().eq('user_id', user.id).not('apns_token', 'is', null);
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
      await subscription.unsubscribe();
    }
  } catch {
    /* the profile flag below still stops sends */
  }

  if (user) {
    await supabase.from('profiles').update({
      push_enabled: false,
      push_opted_out_at: new Date().toISOString(),
    }).eq('id', user.id);
  }
  return { ok: true };
}

// ── Native (APNs) ────────────────────────────────────────────────────────────
//
// In the shell there is no service worker and no browser permission. iOS hands
// the app an APNs device token, and the server sends to that token directly.
// The token goes in the same table as web subscriptions, in apns_token, so one
// reminder run reaches both kinds of device.

// Ask iOS for a token. Resolves with the token string, rejects on failure or
// after 15 seconds, because a missing entitlement or a missing network makes
// iOS stay silent rather than report an error.
function registerForToken() {
  return new Promise((resolve, reject) => {
    const handles = [];
    let timer;
    const done = (fn, value) => {
      clearTimeout(timer);
      handles.forEach(h => h.remove());
      fn(value);
    };
    timer = setTimeout(() => done(reject, new Error('Timed out waiting for a push token.')), 15000);

    Promise.all([
      PushNotifications.addListener('registration', t => done(resolve, t.value)),
      PushNotifications.addListener('registrationError', e => done(reject, new Error(e?.error || 'Registration failed.'))),
    ]).then(h => {
      handles.push(...h);
      PushNotifications.register();
    }).catch(err => done(reject, err));
  });
}

async function saveNativeToken(token) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'signed-out' };

  const { data: profile } = await supabase
    .from('profiles').select('university').eq('id', user.id).maybeSingle();

  // endpoint is the table's unique key and web-only fields stay null, so a
  // native row is told apart by apns_token. The prefix keeps it from ever
  // colliding with a real web push endpoint.
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id:    user.id,
    endpoint:   `apns:${token}`,
    apns_token: token,
    platform:   'ios-native',
    university: profile?.university ?? null,
    failure_count: 0,
  }, { onConflict: 'endpoint' });
  return error ? { ok: false, reason: 'save-failed' } : { ok: true, reason: null };
}

async function subscribeNative() {
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') {
    return { ok: false, reason: perm.receive === 'denied' ? 'blocked' : 'dismissed' };
  }

  let token;
  try { token = await registerForToken(); } catch { return { ok: false, reason: 'register-failed' }; }

  const saved = await saveNativeToken(token);
  if (!saved.ok) return saved;

  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('profiles').update({
    push_enabled: true,
    push_opted_out_at: null,
  }).eq('id', user.id);
  return { ok: true, reason: null };
}

/**
 * Keep this device's token current. APNs can issue a new token, for example
 * after a restore or reinstall, and a stale one would silently stop reminders.
 * Runs at sign-in. It never prompts: if permission has not been granted it does
 * nothing, and if the student has reminders off it does nothing.
 */
export async function syncNativePushToken() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') return;
    if (!(await getPushEnabled())) return;
    await saveNativeToken(await registerForToken());
  } catch { /* a missed refresh is harmless, the old token still works until iOS retires it */ }
}

// Whether reminders are on for this account, used to render the switch.
export async function getPushEnabled() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('profiles').select('push_enabled').eq('id', user.id).maybeSingle();
  return data?.push_enabled ?? false;
}
