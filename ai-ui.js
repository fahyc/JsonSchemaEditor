/* Shares the editor's workspace helpers; generation settings stay in memory. */
(()=>{
  const button=document.createElement('button');button.id='ai-open';button.textContent='✦ Generate with AI';$('#json-view').before(button);
  const dialog=document.createElement('dialog');dialog.id='ai-dialog';dialog.setAttribute('aria-labelledby','ai-title');
  dialog.innerHTML=`<div class="modal-head"><h2 id="ai-title">Generate data with OpenAI</h2><button id="ai-close" aria-label="Close AI generator">×</button></div>
    <p class="hint">Your prompt, selected data files, target schema and its dependencies are sent to OpenAI when you generate. API usage is billed to your account.</p>
    <form id="ai-form"><fieldset id="ai-settings"><div class="form-grid">
    <label>API key<input id="ai-key" type="password" autocomplete="off" required placeholder="sk-…"></label>
    <label>Model<input id="ai-model" required placeholder="Enter an OpenAI model ID"></label></div>
    <p class="hint">Key kept only in this page’s memory until reload. Use this direct-browser prototype on a trusted computer. A shared production deployment should use a backend for credentials.</p>
    <label class="field-label">Required schema<select id="ai-schema" required></select></label>
    <h3>Reference data files</h3><p class="hint">Only checked files are sent, without their schemas.</p><div id="ai-files"></div>
    <label class="field-label">Prompt<textarea id="ai-prompt" rows="6" required placeholder="Describe the new game data you want to create…"></textarea></label>
    <details><summary>Preview outgoing prompt</summary><pre id="ai-preview"></pre></details></fieldset>
    <p id="ai-status" role="status"></p><div id="ai-result" hidden><h3>Generated draft needs corrections</h3><pre id="ai-errors"></pre><details><summary>Generated JSON</summary><pre id="ai-json"></pre></details><button type="button" id="ai-draft">Open draft in editor</button></div>
    <div class="modal-actions"><button type="button" id="ai-cancel" hidden>Cancel generation</button><button type="submit" class="primary" id="ai-generate">Generate data</button></div></form>`;
  document.body.append(dialog);
  let controller=null,draft=null;
  const status=message=>$('#ai-status').textContent=message;
  function build(){return SchemaAI.prompt(state.schemas,$('#ai-schema').value,state.data.filter(d=>[...dialog.querySelectorAll('[data-context]:checked')].some(c=>c.dataset.context===d.id)),$('#ai-prompt').value);}
  function preview(){try{$('#ai-preview').textContent=build();}catch(e){$('#ai-preview').textContent=e.message;}}
  function busy(value){$('#ai-settings').disabled=value;$('#ai-generate').disabled=value;$('#ai-cancel').hidden=!value;}
  function close(){controller?.abort();dialog.close();}
  function install(result){
    if(!C.equal(result.schemas,state.schemas)){status('Schemas changed during generation. Generate again using the current schemas.');return;}
    let base=result.schema.replace(/\.schema\.json$|\.json$/i,'')+'-generated',name=base+'.json',i=2;while(state.data.some(d=>d.name===name))name=base+'-'+(i++)+'.json';
    if(change(()=>{const d={id:cryptoId(),name,schema:result.schema,value:result.value};state.data.push(d);state.activeData=d.id;state.activeSchema=d.schema;state.mode='data';})){
      $('#search').value='';render();dialog.close();notify(result.errors.length?'Draft opened. Fix the validation issues before export.':'Generated data validated and added to your workspace.');
    }
  }
  button.onclick=()=>{
    if(!Object.keys(state.schemas).length){notify('Create or import a schema first.');return;}
    const checked=new Set([...dialog.querySelectorAll('[data-context]:checked')].map(c=>c.dataset.context));
    $('#ai-schema').innerHTML=Object.keys(state.schemas).map(n=>`<option value="${h(n)}" ${n===state.activeSchema?'selected':''}>${h(n)}</option>`).join('');
    $('#ai-files').innerHTML=state.data.length?state.data.map(d=>`<label class="ai-file"><input type="checkbox" data-context="${h(d.id)}" ${checked.has(d.id)?'checked':''}>${h(d.name)}</label>`).join(''):'<p class="hint">No data files are open.</p>';
    $('#ai-result').hidden=true;draft=null;status('');preview();dialog.showModal();
  };
  $('#ai-close').onclick=close;dialog.addEventListener('cancel',()=>controller?.abort());$('#ai-cancel').onclick=()=>controller?.abort();
  $('#ai-settings').addEventListener('input',preview);$('#ai-settings').addEventListener('change',preview);
  $('#ai-draft').onclick=()=>draft&&install(draft);
  $('#ai-form').onsubmit=async event=>{
    event.preventDefault();if(controller)return;
    $('#ai-result').hidden=true;draft=null;
    try{
      const prompt=build(),schema=$('#ai-schema').value,schemas=C.clone(state.schemas);controller=new AbortController();busy(true);status('Generating… You can cancel while waiting.');
      const value=await SchemaAI.generate({key:$('#ai-key').value,model:$('#ai-model').value,prompt,signal:controller.signal});
      if(controller.signal.aborted)return;
      const errors=C.validate(schemas,schema,schemas[schema],value);draft={value,schema,schemas,errors};
      if(!errors.length)install(draft);
      else{status('Generated JSON has '+errors.length+' validation issue(s). Adjust the prompt and generate again, or open this draft to correct it.');$('#ai-errors').textContent=errors.map(e=>(e.path||'/')+': '+e.message).join('\n');$('#ai-json').textContent=JSON.stringify(value,null,2);$('#ai-result').hidden=false;}
    }catch(e){status(e.name==='AbortError'?'Generation cancelled.':e.message.replaceAll($('#ai-key').value||'\0','[redacted]'));}
    finally{controller=null;busy(false);}
  };
})();
