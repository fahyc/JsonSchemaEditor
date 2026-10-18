/* Shares the editor's workspace helpers; generation settings stay in memory. */
(()=>{
  const button=document.createElement('button');button.id='ai-open';button.textContent='✦ Generate with AI';$('#json-view').before(button);
  const dialog=document.createElement('dialog');dialog.id='ai-dialog';dialog.setAttribute('aria-labelledby','ai-title');
  dialog.innerHTML=`<div class="modal-head"><h2 id="ai-title">Generate data with OpenAI</h2><button id="ai-close" aria-label="Close AI generator">×</button></div>
    <p class="hint">Your prompt, selected data files, target schema and its dependencies are sent to OpenAI when you generate. API usage is billed to your account.</p>
    <form id="ai-form"><fieldset id="ai-settings"><div class="form-grid">
    <label>API key<input id="ai-key" type="password" autocomplete="off" required placeholder="sk-…"></label>
    <label>Model<select id="ai-model" required><option value="">Load models using your API key</option><option value="__custom">Enter model ID manually…</option></select></label></div>
    <div class="inline-actions"><button type="button" id="ai-load-models">Load / refresh text models</button><span id="ai-model-status" class="hint"></span></div>
    <label class="field-label" id="ai-custom-label" hidden>Custom model ID<input id="ai-custom-model" placeholder="OpenAI model ID"></label>
    <p class="hint">The list filters known text-model families by name, excluding image, audio, embedding and specialized search models. API and JSON-mode support vary by model. Manual entry is available for models the filter misses.</p>
    <p class="hint">Key kept only in this page’s memory until reload. Use this direct-browser prototype on a trusted computer. A shared production deployment should use a backend for credentials.</p>
    <label class="field-label">Required schema<select id="ai-schema" required></select></label>
    <h3>Generation options</h3><div class="ai-options">
    <label class="field-label">Thinking effort<select id="ai-effort"><option value="">Model default</option>${['none','minimal','low','medium','high','xhigh','max'].map(v=>`<option>${v}</option>`).join('')}</select></label>
    <label class="field-label">Text verbosity<select id="ai-verbosity"><option value="">Model default</option><option>low</option><option>medium</option><option>high</option></select></label>
    <label class="field-label">Maximum output tokens<input id="ai-max-tokens" type="number" min="1" step="1" placeholder="Model default"></label></div>
    <p class="hint">Token limit includes thinking and output. Supported effort levels and verbosity vary by model; leave Model default if an option is rejected.</p>
    <h3>Reference data files</h3><p class="hint">Only checked files are sent, without their schemas.</p><div id="ai-files"></div>
    <label class="field-label">Prompt<textarea id="ai-prompt" rows="6" required placeholder="Describe the JSON data you want to create…"></textarea></label>
    <details><summary>Preview outgoing prompt</summary><pre id="ai-preview"></pre></details></fieldset>
    <p id="ai-status" role="status"></p><details id="ai-history" hidden><summary>API response history</summary><p class="hint">Full response bodies and available HTTP headers, kept until reload or cleared. API keys are redacted. A network failure or cancellation may have no response body.</p><label class="field-label">Attempt<select id="ai-attempt"></select></label><pre id="ai-raw"></pre><div class="inline-actions"><button type="button" id="ai-download-response">Download response dump</button><button type="button" id="ai-clear-history">Clear history</button></div></details><div id="ai-result" hidden><h3>Generated draft needs corrections</h3><pre id="ai-errors"></pre><details><summary>Generated JSON</summary><pre id="ai-json"></pre></details><button type="button" id="ai-draft">Open draft in editor</button></div>
    <div class="modal-actions"><button type="button" id="ai-cancel" hidden>Cancel generation</button><button type="submit" class="primary" id="ai-generate">Generate data</button></div></form>`;
  document.body.append(dialog);
  let controller=null,draft=null,history=[];
  const model=()=>$('#ai-model').value==='__custom'?$('#ai-custom-model').value.trim():$('#ai-model').value;
  const options=()=>({effort:$('#ai-effort').value,verbosity:$('#ai-verbosity').value,maxOutputTokens:$('#ai-max-tokens').value});
  function showResponse(){const entry=history[+$('#ai-attempt').value];$('#ai-raw').textContent=entry?JSON.stringify(entry,null,2):'';}
  function recordResponse(entry){history.push(entry);$('#ai-history').hidden=false;$('#ai-attempt').innerHTML=history.map((r,i)=>`<option value="${i}">${i+1}. ${h(r.endpoint)} · ${h(r.time)} · ${r.httpStatus??'no HTTP response'}</option>`).join('');$('#ai-attempt').value=String(history.length-1);showResponse();}
  function failure(error,recorded){
    const message=error.name==='AbortError'?'Request cancelled.':error.message.replaceAll($('#ai-key').value.trim()||'\0','[redacted API key]');
    status(message);
    if(!recorded)recordResponse({time:new Date().toISOString(),endpoint:'local preparation',httpStatus:null,responseText:null,error:message});
    else{history[history.length-1].error=message;showResponse();}
    $('#ai-history').open=true;$('#ai-history').scrollIntoView({block:'nearest'});
  }
  const status=message=>$('#ai-status').textContent=message;
  function build(){return SchemaAI.prompt(state.schemas,$('#ai-schema').value,state.data.filter(d=>[...dialog.querySelectorAll('[data-context]:checked')].some(c=>c.dataset.context===d.id)),$('#ai-prompt').value);}
  function preview(){try{$('#ai-preview').textContent=build();}catch(e){$('#ai-preview').textContent=e.message;}}
  function busy(value){$('#ai-settings').disabled=value;$('#ai-generate').disabled=value;$('#ai-cancel').hidden=!value;}
  function close(){controller?.abort();dialog.close();}
  function install(result){
    if(!C.equal(result.schemas,state.schemas)){status('Schemas changed during generation. Generate again using the current schemas.');return;}
    let base=result.schema.replace(/\.schema\.json$|\.json$/i,'')+'.generated',name=base+'.json',i=2;while(state.data.some(d=>d.name===name))name=base+'-'+(i++)+'.json';
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
  $('#ai-attempt').onchange=showResponse;
  $('#ai-download-response').onclick=()=>download('openai-response-'+(Number($('#ai-attempt').value)+1)+'.json',history[+$('#ai-attempt').value]);
  $('#ai-clear-history').onclick=()=>{history=[];$('#ai-history').hidden=true;$('#ai-attempt').innerHTML='';$('#ai-raw').textContent='';};
  $('#ai-model').onchange=()=>{const custom=$('#ai-model').value==='__custom';$('#ai-custom-label').hidden=!custom;$('#ai-custom-model').required=custom;};
  $('#ai-load-models').onclick=async()=>{
    if(controller)return;let recorded=false;
    try{
      controller=new AbortController();busy(true);status('Loading text models…');const selected=model();
      const models=await SchemaAI.listModels({key:$('#ai-key').value,signal:controller.signal,onResponse:r=>{recorded=true;recordResponse(r);}});
      $('#ai-model').innerHTML='<option value="">Choose a text model</option>'+models.map(id=>`<option value="${h(id)}">${h(id)}</option>`).join('')+'<option value="__custom">Enter model ID manually…</option>';
      $('#ai-model').value=models.includes(selected)?selected:selected?'__custom':'';
      if(selected&&!models.includes(selected))$('#ai-custom-model').value=selected;
      $('#ai-model').onchange();$('#ai-model-status').textContent=models.length+' text models available';status(models.length?'Models loaded. Choose a model to generate.':'No matching models found. You can enter a model ID manually.');
    }catch(e){failure(e,recorded);}finally{controller=null;busy(false);}
  };
  $('#ai-settings').addEventListener('input',preview);$('#ai-settings').addEventListener('change',preview);
  $('#ai-draft').onclick=()=>draft&&install(draft);
  $('#ai-form').onsubmit=async event=>{
    event.preventDefault();if(controller)return;
    $('#ai-result').hidden=true;draft=null;let recorded=false;
    try{
      const prompt=build(),schema=$('#ai-schema').value,schemas=C.clone(state.schemas);controller=new AbortController();busy(true);status('Generating… You can cancel while waiting.');
      const value=await SchemaAI.generate({key:$('#ai-key').value,model:model(),options:options(),prompt,signal:controller.signal,onResponse:r=>{recorded=true;recordResponse(r);}});
      if(controller.signal.aborted)return;
      const errors=C.validate(schemas,schema,schemas[schema],value);draft={value,schema,schemas,errors};
      if(!errors.length)install(draft);
      else{status('Generated JSON has '+errors.length+' validation issue(s). Adjust the prompt and generate again, or open this draft to correct it.');history[history.length-1].validationErrors=errors;showResponse();$('#ai-history').open=true;$('#ai-errors').textContent=errors.map(e=>(e.path||'/')+': '+e.message).join('\n');$('#ai-json').textContent=JSON.stringify(value,null,2);$('#ai-result').hidden=false;}
    }catch(e){failure(e,recorded);}
    finally{controller=null;busy(false);}
  };
})();
