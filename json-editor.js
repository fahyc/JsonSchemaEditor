/* Schema-free editing deliberately bypasses game-specific property restrictions. */
function showFreeData(){
  const d=activeData();let path=selection.path;
  if(d.rawText!==undefined){
    $('#editor-kicker').textContent='JSON SYNTAX';$('#editor-title').textContent=d.name;$('#editor-path').textContent='Correct the source before saving to disk.';
    $('#editor-body').innerHTML=`<section class="form-section"><textarea class="json-area" id="raw-json-source" spellcheck="false">${h(d.rawText)}</textarea><p id="raw-json-error" class="error-text"></p><button id="raw-json-apply" class="primary">Apply corrected JSON</button></section>`;
    const check=()=>{try{DocumentTools.parse($('#raw-json-source').value);$('#raw-json-error').textContent='';}catch(e){$('#raw-json-error').textContent=e.message;}};
    $('#raw-json-source').oninput=()=>{d.rawText=$('#raw-json-source').value;persist();check();};check();
    $('#raw-json-apply').onclick=()=>{try{const value=DocumentTools.parse($('#raw-json-source').value);dataChange(()=>{d.value=value;delete d.rawText;});}catch(e){$('#raw-json-error').textContent=e.message;}};return;
  }
  if(path&&C.at(d.value,path)===undefined){path='';selection.path='';}
  const value=C.at(d.value,path),container=value!==null&&typeof value==='object';
  $('#editor-kicker').textContent='JSON · NO SCHEMA';$('#editor-title').textContent=path?C.unesc(path.split('/').pop()):'Root';$('#editor-path').textContent=d.name+' #'+(path||'/');
  $('#editor-body').innerHTML=`<section class="form-section"><div class="breadcrumb"><button id="free-root">Root</button>${path?'<button id="free-parent">↑ Parent</button>':''}</div><div class="section-heading"><h3>${Array.isArray(value)?'Array items':container?'Properties':'Root value'}</h3>${container?'<button id="free-add" class="primary">＋ '+(Array.isArray(value)?'Add item':'Add property')+'</button>':''}</div><label class="field-label">${container?'Replace this container’s type':'Value type'}<select id="free-root-type">${freeTypes(C.typeOf(value))}</select></label><div id="free-fields"></div></section>`;
  $('#free-root').onclick=()=>openData('');if($('#free-parent'))$('#free-parent').onclick=()=>openData(path.slice(0,path.lastIndexOf('/')));
  $('#free-root-type').onchange=e=>{const type=e.target.value;confirmAction('Change value type?','This replaces the current value and any contained children. Undo is available.',()=>dataChange(()=>setData(path,DocumentTools.initial(type))));};
  if(container){
    $('#free-add').onclick=()=>{
      if(Array.isArray(value)){dataChange(()=>value.push(null));return;}
      openSmall('Add JSON property','<label for="free-name">Property name (empty names are allowed)</label><input id="free-name"><p id="free-name-error" class="error-text"></p><div class="modal-actions"><button id="free-create" class="primary">Add property</button></div>');
      $('#free-create').onclick=()=>{const name=$('#free-name').value;if(C.own(value,name)){$('#free-name-error').textContent='That property already exists.';return;}closeSmall();dataChange(()=>C.put(d.value,path+'/'+C.esc(name),null));};
    };
  }
  const rows=container?Object.entries(value):[['',value]];
  $('#free-fields').innerHTML=rows.map(([key,v],i)=>`<div class="data-row free-row" data-free="${i}"><div class="data-label">${container&&!Array.isArray(value)?`<input aria-label="Property name" value="${h(key)}">`:h(container?'['+key+']':'Root')}<small>${h(C.typeOf(v))}</small></div><div class="data-control"><select class="free-type" aria-label="Value type">${freeTypes(C.typeOf(v))}</select><div class="free-value"></div></div><div>${container?'<button class="free-remove">Remove</button>':''}${Array.isArray(value)?'<button class="free-up" aria-label="Move item up">↑</button><button class="free-down" aria-label="Move item down">↓</button>':''}</div></div>`).join('');
  $$('#free-fields .free-row').forEach(row=>{
    const i=+row.dataset.free,[key,v]=rows[i],p=container?path+'/'+C.esc(key):path;
    const name=row.querySelector('input[aria-label="Property name"]');if(name)name.onchange=()=>{if(!change(()=>DocumentTools.rename(d.value,path,key,name.value)))name.value=key;showFreeData();};
    row.querySelector('.free-type').onchange=e=>{const type=e.target.value,apply=()=>dataChange(()=>setData(p,DocumentTools.initial(type)));if(v&&typeof v==='object')confirmAction('Replace value?','The container and its children will be replaced. Undo is available.',apply);else apply();};
    const ctl=row.querySelector('.free-value');
    if(v!==null&&typeof v==='object'){const b=document.createElement('button');b.className='child-button';b.textContent=Array.isArray(v)?v.length+' items →':'Edit object →';b.onclick=()=>openData(p);ctl.append(b);}
    else if(v===null)ctl.textContent='null';
    else{
      const input=document.createElement(typeof v==='boolean'?'select':typeof v==='string'?'textarea':'input');input.setAttribute('aria-label',container?key:'Root value');
      if(typeof v==='boolean')input.innerHTML='<option value="true">true</option><option value="false">false</option>';
      if(typeof v==='number'){input.type='number';input.step='any';}input.value=String(v);
      input.onchange=()=>{let next=input.value;if(typeof v==='boolean')next=next==='true';if(typeof v==='number'){if(next.trim()===''||!Number.isFinite(Number(next))){notify('Enter a finite number.');input.value=v;return;}next=Number(next);}dataChange(()=>setData(p,next));};ctl.append(input);
    }
    if(container)row.querySelector('.free-remove').onclick=()=>dataChange(()=>C.remove(d.value,p));
    if(Array.isArray(value)){
      const up=row.querySelector('.free-up'),down=row.querySelector('.free-down');up.disabled=i===0;down.disabled=i===value.length-1;
      up.onclick=()=>dataChange(()=>{[value[i-1],value[i]]=[value[i],value[i-1]];});down.onclick=()=>dataChange(()=>{[value[i+1],value[i]]=[value[i],value[i+1]];});
    }
  });
}
function freeTypes(type){return ['object','array','string','number','boolean','null'].map(t=>`<option value="${t}" ${t===type?'selected':''}>${t}</option>`).join('');}
function newFreeData(){
  askName('New JSON file','untitled.json',name=>{change(()=>{const d={id:cryptoId(),name:name.endsWith('.json')?name:name+'.json',schema:null,value:{}};state.data.push(d);state.activeData=d.id;state.mode='data';});setTimeout(()=>openData(''),0);});
}
