/* Service Worker — Coach Proactividad Fase 2 (web push).
   Solo maneja push + notificationclick; NO cachea (la app no es offline-first en F2). */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Push entrante → muestra la notificación. El payload lo arma el cron (título/cuerpo YA validados
// por el post-check F1.5; el SW no reescribe nada).
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || 'Tu coach';
  const options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'coach-nudge',   // colapsa duplicados del mismo tipo
    data: { url: data.url || '/coach' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tap en la notificación → enfoca una pestaña abierta del coach o abre una nueva.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/coach';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    })
  );
});
