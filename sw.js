/* Version the shell as a unit. User files and OpenAI traffic are never cached. */
const CACHE='schema-dock-shell-v2026-10-19-2';
const SHELL=['./','index.html','style.css','boot.js','core.js','editing.js','layout.js','documents.js','promotion.js','root-promotion.js','promotion-ui.js','example-migration.js','graph-ui.js','json-editor.js','app.js','file-ui.js','pwa.js','ai.js','ai-ui.js','manifest.webmanifest','icons/icon.svg','icons/icon-192.png','icons/icon-512.png'];
const urls=new Set(SHELL.map(p=>new URL(p,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('schema-dock-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>caches.match(new URL('index.html',self.registration.scope).href)));return;
  }
  if(!urls.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(request))||fetch(request)));
});
