/* Buttons are shown only for schema links or resolvable loaded data references. */
function promoteSchemaField(doc,path){
  try{const copy=ReferencePromotion.schemaCopy(state.schemas,doc,path);schemaChange(()=>C.put(state.schemas[doc],path,copy));}
  catch(e){notify('Cannot promote: '+e.message);}
}
function addDataPromotion(container,path,key,description=''){
  const d=activeData(),targets=ReferencePromotion.dataTargets(state.data,d.id,path,{key,description});
  if(!targets.length)return;
  const button=document.createElement('button');button.className='promote-copy secondary';button.textContent='Promote to deep copy';
  button.title='Replace this reference with an independent copy of its target, keeping the same field name.';
  container.append(button);
  button.onclick=()=>{
    const apply=target=>{
      const copy=C.clone(target.value);
      const run=()=>{dataChange(()=>setData(path,copy));notify('Reference replaced with an independent child copy.');};
      if(d.schema){
        const next=C.clone(d.value);if(path)C.put(next,path,copy);
        const before=C.validate(state.schemas,d.schema,state.schemas[d.schema],d.value),after=C.validate(state.schemas,d.schema,state.schemas[d.schema],path?next:copy);
        if(after.some(error=>!before.some(old=>old.path===error.path&&old.message===error.message))){confirmAction('Copy conflicts with the schema','Replacing this reference with an object introduces schema validation issues. The schema will stay as it is. Correct the data or schema afterward, or use Undo to restore the reference.',run);return;}
      }
      run();
    };
    if(targets.length===1){apply(targets[0]);return;}
    openSmall('Choose object to copy','<p class="hint">Several loaded objects match this reference. Choose the source for an independent copy. Its reference field name will be preserved.</p><label for="copy-search">Search matches</label><input id="copy-search"><div id="copy-results" class="picker-results"></div><button id="copy-cancel">Cancel</button>');
    const render=()=>{const q=$('#copy-search').value.toLowerCase(),rows=targets.filter(t=>(t.label+' '+t.doc+' '+t.path).toLowerCase().includes(q));$('#copy-results').innerHTML=rows.map((t,i)=>`<button class="picker-item" data-copy="${i}">${h(t.label)}<small>${h(t.doc)} #${h(t.path||'/')}</small></button>`).join('');$$('[data-copy]').forEach(b=>b.onclick=()=>{const target=rows[+b.dataset.copy];closeSmall();apply(target);});};
    $('#copy-search').oninput=render;$('#copy-cancel').onclick=closeSmall;render();$('#copy-search').focus();
  };
}

function promoteNodeToRoot(node,mode=state.mode){
  const schemaMode=mode==='schema',source=activeData(),path=node.path||'';
  if(!schemaMode&&(!source||source.rawText!==undefined)){notify('Correct the JSON syntax before promoting a node.');return;}
  let value;
  try{value=schemaMode?RootPromotion.schemaRoot(state.schemas,node.doc,path):C.clone(C.at(source.value,path));if(value===undefined)throw Error('This node no longer exists.');}
  catch(e){notify('Cannot promote: '+e.message);return;}
  const matches=schemaMode?[]:RootPromotion.rankSchemas(state.schemas,value),suggested=matches[0];
  const names=new Set([...Object.keys(state.schemas),...state.data.map(d=>d.name)].map(n=>n.toLowerCase()));
  const stem=String(node.name||'untitled').replace(/\.schema\.json$|\.json$/i,'').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').toLowerCase()||'untitled';
  const extension=schemaMode?'.schema.json':'.json';let initial=stem+extension,index=2;while(names.has(initial.toLowerCase()))initial=stem+'-'+(index++)+extension;
  openSmall('Promote to root',`<p class="hint">Create a new ${schemaMode?'schema':'JSON'} file with this node as its root. The original stays in place. Use Save or Download afterward to write the new file to disk.</p><label for="root-filename">New filename</label><input id="root-filename" value="${h(initial)}">${schemaMode?'':`<label for="root-schema">Schema</label><select id="root-schema"><option value="">No schema · free JSON</option>${matches.map((m,i)=>`<option value="${h(m.doc)}" ${i===0?'selected':''}>${h(m.doc)} · ${(m.score*100).toFixed(1)}% match</option>`).join('')}</select><p id="root-match" class="hint"></p><p class="hint">Suggestions require an 80% match. Matching checks field names, values and required fields; it does not guarantee valid data.</p>`}<p id="root-error" class="error-text"></p><div class="modal-actions"><button id="root-cancel">Cancel</button><button id="root-create" class="primary">Create file</button></div>`);
  if(!schemaMode){
    const showMatch=()=>{const match=matches.find(m=>m.doc===$('#root-schema').value);$('#root-match').textContent=match?`${(match.score*100).toFixed(1)}% match · ${match.errors.length?match.errors.length+' validation issue'+(match.errors.length===1?' remains.':'s remain.'):'Data validates against this schema.'}`:suggested?'The new file will use the schema-free editor.':'No loaded schema reaches the 80% threshold. The new file will use the schema-free editor.';};
    $('#root-schema').onchange=showMatch;showMatch();
  }
  $('#root-filename').oninput=()=>$('#root-error').textContent='';
  $('#root-cancel').onclick=closeSmall;
  $('#root-create').onclick=()=>{
    let name=$('#root-filename').value.trim();
    if(!name||/[\\/:*?"<>|]/.test(name)){$('#root-error').textContent='Enter a filename without folder paths or reserved filename characters.';return;}
    if(schemaMode)name=name.replace(/(?:\.schema)?\.json$|\.schema$/i,'')+'.schema.json';else if(!/\.json$/i.test(name))name+='.json';
    if(!schemaMode&&/\.schema\.json$/i.test(name)){$('#root-error').textContent='Use a data filename ending in .json rather than .schema.json.';return;}
    if(names.has(name.toLowerCase())){$('#root-error').textContent='That filename is already open. Choose a different name.';return;}
    const schema=schemaMode?null:$('#root-schema').value||null;let id;
    if(!change(()=>{
      if(schemaMode){Object.defineProperty(state.schemas,name,{value:C.clone(value),enumerable:true,writable:true,configurable:true});state.activeSchema=name;state.mode='schema';}
      else{id=cryptoId();state.data.push({id,name,schema,value:C.clone(value)});state.activeData=id;state.mode='data';if(schema)state.activeSchema=schema;}
    }))return;
    closeSmall();$('#search').value='';render();
    if(schemaMode)openSchema({doc:name,path:''});else openData('');
    notify('Created '+name+'. Save to choose a disk location.');
  };
  $('#root-filename').focus();$('#root-filename').select();
}
