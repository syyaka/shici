const CACHE = 'shici-v13';
const SHELL = [
  './',
  'index.html',
  'app.css',
  'app.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-512.png',
  'apple-touch-icon.png',
  'sample-page.jpg',
  'vendor/tesseract.min.js',
  'vendor/worker.min.js',
  'vendor/pdf/pdf.min.js',
  'vendor/pdf/pdf.worker.min.js',
  'extra.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_URLS') return;
  const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let failed = 0;
    for (const url of urls) {
      try {
        await cache.add(url);
      } catch {
        failed += 1;
      }
    }
    event.ports[0]?.postMessage({ done: true, failed });
  })());
});
