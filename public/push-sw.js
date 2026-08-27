/* eslint-env serviceworker */
// Push handlers, layered onto the generated Workbox service worker via
// workbox.importScripts. Kept in its own file so the PWA build strategy does
// not have to change: generateSW keeps owning caching, this only adds push.

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A push with a non-JSON body should still surface something rather than
    // being dropped silently.
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Bento';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Collapses repeats: a second reminder replaces the first rather than
    // stacking two notifications for the same meal.
    tag: payload.tag || 'bento-meal',
    renotify: false,
    requireInteraction: false,
    data: { url: payload.url || '/app' },
  };

  // waitUntil keeps the worker alive until the notification is actually shown.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/app';

  // Focus an already-open Bento rather than opening a second copy.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes('/app') && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

// Push services rotate subscriptions on their own. Without this the student
// silently stops receiving anything, so the new subscription is sent back to
// the server to replace the old one.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const sub = await self.registration.pushManager.subscribe(
          event.oldSubscription?.options ?? { userVisibleOnly: true }
        );
        await fetch('/api/push-resubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            oldEndpoint: event.oldSubscription?.endpoint ?? null,
            subscription: sub.toJSON(),
          }),
        });
      } catch {
        /* nothing useful to do in the worker; the next app load re-subscribes */
      }
    })()
  );
});
