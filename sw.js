// Tenor service worker — Web Push handling for the Reminder System
// (Phase 3). See TENOR_CONTEXT.md → "Detailed Flow: Notification /
// Reminder System".
//
// Vite serves files from /public verbatim; this file ships AS-IS,
// no bundling. Keep it framework-free and ES5-safe so older PWAs
// don't choke on syntax.

self.addEventListener('install', function () {
  // Activate the latest SW immediately on update so users don't get
  // stuck on a stale push handler after a deploy.
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  var payload = { title: 'Tenor', body: '', tag: 'daily-reminder', data: {} };
  if (event.data) {
    try {
      var parsed = event.data.json();
      payload.title = parsed.title || payload.title;
      payload.body = parsed.body || payload.body;
      payload.tag = parsed.tag || payload.tag;
      payload.data = parsed.data || payload.data;
    } catch (_) {
      // Fall back to raw text if the payload wasn't JSON.
      payload.body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: payload.data,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var stage = (event.notification.data && event.notification.data.stage) || 1;
  event.waitUntil(
    (async function () {
      var allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Reuse an existing tab if one is already open — focus + message.
      for (var i = 0; i < allClients.length; i++) {
        var client = allClients[i];
        if ('focus' in client) {
          try {
            await client.focus();
          } catch (_) {}
          client.postMessage({ type: 'tenor:reminder', stage: stage });
          return;
        }
      }
      // No open client → open a new window. The startup `message`
      // listener in App.tsx will route the stage once the app mounts.
      if (self.clients.openWindow) {
        var url = '/?reminderStage=' + stage;
        await self.clients.openWindow(url);
      }
    })(),
  );
});
