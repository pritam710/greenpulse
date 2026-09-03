const CACHE = 'greenpulse-v5-public-shell-only';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('greenpulse-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const shellRoot = new URL('./', self.registration.scope).pathname;
  const publicAsset = url.pathname.startsWith(shellRoot + 'assets/') ||
    ['index.html', 'manifest.webmanifest', 'favicon.svg'].some(name => url.pathname === shellRoot + name) || url.pathname === shellRoot;
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      event.request.headers.has('Authorization') || !publicAsset) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && !response.headers.get('Cache-Control')?.includes('no-store')) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) ||
    (event.request.mode === 'navigate' ? await caches.match('./index.html') : null) || Response.error()));
});
