(()=>{
  let installPrompt,reloadForUpdate=false;
  const install=document.createElement('button');install.id='install-app';install.textContent='Install app';install.hidden=true;$('#help').before(install);
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;if(!APP_MODE)install.hidden=false;});
  install.onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;install.hidden=true;};
  window.addEventListener('appinstalled',()=>{install.hidden=true;notify('Installed. Choose Schema Dock under Windows Open with to associate JSON files.');});
  if('serviceWorker' in navigator&&location.protocol!=='file:'){
    navigator.serviceWorker.register('./sw.js').then(reg=>{
      function update(){if(!reg.waiting)return;let button=$('#app-update');if(!button){button=document.createElement('button');button.id='app-update';button.textContent='Update ready · Reload';$('#help').before(button);}
        button.onclick=()=>{if(!window.confirm('Reload to update Schema Dock? Workspace drafts are recovered locally. Save open source edits before continuing.'))return;reloadForUpdate=true;reg.waiting.postMessage('SKIP_WAITING');};
      }
      update();reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)update();});});
    }).catch(error=>notify('Offline setup unavailable: '+error.message));
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloadForUpdate)location.reload();});
  }
  const oldHelp=$('#help').onclick;
  $('#help').onclick=()=>{oldHelp();if(APP_MODE){$('#reload-defaults')?.remove();const extra=document.createElement('p');extra.className='hint';extra.textContent='Installed app: File → Open JSON accepts several files in one workspace. Recent files are in the File menu. Ctrl+S saves; Ctrl+Shift+S saves a copy. Set Schema Dock as the JSON default through Windows Open with. Browser and installed workspaces are separate. Examples remain available in the browser version.';$('#small-body').prepend(extra);}};
})();
