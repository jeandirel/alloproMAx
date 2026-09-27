const CACHE='allopro-public-v1';
const PUBLIC=['/offline-v1.html','/app-icon-v1-192.png','/app-icon-v1-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PUBLIC)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('allopro-public-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{const req=event.request;const url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
if(req.mode==='navigate'){event.respondWith(fetch(req).catch(()=>caches.match('/offline-v1.html')));return;}
if(PUBLIC.includes(url.pathname)||url.pathname.startsWith('/portraits-v2/'))event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(req);if(cached)return cached;const response=await fetch(req);if(response.ok)await cache.put(req,response.clone());return response;}));
});
