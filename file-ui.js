/* Local file handles are kept in IndexedDB; undo/workspace JSON stores IDs only. */
(()=>{
  'use strict';
  const records=new Map();let dbPromise,busySave=false,openQueue=Promise.resolve();
  const keyCurrent=()=>state.mode==='schema'?'schema:'+state.activeSchema:'data:'+state.activeData;
  const current=()=>state.mode==='schema'?(C.own(state.schemas,state.activeSchema)?{key:keyCurrent(),name:state.activeSchema,value:state.schemas[state.activeSchema],kind:'schema',fileId:state.schemaFiles?.[state.activeSchema]}:null):activeData()?{...activeData(),key:keyCurrent(),kind:'data'}:null;
  function db(){return dbPromise||=(new Promise((resolve,reject)=>{const r=indexedDB.open('schema-dock-files',1);r.onupgradeneeded=()=>r.result.createObjectStore('recent',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}));}
  async function store(record){records.set(record.id,record);try{const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction('recent','readwrite');tx.objectStore('recent').put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}catch{notify('Recent-file storage unavailable. Your file can still be saved.');}}
  async function loadRecords(){try{const database=await db();const list=await new Promise((resolve,reject)=>{const r=database.transaction('recent').objectStore('recent').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});for(const r of list)records.set(r.id,r);}catch{}updateFiles();}
  function recordFor(doc){return doc?.fileId?records.get(doc.fileId):null;}
  function serialized(value){return JSON.stringify(value,null,2)+'\n';}
  function dirty(doc){if(!doc)return false;const r=recordFor(doc);return !r||doc.rawText!==undefined||JSON.stringify(doc.value)!==r.savedValue;}
  function documentForSchema(name){return {key:'schema:'+name,name,kind:'schema',value:state.schemas[name],fileId:state.schemaFiles?.[name]};}
  function documentForData(d){return {...d,key:'data:'+d.id,kind:'data'};}
  const fileMenu=document.createElement('details');fileMenu.id='file-menu';
  fileMenu.innerHTML=`<summary>File</summary><div class="file-menu-panel"><button id="file-open">Open JSON… <small>Ctrl+O</small></button><button id="file-new">New JSON file</button><button id="file-save">Save <small>Ctrl+S</small></button><button id="file-save-as">Save As… <small>Ctrl+Shift+S</small></button><button id="file-associate">Choose / remove schema…</button><button id="file-kind">Change document kind…</button><button id="file-close">Close current file</button>${APP_MODE?'<label for="recent-files">Recent files</label><select id="recent-files"><option value="">Open recent file…</option></select><button id="clear-recents">Clear recent list</button>':''}</div>`;
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
    const doc=current();saveButton.disabled=busySave||!doc;saveButton.textContent=busySave?'Saving…':'Save';$('#file-save').disabled=busySave||!doc;$('#file-save-as').disabled=busySave||!doc;$('#file-close').disabled=busySave||!doc;$('#file-kind').disabled=busySave||!doc;
    if(APP_MODE){$('#export').textContent='↓ Export…';$('#export').disabled=busySave||!doc;$('#export').title='Choose a destination. Future Ctrl+S saves to the exported file.';}
    $('#file-associate').disabled=state.mode!=='data'||!activeData()||activeData().rawText!==undefined;assoc.hidden=state.mode!=='data'||!activeData();assoc.textContent=activeData()?.schema?'Change schema':'Choose schema';
    const r=recordFor(doc);$('#save-state').textContent=doc?(dirty(doc)?'● Unsaved file · draft in this '+(APP_MODE?'app':'browser'):r?'✓ Saved to '+r.name:'Draft in this browser'):(APP_MODE?'Installed workspace':'Browser workspace');
    if(window.workspaceStorageError)$('#save-state').textContent='Draft storage unavailable · save to a file';
    document.title=(doc?(dirty(doc)?'● ':'')+doc.name+' · ':'')+'Schema Dock';
    if(APP_MODE){const sel=$('#recent-files'),old=sel.value;sel.innerHTML='<option value="">Open recent file…</option>'+[...records.values()].filter(r=>!r.hideRecent).sort((a,b)=>b.lastOpened-a.lastOpened).map(r=>`<option value="${h(r.id)}">${h(r.name)} · ${r.kind==='schema'?'schema':r.schema?'data':'JSON'}</option>`).join('');if(records.has(old))sel.value=old;}
  }
  function mark(button,doc){button.classList.toggle('file-dirty',dirty(doc));if(dirty(doc)){const dot=document.createElement('span');dot.className='dirty-dot';dot.textContent='●';dot.title='Changes not saved to a file';button.append(dot);}}
  function activateData(id){state.activeData=id;state.mode='data';const d=activeData();if(d?.schema)state.activeSchema=d.schema;$('#search').value='';persist();render();}
  function activateSchema(name){state.activeSchema=name;state.mode='schema';$('#search').value='';persist();render();}
  function ask(title,html,setup){return new Promise(resolve=>{openSmall(title,html);let answered=false;const finish=v=>{if(answered)return;answered=true;$('#small-dialog').removeEventListener('close',cancel);closeSmall();resolve(v);};const cancel=()=>{if($('#small-dialog').open)return;if(!answered){answered=true;$('#small-dialog').removeEventListener('close',cancel);resolve(null);}};$('#small-dialog').addEventListener('close',cancel);setup(finish);});}
  function confirm(title,message){return ask(title,`<p class="warning">${h(message)}</p><div class="modal-actions"><button id="file-no">Cancel</button><button id="file-yes" class="primary">Continue</button></div>`,done=>{$('#file-no').onclick=()=>done(false);$('#file-yes').onclick=()=>done(true);});}
  async function sameRecord(handle){if(typeof handle.getFile!=='function')return null;for(const r of records.values())try{if(await handle.isSameEntry(r.handle))return r;}catch{}return null;}
  async function readEntry(input){const handle=typeof input.getFile==='function'?input:null,file=handle?await handle.getFile():input,text=await file.text();let value,error;try{value=DocumentTools.parse(text);}catch(e){error=e.message;value=null;}return {handle,name:file.name,text,value,error,record:handle?await sameRecord(handle):null,kind:error?'json':DocumentTools.classify(file.name,value)};}
  function enqueue(inputs){openQueue=openQueue.then(()=>ready).then(()=>openBatch(inputs)).catch(e=>notify('Open failed: '+e.message));return openQueue;}
  async function openBatch(inputs){
    const entries=[];for(const input of inputs){try{entries.push(await readEntry(input));}catch(e){notify('Could not read '+(input.name||'file')+': '+e.message);}}
    if(!entries.length)return;
    const ambiguous=entries.filter(e=>e.kind==='ambiguous');
    if(ambiguous.length){const choice=await ask('Choose document kinds',`<p class="hint">These documents contain schema-like fields. Choose how to open them.</p>${ambiguous.map((e,i)=>`<label class="field-label">${h(e.name)}<select data-kind="${i}"><option value="json">JSON data</option><option value="schema">JSON Schema</option></select></label>`).join('')}<div class="modal-actions"><button id="kinds-open" class="primary">Open files</button></div>`,done=>{$('#kinds-open').onclick=()=>done($$('[data-kind]').map(s=>s.value));});if(!choice)return;ambiguous.forEach((e,i)=>e.kind=choice[i]);}
    // Schemas are registered first so data in the same launch can bind to them.
    let active=null;
    for(const e of [...entries.filter(e=>e.kind==='schema'),...entries.filter(e=>e.kind!=='schema')]){
      if(e.record){
        const existing=Object.keys(state.schemaFiles||{}).find(n=>state.schemaFiles[n]===e.record.id),data=state.data.find(d=>d.fileId===e.record.id);
        if(existing||data){active=existing?{schema:existing}:{data:data.id};continue;}
      }
      if(e.kind==='schema'){
        try{assertSchema(e.value);}catch(error){e.error='Invalid schema: '+error.message;e.kind='json';}
      }
      if(e.kind==='schema'&&C.own(state.schemas,e.name)){
        if(!await confirm('Replace loaded schema?',e.name+' is already open. Replacing it discards its current workspace value. Undo is available.'))continue;
      }
      const id=e.record?.id||cryptoId(),schema=e.kind==='schema'?null:e.record?.schema||(()=>{const matches=DocumentTools.matchingSchemas(state.schemas,e.value);return matches.length===1?matches[0]:null;})();
      if(e.kind==='schema'){
        change(()=>{Object.defineProperty(state.schemas,e.name,{value:e.value,writable:true,enumerable:true,configurable:true});state.schemaFiles||={};if(e.handle)state.schemaFiles[e.name]=id;else delete state.schemaFiles[e.name];state.activeSchema=e.name;state.mode='schema';});active={schema:e.name};
      }else{
        const d={id:cryptoId(),name:e.name,schema:e.error?null:schema,value:e.value,...(e.error?{rawText:e.text}:{}),...(e.handle?{fileId:id}:{})};
        change(()=>{state.data.push(d);state.activeData=d.id;state.mode='data';});active={data:d.id};if(e.error)notify(e.name+': '+e.error+'. Open the node to correct the JSON.');
      }
      if(e.handle)await store({id,handle:e.handle,name:e.name,kind:e.kind==='schema'?'schema':'data',schema,lastOpened:Date.now(),diskText:e.text,savedValue:JSON.stringify(e.value)});
    }
    if(active?.schema)activateSchema(active.schema);else if(active?.data)activateData(active.data);persist();updateFiles();
  }
  async function recentOpen(id){
    const record=records.get(id);if(!record)return;
    try{
      const opts={mode:'read'};if(await record.handle.queryPermission(opts)!=='granted'&&await record.handle.requestPermission(opts)!=='granted')throw Error('Read permission was not granted.');
      const dependencies=[],seen=new Set();
      async function collect(r){if(!r||seen.has(r.id))return;seen.add(r.id);if(r.schema&&!C.own(state.schemas,r.schema))await collect([...records.values()].find(x=>x.kind==='schema'&&x.name===r.schema));
        if(r.kind==='schema'){try{const v=DocumentTools.parse(await (await r.handle.getFile()).text());const names=[];DocumentTools.schemaRefs(v,s=>{if(!s.$ref.startsWith('#'))names.push(s.$ref.split('#')[0].split('/').pop());});for(const name of names)if(!C.own(state.schemas,name))await collect([...records.values()].find(x=>x.kind==='schema'&&x.name===name));}catch{}}
        dependencies.push(r.handle);
      }
      await collect(record);await enqueue(dependencies);
      record.lastOpened=Date.now();await store(record);updateFiles();
    }catch(e){notify('Could not reopen '+record.name+': '+e.message+'. Use Open JSON to locate it again.');}
  }
  if(APP_MODE){$('#recent-files').onchange=async e=>{const id=e.target.value;e.target.value='';fileMenu.open=false;if(id)await recentOpen(id);};$('#clear-recents').onclick=async()=>{for(const r of records.values()){r.hideRecent=true;await store(r);}updateFiles();notify('Recent list cleared. Open files retained.');};}
  async function save(as=false){
    fileMenu.open=false;if(busySave)return;
    if($('#ai-dialog')?.open){notify('Close the AI generator before saving a file.');return;}
    if($('#small-dialog').open&&!$('#json-edit')){notify('Finish the current dialog before saving the file.');return;}
    // Apply an open source editor before capturing a document for disk saving.
    if($('#small-dialog').open&&$('#json-edit')){$('#json-apply').click();if($('#small-dialog').open)return;}
    if($('#editor').open&&$('#raw-json-source')){$('#raw-json-apply').click();if(activeData()?.rawText!==undefined)return;}
    if($('#editor').open){const el=document.activeElement;if(el&&['INPUT','TEXTAREA','SELECT'].includes(el.tagName)){el.blur();}}
    let doc=current();if(!doc)return;
    if(doc.rawText!==undefined){notify('Fix JSON syntax before saving.');openData('');return;}
    busySave=true;updateFiles();
    try{
      let errors=[];try{errors=state.mode==='schema'?schemaIssues().filter(e=>e.path.startsWith(doc.name+'#')):doc.schema?errorsNow():[];}catch(e){errors=[{message:e.message}];}
      if(errors.length&&!await confirm('Save with schema validation issues?',errors.length+' validation issue(s) remain. This JSON may not work in the game or other software. Save it anyway?'))return;
      const record=recordFor(doc);let handle=as?null:record?.handle;
      if(!handle){
        if(!window.showSaveFilePicker){download(doc.name,doc.value);notify('Browser does not support saving in place. Downloaded a copy.');return;}
        handle=await showSaveFilePicker({suggestedName:doc.name,types:[{description:'JSON',accept:{'application/json':['.json']}}]});
      }
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
      await store({id,handle,name:handle.name,kind:doc.kind,schema:doc.schema||null,lastOpened:Date.now(),diskText:text,savedValue:JSON.stringify(savedValue)});
      persist();render();notify('Saved '+handle.name+'.');
    }catch(e){if(e.name!=='AbortError')notify('Save failed: '+e.message);}finally{busySave=false;updateFiles();}
  }
  saveButton.onclick=()=>save();$('#file-save').onclick=()=>save();$('#file-save-as').onclick=()=>save(true);
  if(APP_MODE)$('#export').onclick=()=>save(true);
  async function associate(){
    fileMenu.open=false;const d=activeData();if(!d)return;
    const selected=await ask('Choose schema for '+d.name,`<p class="hint">Schema-free JSON allows arbitrary properties. Assigning a schema enables its field editor and validation.</p><select id="assign-schema"><option value="">No schema · free JSON</option>${Object.keys(state.schemas).map(n=>`<option value="${h(n)}" ${d.schema===n?'selected':''}>${h(n)}</option>`).join('')}</select><div class="modal-actions"><button id="assign-apply" class="primary">Apply</button></div>`,done=>{$('#assign-apply').onclick=()=>done($('#assign-schema').value);});
    if(selected===null)return;change(()=>d.schema=selected||null);const r=recordFor(documentForData(d));if(r){r.schema=d.schema;await store(r);}if($('#editor').open)showData();
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
  window.WorkspaceFiles={openHandles:enqueue,save,recentOpen,ready};
  if('launchQueue' in window)launchQueue.setConsumer(params=>{if(params.files?.length)enqueue(params.files);});
})();
