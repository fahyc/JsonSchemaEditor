/* Local file handles are kept in IndexedDB; undo/workspace JSON stores IDs only. */
(()=>{
  'use strict';
  const records=new Map();let dbPromise,busySave=false,busyOpen=false,dependencyFolder=null,openQueue=Promise.resolve(),saveFinished=Promise.resolve(),finishSave=()=>{};
  const keyCurrent=()=>state.mode==='schema'?'schema:'+state.activeSchema:'data:'+state.activeData;
  const current=()=>state.mode==='schema'?(C.own(state.schemas,state.activeSchema)?{key:keyCurrent(),name:state.activeSchema,value:state.schemas[state.activeSchema],kind:'schema',fileId:state.schemaFiles?.[state.activeSchema]}:null):activeData()?{...activeData(),key:keyCurrent(),kind:'data'}:null;
  function db(){return dbPromise||=(new Promise((resolve,reject)=>{const r=indexedDB.open('schema-dock-files',1);r.onupgradeneeded=()=>r.result.createObjectStore('recent',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}));}
  async function store(record){records.set(record.id,record);try{const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction('recent','readwrite');tx.objectStore('recent').put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}catch{notify('Recent-file storage unavailable. Your file can still be saved.');}}
  async function loadRecords(){try{const database=await db();const list=await new Promise((resolve,reject)=>{const r=database.transaction('recent').objectStore('recent').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});for(const r of list)if(r.kind==='directory')dependencyFolder=r;else records.set(r.id,r);}catch{}updateFiles();}
  function recordFor(doc){return doc?.fileId?records.get(doc.fileId):null;}
  function serialized(value){return JSON.stringify(value,null,2)+'\n';}
  function dirty(doc){if(!doc)return false;const r=recordFor(doc);return !r||doc.rawText!==undefined||JSON.stringify(doc.value)!==r.savedValue;}
  function documentForSchema(name){return {key:'schema:'+name,name,kind:'schema',value:state.schemas[name],fileId:state.schemaFiles?.[name]};}
  function documentForData(d){return {...d,key:'data:'+d.id,kind:'data'};}
  const fileMenu=document.createElement('details');fileMenu.id='file-menu';
  fileMenu.innerHTML=`<summary>File</summary><div class="file-menu-panel"><button id="file-open">Open JSON… <small>Ctrl+O</small></button><button id="file-new">New JSON file</button><button id="file-save">Save <small>Ctrl+S</small></button><button id="file-save-as">Save As… <small>Ctrl+Shift+S</small></button><button id="file-associate">Choose / remove schema…</button><button id="file-kind">Change document kind…</button><button id="file-close">Close current file</button>${APP_MODE?'<button id="file-reload">Reload from disk</button><button id="file-reload-all">Reload all from disk</button><button id="file-dependency-folder">Choose dependency folder…</button><p id="dependency-folder-status" class="hint"></p><label for="recent-files">Recent files</label><select id="recent-files"><option value="">Open recent file…</option></select><button id="clear-recents">Clear recent list</button>':''}</div>`;
  $('header').insertBefore(fileMenu,$('.mode-switch'));
  const saveButton=document.createElement('button');saveButton.id='save-file';saveButton.textContent='Save';$('#export').before(saveButton);
  const assoc=document.createElement('button');assoc.id='choose-schema';assoc.textContent='Choose schema';$('#json-view').before(assoc);
  const fallback=document.createElement('input');fallback.type='file';fallback.accept='.json,application/json';fallback.multiple=true;fallback.hidden=true;document.body.append(fallback);
  async function openPicker(){fileMenu.open=false;try{if(window.showOpenFilePicker){const handles=await showOpenFilePicker({multiple:true,types:[{description:'JSON documents and schemas',accept:{'application/json':['.json']}}]});await enqueue(handles);}else fallback.click();}catch(e){if(e.name!=='AbortError')notify('Open failed: '+e.message);}}
  fallback.onchange=()=>{enqueue([...fallback.files]);fallback.value='';};
  $('#file-open').onclick=openPicker;$('#open-json').onclick=openPicker;$('#new-json').onclick=newFreeData;$('#file-new').onclick=()=>{fileMenu.open=false;newFreeData();};
  function updateFiles(){
    const free=state.data.filter(d=>!d.schema);
    $('#json-list').innerHTML=free.length?free.map(d=>`<button class="file-item ${state.mode==='data'&&state.activeData===d.id?'active':''}" data-json="${h(d.id)}">{ } ${h(d.name)}<small>${d.rawText!==undefined?'JSON syntax needs correction':'No schema'}</small></button>`).join(''):'<p class="hint" style="padding:0 10px">Open or create any JSON document.</p>';
    $$('[data-json]').forEach(b=>b.onclick=()=>activateData(b.dataset.json));
    for(const b of $$('[data-file]'))mark(b,documentForSchema(b.dataset.file));for(const b of $$('[data-data],[data-json]')){const d=state.data.find(d=>d.id===(b.dataset.data||b.dataset.json));if(d)mark(b,documentForData(d));}
    const doc=current();saveButton.disabled=busySave||busyOpen||!doc;saveButton.textContent=busySave?'Saving…':'Save';$('#file-save').disabled=busySave||busyOpen||!doc;$('#file-save-as').disabled=busySave||busyOpen||!doc;$('#file-close').disabled=busySave||busyOpen||!doc;$('#file-kind').disabled=busySave||busyOpen||!doc;
    if(APP_MODE){$('#export').textContent='↓ Export…';$('#export').disabled=busySave||busyOpen||!doc;$('#export').title='Choose a destination. Future Ctrl+S saves to the exported file.';$('#file-reload').disabled=busySave||busyOpen||!recordFor(doc);$('#file-reload-all').disabled=busySave||busyOpen||![...Object.values(state.schemaFiles||{}),...state.data.map(d=>d.fileId)].some(id=>records.has(id));$('#file-dependency-folder').disabled=busySave||busyOpen||!window.showDirectoryPicker;$('#dependency-folder-status').textContent=dependencyFolder?'Dependency folder: '+dependencyFolder.name:'Grant folder access to find neighboring schemas.';}
    $('#file-associate').disabled=state.mode!=='data'||!activeData()||activeData().rawText!==undefined;assoc.hidden=state.mode!=='data'||!activeData();assoc.textContent=activeData()?.schema?'Change schema':'Choose schema';
    const r=recordFor(doc);$('#save-state').textContent=doc?(dirty(doc)?'● Unsaved file · draft in this '+(APP_MODE?'app':'browser'):r?'✓ Saved to '+r.name:'Draft in this browser'):(APP_MODE?'Installed workspace':'Browser workspace');
    if(window.workspaceStorageError)$('#save-state').textContent='Draft storage unavailable · save to a file';
    document.title=(doc?(dirty(doc)?'● ':'')+doc.name+' · ':'')+'Schema Dock';
    if(APP_MODE){const sel=$('#recent-files'),old=sel.value;sel.innerHTML='<option value="">Open recent file…</option>'+[...records.values()].filter(r=>!r.hideRecent).sort((a,b)=>b.lastOpened-a.lastOpened).map(r=>`<option value="${h(r.id)}">${h(r.name)} · ${r.kind==='schema'?'schema':r.schema?'data':'JSON'}</option>`).join('');if(records.has(old))sel.value=old;}
  }
  function mark(button,doc){button.querySelector('.dirty-dot')?.remove();button.classList.toggle('file-dirty',dirty(doc));if(dirty(doc)){const dot=document.createElement('span');dot.className='dirty-dot';dot.textContent='●';dot.title='Changes not saved to a file';button.append(dot);}}
  function activateData(id){state.activeData=id;state.mode='data';const d=activeData();if(d?.schema)state.activeSchema=d.schema;$('#search').value='';persist();render();}
  function activateSchema(name){state.activeSchema=name;state.mode='schema';$('#search').value='';persist();render();}
  function ask(title,html,setup){return new Promise(resolve=>{openSmall(title,html);let answered=false;const finish=v=>{if(answered)return;answered=true;$('#small-dialog').removeEventListener('close',cancel);closeSmall();resolve(v);};const cancel=()=>{if($('#small-dialog').open)return;if(!answered){answered=true;$('#small-dialog').removeEventListener('close',cancel);resolve(null);}};$('#small-dialog').addEventListener('close',cancel);setup(finish);});}
  function confirm(title,message){return ask(title,`<p class="warning">${h(message)}</p><div class="modal-actions"><button id="file-no">Cancel</button><button id="file-yes" class="primary">Continue</button></div>`,done=>{$('#file-no').onclick=()=>done(false);$('#file-yes').onclick=()=>done(true);});}
  async function sameRecord(handle){if(typeof handle.getFile!=='function')return null;for(const r of records.values())try{if(await handle.isSameEntry(r.handle))return r;}catch{}return null;}
  function opened(record){
    if(!record)return null;const name=Object.keys(state.schemaFiles||{}).find(n=>state.schemaFiles[n]===record.id);
    if(name)return documentForSchema(name);const d=state.data.find(d=>d.fileId===record.id);return d?documentForData(d):null;
  }
  async function readEntry(input){
    const handle=typeof input.getFile==='function'?input:null;
    if(handle&&await handle.queryPermission({mode:'read'})!=='granted'){
      if(!navigator.userActivation.isActive||await handle.requestPermission({mode:'read'})!=='granted')throw Error('Read permission is needed. Open this file from the File menu to grant access again.');
    }
    const file=handle?await handle.getFile():input,text=await file.text();let value,error;
    try{value=DocumentTools.parse(text);}catch(e){error=e.message;value=null;}
    const record=handle?await sameRecord(handle):null,doc=opened(record);
    return {handle,name:file.name,text,value,error,record,requested:true,kind:doc?.kind==='schema'||record?.kind==='schema'?'schema':error?'json':DocumentTools.classify(file.name,value)};
  }
  async function parentDirectory(handle){
    if(!handle||!dependencyFolder)return null;
    try{const root=dependencyFolder.handle;if(await root.queryPermission({mode:'read'})!=='granted')return null;const path=await root.resolve(handle);if(!path?.length)return null;let dir=root;for(const part of path.slice(0,-1))dir=await dir.getDirectoryHandle(part);return dir;}catch{return null;}
  }
  async function discover(entries){
    for(let i=0;i<entries.length;i++){
      const e=entries[i];if(e.error)continue;
      if(e.kind!=='schema'&&e.record?.schemaPinned&&!e.record.schema)continue;
      const names=[];if(e.kind==='schema')DocumentTools.schemaRefs(e.value,s=>{const name=DocumentTools.referenceFilename(s.$ref);if(name)names.push(name);});
      else names.push(...DocumentTools.schemaCandidates(e.name,e.value,e.record?.schema));
      const dir=await parentDirectory(e.handle);
      for(const name of [...new Set(names)]){
        let dependency=entries.find(x=>x.kind==='schema'&&x.name===name),handle;
        if(dir){try{handle=await dir.getFileHandle(name);}catch(error){if(error.name!=='NotFoundError')notify('Cannot read dependency '+name+': '+error.message);}}
        if(!handle&&dir){if(e.kind!=='schema'&&C.own(state.schemas,name)){e.schemaHint=name;break;}continue;}
        if(!handle&&dependency){if(e.kind!=='schema'){e.schemaHint=name;break;}continue;}
        if(!handle&&(e.kind==='schema'||e.record?.schema||DocumentTools.referenceFilename(e.value?.$schema))){const matches=[...records.values()].filter(r=>r.kind==='schema'&&r.name===name);if(matches.length===1)handle=matches[0].handle;}
        if(!handle)continue;
        // Handle identity breaks recursive dependency cycles, including self references.
        dependency=null;for(const candidate of entries)if(candidate.handle)try{if(await handle.isSameEntry(candidate.handle)){dependency=candidate;break;}}catch{}
        if(!dependency){try{dependency=await readEntry(handle);dependency.kind='schema';dependency.requested=false;entries.push(dependency);}catch(error){notify('Could not read schema '+name+': '+error.message);continue;}}
        if(e.kind!=='schema'){e.schemaHint=name;break;}
      }
    }
  }
  function enqueue(inputs,options={}){
    openQueue=openQueue.then(()=>ready).then(async()=>{
      await saveFinished;
      for(const dialog of [$('#small-dialog'),$('#ai-dialog')].filter(Boolean))if(dialog.open){notify('Finish the current dialog to review incoming file changes.');await new Promise(resolve=>{const closed=()=>{if(dialog.open)return;dialog.removeEventListener('close',closed);resolve();};dialog.addEventListener('close',closed);});}
      await saveFinished;
      if($('#editor').open&&['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))document.activeElement.blur();
      busyOpen=true;updateFiles();try{return await openBatch(inputs,options);}finally{busyOpen=false;updateFiles();}
    }).catch(e=>notify('Open failed: '+e.message));return openQueue;
  }
  async function chooseReload(e,doc,force){
    const changed=e.text!==e.record.diskText,local=dirty(doc);
    if(!changed&&!(force&&local))return force?'reload':'keep';
    return await ask('Reload '+e.name+'?',`<p class="warning">${h(changed?'This file changed on disk since it was loaded.':'The file on disk is unchanged.')}</p><p class="hint">${h(local?'Your workspace also has unsaved changes. Reloading will discard them.':'Your workspace has no unsaved changes.')} Keep the workspace version, or replace it with the current file from disk. Undo is available after a reload.</p><div class="modal-actions"><button id="disk-keep">Keep workspace version</button><button id="disk-reload" class="primary">Reload from disk</button></div>`,done=>{$('#disk-keep').onclick=()=>done('keep');$('#disk-reload').onclick=()=>done('reload');})||'keep';
  }
  async function openBatch(inputs,options={}){
    const selected=current(),entries=[],counts={reloaded:0,kept:0,errors:0};
    for(const input of inputs)try{entries.push(await readEntry(input));}catch(e){counts.errors++;notify('Could not read '+(input.name||'file')+': '+e.message);}
    if(!entries.length)return counts;
    await discover(entries);
    const ambiguous=entries.filter(e=>e.kind==='ambiguous'&&!opened(e.record));
    if(ambiguous.length){const choice=await ask('Choose document kinds',`<p class="hint">These documents contain schema-like fields. Choose how to open them.</p>${ambiguous.map((e,i)=>`<label class="field-label">${h(e.name)}<select data-kind="${i}"><option value="json">JSON data</option><option value="schema">JSON Schema</option></select></label>`).join('')}<div class="modal-actions"><button id="kinds-open" class="primary">Open files</button></div>`,done=>{$('#kinds-open').onclick=()=>done($$('[data-kind]').map(s=>s.value));});if(!choice)return counts;ambiguous.forEach((e,i)=>e.kind=choice[i]);await discover(entries);}
    for(const e of [...entries.filter(e=>e.kind==='schema'),...entries.filter(e=>e.kind!=='schema')]){
      const existing=opened(e.record);
      if(existing){
        e.result=existing.kind==='schema'?{schema:existing.name}:{data:existing.id};
        const decision=await chooseReload(e,existing,options.force);
        if(decision!=='reload'){let association=e.record.schema;if(e.text===e.record.diskText&&existing.kind!=='schema'&&!existing.schema&&e.schemaHint){change(()=>state.data.find(d=>d.id===existing.id).schema=e.schemaHint);association=e.schemaHint;}counts.kept++;await store({...e.record,schema:association,lastOpened:Date.now(),hideRecent:false});continue;}
        if(existing.kind==='schema'){
          try{if(e.error)throw Error(e.error);assertSchema(e.value);}catch(error){counts.errors++;await ask('Cannot reload '+e.name,`<p class="error-text">${h(error.message)}</p><p class="hint">The loaded schema is preserved. Fix its source before reloading.</p><pre class="reload-source">${h(e.text)}</pre><button id="reload-error-close">Keep workspace version</button>`,done=>{$('#reload-error-close').onclick=()=>done(true);});continue;}
          change(()=>Object.defineProperty(state.schemas,existing.name,{value:e.value,writable:true,enumerable:true,configurable:true}));
        }else{
          const d=state.data.find(d=>d.id===existing.id);change(()=>{d.value=e.value;if(e.error){d.rawText=e.text;d.schema=null;}else{delete d.rawText;if(e.schemaHint)d.schema=e.schemaHint;}});
        }
        counts.reloaded++;
        await store({...e.record,handle:e.handle,name:e.name,schema:existing.kind==='schema'?null:state.data.find(d=>d.id===existing.id)?.schema,lastOpened:Date.now(),hideRecent:false,diskText:e.text,savedValue:JSON.stringify(e.value)});continue;
      }
      if(e.kind==='schema')try{if(e.error)throw Error(e.error);assertSchema(e.value);}catch(error){e.error='Invalid schema: '+error.message;e.kind='json';}
      if(e.kind==='schema'&&C.own(state.schemas,e.name)&&!await confirm('Replace loaded schema?',e.name+' is already open. Replacing it discards its current workspace value. Undo is available.'))continue;
      const id=e.record?.id||cryptoId(),schema=e.kind==='schema'?null:e.record?.schemaPinned?(e.record.schema||null):e.schemaHint||e.record?.schema||(()=>{const matches=DocumentTools.matchingSchemas(state.schemas,e.value);return matches.length===1?matches[0]:null;})();
      if(e.kind==='schema'){
        change(()=>{Object.defineProperty(state.schemas,e.name,{value:e.value,writable:true,enumerable:true,configurable:true});state.schemaFiles||={};if(e.handle)state.schemaFiles[e.name]=id;else delete state.schemaFiles[e.name];});e.result={schema:e.name};
      }else{
        const d={id:cryptoId(),name:e.name,schema:e.error?null:schema,value:e.value,...(e.error?{rawText:e.text}:{}),...(e.handle?{fileId:id}:{})};change(()=>state.data.push(d));e.result={data:d.id};if(e.error)notify(e.name+': '+e.error+'. Open the node to correct the JSON.');
      }
      if(e.handle)await store({...e.record,id,handle:e.handle,name:e.name,kind:e.kind==='schema'?'schema':'data',schema,lastOpened:Date.now(),hideRecent:false,diskText:e.text,savedValue:JSON.stringify(e.value)});
    }
    const active=options.preserveSelection&&selected?(selected.kind==='schema'?{schema:selected.name}:{data:selected.id}):[...entries].reverse().find(e=>e.requested&&e.result)?.result;
    if(active?.schema)activateSchema(active.schema);else if(active?.data)activateData(active.data);persist();updateFiles();
    if($('#editor').open)refreshEditor();return counts;
  }
  async function recentOpen(id){
    const record=records.get(id);if(!record)return;
    try{const opts={mode:'read'};if(await record.handle.queryPermission(opts)!=='granted'&&await record.handle.requestPermission(opts)!=='granted')throw Error('Read permission was not granted.');return await enqueue([record.handle]);}
    catch(e){notify('Could not reopen '+record.name+': '+e.message+'. Use Open JSON to locate it again.');}
  }
  async function reload(all){
    fileMenu.open=false;if(busySave||busyOpen)return;
    if($('#small-dialog').open||$('#ai-dialog')?.open){notify('Finish the current dialog before reloading files.');return;}
    const el=document.activeElement;if($('#editor').open&&el&&['INPUT','TEXTAREA','SELECT'].includes(el.tagName))el.blur();
    const docs=all?[...Object.keys(state.schemas).map(documentForSchema),...state.data.map(documentForData)]:[current()].filter(Boolean),ids=[...new Set(docs.map(d=>d.fileId).filter(id=>records.has(id)))];
    if(!ids.length){notify('No disk file is linked. Open or save this document first.');return;}
    const result=await enqueue(ids.map(id=>records.get(id).handle),{force:true,preserveSelection:true});
    if(result)notify('Reloaded '+result.reloaded+' file(s); kept '+result.kept+'; read errors '+result.errors+(docs.length>ids.length?'. Unlinked drafts were left alone.':'.'));
  }
  if(APP_MODE){
    $('#file-reload').onclick=()=>reload(false);$('#file-reload-all').onclick=()=>reload(true);
    $('#recent-files').onchange=async e=>{const id=e.target.value;e.target.value='';fileMenu.open=false;if(id)await recentOpen(id);};
    $('#clear-recents').onclick=async()=>{for(const r of records.values()){r.hideRecent=true;await store(r);}updateFiles();notify('Recent list cleared. Open files retained.');};
    $('#file-dependency-folder').onclick=async()=>{
      fileMenu.open=false;try{const handle=await showDirectoryPicker({id:'schema-dock-dependencies',mode:'read'});dependencyFolder={id:'dependency-folder',kind:'directory',name:handle.name,handle};const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction('recent','readwrite');tx.objectStore('recent').put(dependencyFolder);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});updateFiles();notify('Dependency folder selected. Checking open files for neighboring schemas.');const handles=[...Object.keys(state.schemas).map(documentForSchema),...state.data.map(documentForData)].map(d=>recordFor(d)?.handle).filter(Boolean);if(handles.length)await enqueue(handles,{preserveSelection:true});}catch(e){if(e.name!=='AbortError')notify('Folder access failed: '+e.message);}
    };
  }

  async function save(as=false){
    fileMenu.open=false;if(busySave||busyOpen)return;
    if($('#ai-dialog')?.open){notify('Close the AI generator before saving a file.');return;}
    if($('#small-dialog').open&&!$('#json-edit')){notify('Finish the current dialog before saving the file.');return;}
    // Apply an open source editor before capturing a document for disk saving.
    if($('#small-dialog').open&&$('#json-edit')){$('#json-apply').click();if($('#small-dialog').open)return;}
    if($('#editor').open&&$('#raw-json-source')){$('#raw-json-apply').click();if(activeData()?.rawText!==undefined)return;}
    if($('#editor').open){const el=document.activeElement;if(el&&['INPUT','TEXTAREA','SELECT'].includes(el.tagName)){el.blur();}}
    let doc=current();if(!doc)return;
    if(doc.rawText!==undefined){notify('Fix JSON syntax before saving.');openData('');return;}
    busySave=true;saveFinished=new Promise(resolve=>finishSave=resolve);updateFiles();
    try{
      let errors=[];try{errors=state.mode==='schema'?schemaIssues().filter(e=>e.path.startsWith(doc.name+'#')):doc.schema?errorsNow():[];}catch(e){errors=[{message:e.message}];}
      if(errors.length&&!await confirm('Save with schema validation issues?',errors.length+' validation issue(s) remain. This JSON may not work in software expecting this schema. Save it anyway?'))return;
      const record=recordFor(doc);let handle=as?null:record?.handle;
      if(!handle){
        if(!window.showSaveFilePicker){download(doc.name,doc.value);notify('Browser does not support saving in place. Downloaded a copy.');return;}
        handle=await showSaveFilePicker({suggestedName:doc.name,types:[{description:'JSON',accept:{'application/json':['.json']}}]});
      }
      const namingKey=JSON.stringify([doc.kind,handle.name,doc.schema||null]),warnings=DocumentTools.namingWarnings(doc.kind,handle.name,doc.schema);
      if(warnings.length&&record?.namingAccepted!==namingKey){const allow=await ask('Nonstandard filename',`<p class="warning">${warnings.map(w=>h(w)).join('<br>')}</p><p class="hint">The file can still be saved with this name. Folder-based schema discovery may need an explicit schema reference or a manual selection. This warning is remembered for this filename and schema.</p><div class="modal-actions"><button id="naming-cancel">Cancel save</button><button id="naming-save-anyway" class="primary">Save with this name</button></div>`,done=>{$('#naming-cancel').onclick=()=>done(false);$('#naming-save-anyway').onclick=()=>done(true);});if(!allow)return;}
      const permission={mode:'readwrite'};
      if(await handle.queryPermission(permission)!=='granted'&&await handle.requestPermission(permission)!=='granted')throw Error('Write permission was not granted.');
      let diskText;try{diskText=await (await handle.getFile()).text();}catch(e){if(e.name!=='NotFoundError')throw e;}
      if(record&&await handle.isSameEntry(record.handle)&&diskText!==record.diskText&&!await confirm('File changed outside the editor','The file on disk changed since it was opened or saved. Overwrite those changes?'))return;
      const targetRecord=await sameRecord(handle);
      if(targetRecord&&targetRecord.id!==doc.fileId&&(Object.values(state.schemaFiles||{}).includes(targetRecord.id)||state.data.some(d=>d.fileId===targetRecord.id)))throw Error('The chosen target is already open as another document. Close it before replacing it.');
      const renaming=doc.kind==='schema'&&handle.name!==doc.name;
      let savedValue=doc.value;
      if(renaming){const copy=C.clone(state.schemas);DocumentTools.renameSchema(copy,doc.name,handle.name);savedValue=copy[handle.name];}
      const text=serialized(savedValue),writer=await handle.createWritable();try{await writer.write(text);await writer.close();}catch(e){await writer.abort().catch(()=>{});throw e;}
      const id=targetRecord?.id||cryptoId();
      if(doc.kind==='schema'){
        if(renaming)change(()=>{DocumentTools.renameSchema(state.schemas,doc.name,handle.name);for(const d of state.data)if(d.schema===doc.name)d.schema=handle.name;state.schemaFiles||={};delete state.schemaFiles[doc.name];state.schemaFiles[handle.name]=id;if(state.activeSchema===doc.name)state.activeSchema=handle.name;});
        else{state.schemaFiles||={};state.schemaFiles[doc.name]=id;}
      }
      else{const d=state.data.find(d=>d.id===doc.id);if(d){d.fileId=id;d.name=handle.name;}}
      await store({id,handle,name:handle.name,kind:doc.kind,schema:doc.schema||null,schemaPinned:record?.schemaPinned||false,lastOpened:Date.now(),diskText:text,savedValue:JSON.stringify(savedValue),namingAccepted:namingKey});
      persist();render();notify('Saved '+handle.name+'.');
    }catch(e){if(e.name!=='AbortError')notify('Save failed: '+e.message);}finally{busySave=false;finishSave();updateFiles();}
  }
  saveButton.onclick=()=>save();$('#file-save').onclick=()=>save();$('#file-save-as').onclick=()=>save(true);
  if(APP_MODE)$('#export').onclick=()=>save(true);
  async function associate(){
    fileMenu.open=false;const d=activeData();if(!d)return;
    const selected=await ask('Choose schema for '+d.name,`<p class="hint">Schema-free JSON allows arbitrary properties. Assigning a schema enables its field editor and validation.</p><select id="assign-schema"><option value="">No schema · free JSON</option>${Object.keys(state.schemas).map(n=>`<option value="${h(n)}" ${d.schema===n?'selected':''}>${h(n)}</option>`).join('')}</select><div class="modal-actions"><button id="assign-apply" class="primary">Apply</button></div>`,done=>{$('#assign-apply').onclick=()=>done($('#assign-schema').value);});
    if(selected===null)return;change(()=>d.schema=selected||null);const r=recordFor(documentForData(d));if(r){r.schema=d.schema;r.schemaPinned=true;await store(r);}if($('#editor').open)showData();
  }
  assoc.onclick=associate;$('#file-associate').onclick=associate;
  $('#file-close').onclick=async()=>{fileMenu.open=false;const doc=current();if(!doc)return;if(dirty(doc)&&!await confirm('Close unsaved file?','Closing this file removes its workspace draft. Save it first if you need those changes.'))return;change(()=>{if(doc.kind==='schema'){delete state.schemas[doc.name];if(state.schemaFiles)delete state.schemaFiles[doc.name];}else{state.data=state.data.filter(d=>d.id!==doc.id);state.activeData=state.data[0]?.id;}});};
  $('#file-kind').onclick=async()=>{
    fileMenu.open=false;const doc=current();if(!doc)return;
    if(!await confirm('Change document kind?',doc.kind==='schema'?'Move this schema to schema-free JSON? Referencing documents will report the missing schema.':'Interpret this JSON document as a schema?'))return;
    try{
      if(doc.kind!=='schema'){assertSchema(doc.value);if(C.own(state.schemas,doc.name))throw Error('A schema with that filename is already open.');}
      change(()=>{if(doc.kind==='schema'){const d={id:cryptoId(),name:doc.name,value:doc.value,schema:null,...(doc.fileId?{fileId:doc.fileId}:{})};state.data.push(d);delete state.schemas[doc.name];if(state.schemaFiles)delete state.schemaFiles[doc.name];state.activeData=d.id;state.mode='data';}else{Object.defineProperty(state.schemas,doc.name,{value:doc.value,writable:true,enumerable:true,configurable:true});state.schemaFiles||={};if(doc.fileId)state.schemaFiles[doc.name]=doc.fileId;state.data=state.data.filter(d=>d.id!==doc.id);state.activeSchema=doc.name;state.mode='schema';}});
      const r=recordFor(doc);if(r){r.kind=doc.kind==='schema'?'data':'schema';r.schema=null;await store(r);}
    }catch(e){notify(e.message);}
  };
  document.addEventListener('keydown',event=>{if(!(event.ctrlKey||event.metaKey)||event.altKey)return;if(event.key.toLowerCase()==='s'){event.preventDefault();save(event.shiftKey);}if(event.key.toLowerCase()==='o'){event.preventDefault();openPicker();}});
  window.addEventListener('beforeunload',event=>{if([...Object.keys(state.schemas).map(documentForSchema),...state.data.map(documentForData)].some(d=>dirty(d)&&(APP_MODE||d.fileId))){event.preventDefault();event.returnValue='';}});
  window.addEventListener('workspace-render',updateFiles);const ready=loadRecords();updateFiles();
  window.WorkspaceFiles={openHandles:enqueue,save,recentOpen,reload,ready};
  if('launchQueue' in window)launchQueue.setConsumer(params=>{if(params.files?.length)enqueue(params.files);});
})();
