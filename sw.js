// Network-first service worker: online you always get the newest files, offline the last copy. Bump V to drop old caches.
const V="astrovault-v5";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
// Stale-while-revalidate: instant load from cache, refreshed in the background (was network-first = slow).
self.addEventListener("fetch",e=>{const r=e.request,u=new URL(r.url);if(r.method!=="GET"||u.origin!==location.origin)return;
 e.respondWith(caches.open(V).then(c=>c.match(r).then(m=>{const f=fetch(r).then(res=>{if(res.ok)c.put(r,res.clone());return res}).catch(()=>m||c.match("index.html"));return m||f})))});
