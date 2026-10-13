// Anzen Dictionary service worker.
// Goal: open the app FAST every time, while still picking up new deploys.
//  • hashed vendor assets (…/vendor/<hash>.js, react, babel, supabase) never
//    change for a given URL → cache-first, served instantly, no network wait.
//  • everything else (index.html, config.js, sw itself) → stale-while-revalidate:
//    answer from cache at once, then refresh the cache in the background so the
//    next open shows the newest version. When the refreshed index.html differs from
//    the one just served, open tabs get {type:'dict-update'} and show a reload banner.
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

async function digest(res){
  const buf = await res.clone().arrayBuffer();
  const h = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, '0')).join('');
}
function notifyUpdate(){
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'dict-update' })));
}

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
  const isShell = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then(async (res) => {
      // the page we just served from cache is out of date → tell the open tabs, so the
      // app can offer "new version — reload" instead of staying on the old one until next time
      if (isShell && hit && res.ok) { try { if ((await digest(hit)) !== (await digest(res))) notifyUpdate(); } catch (err) {} }
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => hit);
    return hit || net;   // cached now if we have it, otherwise wait for network
  }));
});
