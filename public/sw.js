const CACHE='confeita-static-v2';
const STATIC_ASSETS=['/confeita-mark.svg'];

self.addEventListener('install',(event)=>{
  event.waitUntil(
    caches.open(CACHE)
      .then((cache)=>cache.addAll(STATIC_ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',(event)=>{
  event.waitUntil(
    caches.keys()
      .then((keys)=>Promise.all(keys.filter((key)=>key!==CACHE).map((key)=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',(event)=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;

  if(request.mode==='navigate'){
    event.respondWith(fetch(request));
    return;
  }

  if(url.pathname.startsWith('/_next/static/')||STATIC_ASSETS.includes(url.pathname)){
    event.respondWith(
      caches.match(request).then((cached)=>cached||fetch(request).then((response)=>{
        const copy=response.clone();
        caches.open(CACHE).then((cache)=>cache.put(request,copy));
        return response;
      }))
    );
    return;
  }

  event.respondWith(fetch(request));
});
