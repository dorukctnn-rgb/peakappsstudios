/* Ficshelf's service worker: after the first visit the tool opens without a connection. It keeps this tool's own files (the page, the
 * scripts, the font) and the shared site scripts in a cache, answers from the network first (so a new version arrives as soon as you
 * are online) and from the cache when there is no network. It never touches another host, and no file you add to the library is
 * ever stored here. This is the only file of the tool that fetches anything: the files of this site, nothing else. */
const CACHE = 'ficshelf-v1';
const BASE = '/ao3-offline-reader/';
const FILES = [BASE, `${BASE}tool.css`, `${BASE}fonts/ficshelf-display.woff2`, `${BASE}img/icon.svg`, '/assets/site.js', '/assets/license.js', '/assets/pro-source.js',
  ...['app', 'html', 'parse', 'epub', 'zip', 'csv', 'source', 'scan', 'work', 'library', 'export', 'search', 'store', 'pro', 'sample', 'reader', 'worker'].map(n => `${BASE}js/${n}.js`)];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(FILES.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !(url.pathname.startsWith(BASE) || url.pathname.startsWith('/assets/'))) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') { const home = await cache.match(BASE); if (home) return home; }
      return Response.error();
    }
  })());
});
