const cacheName='turfintel-iphone-map-shell-v15';
self.addEventListener('install',event=>event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(['./','./crew.js','./meter.js','./mapping.js','./phone-gps.js','./manifest.webmanifest','./icon.png','./greens.json'])).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||!event.request.url.startsWith(self.registration.scope))return;
 event.respondWith(fetch(event.request).catch(()=>caches.open(cacheName).then(c=>c.match(event.request,{ignoreSearch:true}).then(hit=>hit||Response.error()))));
});
