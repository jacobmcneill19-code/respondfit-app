/* RespondFit service worker: lets the app open and run workouts without a connection. */
const V = 'rf-v1', SHELL = ['./', 'index.html', 'rf-adapter.js', 'firebase-config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
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
