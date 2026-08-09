// Anzen Dictionary service worker.
// Goal: open the app FAST every time, while still picking up new deploys.
//  • hashed vendor assets (…/vendor/<hash>.js, react, babel, supabase) never
//    change for a given URL → cache-first, served instantly, no network wait.
//  • everything else (index.html, config.js, sw itself) → stale-while-revalidate:
//    answer from cache at once, then refresh the cache in the background so the
//    next open shows the newest version.
// A fetch handler also makes the app installable ("Add to Home Screen").
const CACHE = 'anzen-dict-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  // drop old caches from previous versions
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

// content-addressed assets: the filename already encodes the content, so a hit
// is always correct and we never need to re-check the network
const IMMUTABLE = /\/vendor\/|\.(?:woff2?|ttf|otf|png|jpe?g|svg|webp|gif|ico|mp3|wav|ogg)(?:\?|$)/i;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // let cross-origin (Supabase, audio CDNs) pass straight through

  if (IMMUTABLE.test(url.pathname)) {
    // cache-first: instant, fetch+store only on a miss
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    })));
    return;
  }

  // stale-while-revalidate for the HTML shell / config / anything else
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => hit);
    return hit || net;   // cached now if we have it, otherwise wait for network
  }));
});
