/* Replace untouched legacy browser examples. Linked files and user edits survive. */
async function migrateExamples(){
  if(APP_MODE||state.examplesVersion===2)return;
  const matches=new Set(),keep=new Set(),hashes=window.LEGACY_EXAMPLE_HASHES||{};
  if(crypto.subtle)for(const [name,s]of Object.entries(state.schemas)){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(s))),hash=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(hashes[name]?.includes(hash)&&!state.schemaFiles?.[name]&&!state.data.some(d=>d.schema===name))matches.add(name);else keep.add(name);
  }
  const visit=name=>{if(!state.schemas[name])return;DocumentTools.schemaRefs(state.schemas[name],s=>{try{const doc=C.resolve(state.schemas,name,s.$ref).doc;if(!keep.has(doc)){keep.add(doc);visit(doc);}}catch{}});};
  for(const name of [...keep])visit(name);
  let removed=false;for(const name of matches)if(!keep.has(name)){delete state.schemas[name];removed=true;}
  if(removed){for(const [name,s]of Object.entries(window.DEFAULT_SCHEMAS||{}))if(!C.own(state.schemas,name))state.schemas[name]=C.clone(s);for(const entry of window.DEFAULT_DATA_FILES||[])if(!state.data.some(d=>d.name===entry.name))state.data.push({...C.clone(entry),id:'example:'+entry.name});}
  state.examplesVersion=2;
}
