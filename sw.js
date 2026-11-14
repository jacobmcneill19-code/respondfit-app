/* RespondFit service worker: lets the app open and run workouts without a connection. */
const V = 'rf-v11', SHELL = ['./', 'index.html', 'rf-adapter.js', 'firebase-config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { notification: { body: e.data ? e.data.text() : '' } }; }
  const n = d.notification || {}, x = d.data || {};
  e.waitUntil(self.registration.showNotification(n.title || x.title || 'RespondFit', { body: n.body || x.body || '', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: x.url || (d.fcmOptions && d.fcmOptions.link) || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const u = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => { for (const c of l) { if ('focus' in c) return c.focus(); } return self.clients.openWindow(u); }));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  const own = u.origin === location.origin, lib = u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/'), font = u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
  if (!own && !lib && !font) return; /* sign-in, database and photos always go to the network */
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(r, { ignoreSearch: false });
    const net = fetch(r).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()); return res; }).catch(() => null);
    if (r.mode === 'navigate') { const res = await net; return res || hit || c.match('index.html'); }
    return hit || (await net) || Response.error();
  }));
});
