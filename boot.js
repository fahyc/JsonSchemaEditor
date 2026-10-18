/* Keep installed and browser workspaces separate, including first-run examples. */
'use strict';
window.APP_MODE=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true||new URLSearchParams(location.search).get('app')==='1';
window.workspaceReady=(async()=>{
  const scripts=[...(!APP_MODE?['schemas.bundle.js','startup.js']:[]),'core.js','editing.js','layout.js','documents.js','graph-ui.js','json-editor.js','app.js','ai.js','ai-ui.js','file-ui.js','pwa.js'];
  for(const src of scripts)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('Could not load '+src));document.body.append(s);});
})().catch(error=>{console.error(error);document.querySelector('#empty').hidden=false;document.querySelector('#empty').textContent=error.message+'. Restart your local server and reload.';});
