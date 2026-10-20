/* Reversible edit plans, independent of the UI. */
(function(root){
  const C=typeof module!=='undefined'?require('./core.js'):root.SchemaCore;
  const maps=['properties','$defs','definitions','patternProperties'];
  const lists=['oneOf','anyOf','allOf','prefixItems'];
  const singles=['items','additionalProperties','propertyNames','if','then','else','not','contains'];
  const within=(p,base)=>p===base||p.startsWith(base+'/');
  function walk(s,visit,p=''){visit(s,p);if(!s||typeof s!=='object')return;for(const k of maps)for(const [n,v]of Object.entries(s[k]||{}))walk(v,visit,p+'/'+k+'/'+C.esc(n));for(const k of lists)(s[k]||[]).forEach((v,i)=>walk(v,visit,p+'/'+k+'/'+i));for(const k of singles)if(s[k]!==undefined)walk(s[k],visit,p+'/'+k);}
  function boundary(p){if(!p)return '';const parts=p.split('/').slice(1);for(let i=parts.length-2;i>=0;i--){if(maps.includes(parts[i])||lists.includes(parts[i]))return '/'+parts.slice(0,i+2).join('/');}return p;}
  function planSchemaDelete(reg,doc,path){
    const removals=new Map(Object.keys(reg).map(k=>[k,new Set()]));removals.get(doc).add(boundary(path));
    const refs=[];for(const [d,s]of Object.entries(reg))walk(s,(v,p)=>{if(v?.$ref){try{refs.push({doc:d,path:p,...{target:C.resolve(reg,d,v.$ref)}});}catch{}}});
    const removed=(d,p)=>[...(removals.get(d)||[])].some(base=>within(p,base));
    let changed=true;while(changed){changed=false;for(const r of refs)if(!removed(r.doc,r.path)&&removed(r.target.doc,r.target.path)){removals.get(r.doc).add(boundary(r.path));changed=true;}}
    const incoming=refs.filter(r=>!within(r.path,r.doc===doc?boundary(path):'\u0000')&&removed(r.doc,r.path)&&removed(r.target.doc,r.target.path));
    const next={},locations=new Map(),pending=[];
    function rebuild(s,d,oldPath,newPath){if(removed(d,oldPath))return undefined;locations.set(d+'#'+oldPath,newPath);if(!s||typeof s!=='object')return s;const out=C.clone(s);if(s.$ref)pending.push({out,doc:d,oldPath});
      const deletedFields=[];
      for(const k of maps)if(s[k]){out[k]={};for(const [n,v]of Object.entries(s[k])){const p='/'+k+'/'+C.esc(n),item=rebuild(v,d,oldPath+p,newPath+p);if(item===undefined){if(k==='properties')deletedFields.push(n);}else Object.defineProperty(out[k],n,{value:item,enumerable:true,writable:true,configurable:true});}}
      for(const k of lists)if(s[k]){out[k]=[];for(let i=0;i<s[k].length;i++){const v=rebuild(s[k][i],d,oldPath+'/'+k+'/'+i,newPath+'/'+k+'/'+out[k].length);if(v!==undefined)out[k].push(v);}if(!out[k].length){delete out[k];if(k==='oneOf'||k==='anyOf')out.not={};}}
      for(const k of singles)if(s[k]!==undefined){const v=rebuild(s[k],d,oldPath+'/'+k,newPath+'/'+k);if(v!==undefined)out[k]=v;else if(k==='items'||k==='additionalProperties')out[k]=false;else delete out[k];}
      const cleanRequired=(v,isRoot=false)=>{if(!v||typeof v!=='object')return;const names=deletedFields.filter(n=>isRoot||!C.own(v.properties,n));if(v.required)v.required=v.required.filter(n=>!names.includes(n));for(const k of ['allOf','oneOf','anyOf'])for(const branch of v[k]||[])cleanRequired(branch);for(const k of ['if','then','else','not'])cleanRequired(v[k]);};if(deletedFields.length)cleanRequired(out,true);
      return out;
    }
    for(const [d,s]of Object.entries(reg)){const value=rebuild(s,d,'','');if(value!==undefined)next[d]=value;}
    for(const p of pending){try{const target=C.resolve(reg,p.doc,p.out.$ref),nextPath=locations.get(target.key);if(nextPath!==undefined&&nextPath!==target.path)p.out.$ref=(target.doc===p.doc?'':target.doc)+'#'+nextPath;}catch{}}
    return {schemas:next,references:incoming.map(r=>({doc:r.doc,path:r.path})),removedPaths:[...removals].flatMap(([d,ps])=>[...ps].map(p=>({doc:d,path:p}))),containment:!path||path.startsWith('/$defs/')||path.startsWith('/definitions/')?0:1};
  }
  function arrayField(f,enabled){if(enabled){if(f.type==='array')return C.clone(f);const item=C.clone(f),out={type:'array',items:item};for(const k of ['description','title'])if(C.own(item,k)){out[k]=item[k];delete item[k];}return out;}if(f.type!=='array')return C.clone(f);const out=C.clone(f.items??{});if(!out||typeof out!=='object')return out;for(const k of ['description','title'])if(C.own(f,k))out[k]=f[k];return out;}
  function replaceFieldType(field,item){if(field.type==='array')return {...C.clone(field),items:C.clone(item)};return {...C.clone(item),...(C.own(field,'description')?{description:field.description}:{})};}
  function referenceHint(key,parent={},s={}){let target=key.replace(/Refs?$/i,'').toLowerCase();const map={speaker:'contact',entrycontacts:'contact',controller:'faction',minor:'faction',civilian:'faction',faction:'faction',cargo:'cargo',snippet:'storysnippet',system:'system',location:'location',deck:'deck',ship:'ship',contact:'contact',target:(parent.targetType||'').toLowerCase(),outcome:'outcome'};
    const recognized=/Refs?$|^entryContacts$|^location$|^outcome$/i.test(key)||/\b(ID|IDs|reference|references)\b/i.test(s.description||'');
    return {recognized,target:map[target]||'',field:/name.*(?:used by|relationship)|name of the faction/i.test(s.description||'')?'name':target==='system'?'address':target==='outcome'?'outcome':'id'};
  }
  function dataDeletePlan(state,dataId,path){
    const source=state.data.find(d=>d.id===dataId);if(!source)throw Error('The document no longer exists.');
    const docs=state.data.filter(d=>d.rawText===undefined),graphs=new Map(),identities=[];
    for(const d of docs){
      const nodes=C.dataNodes(state.schemas,d.schema,state.schemas[d.schema]||{},d.value).nodes;graphs.set(d.id,nodes);
      for(const n of nodes)if(!Array.isArray(n.value))for(const field of ['id','name','address']){
        const value=n.value[field];if(!['string','number'].includes(typeof value)||value==='')continue;
        identities.push({dataId:d.id,path:n.path,field,value,type:(n.schema?.$ref?.split('/').pop()||'').toLowerCase()});
      }
    }
    const removed=id=>id.dataId===dataId&&within(id.path,path),deleted=identities.filter(removed),remaining=identities.filter(id=>!removed(id));
    const parentPath=path.slice(0,path.lastIndexOf('/')),parent=path?C.at(source.value,parentPath):null,index=Array.isArray(parent)?Number(C.unesc(path.split('/').pop())):null;
    const shifted=p=>{if(index===null||!p.startsWith(parentPath+'/'))return p;const tail=p.slice(parentPath.length+1).split('/'),i=Number(tail[0]);if(Number.isInteger(i)&&i>index){tail[0]=String(i-1);return parentPath+'/'+tail.join('/');}return p;};
    const refs=[];
    for(const d of docs)for(const n of graphs.get(d.id)||[]){
      if(d.id===dataId&&within(n.path,path))continue;
      const array=Array.isArray(n.value),schema=n.effective.schema||{};
      for(const [key,value]of Object.entries(n.value)){
        if(!['string','number'].includes(typeof value))continue;
        if(!array&&/^(id|name|address)$/i.test(key))continue; // Definitions are never references.
        const field=array?C.unesc(n.path.split('/').pop()):key,rule=array?schema.items||{}:schema.properties?.[key]||{},originalPath=n.path+'/'+C.esc(key);
        const add=reason=>refs.push({dataId:d.id,name:d.name,path:d.id===dataId?shifted(originalPath):originalPath,value,reason});
        // Explicit JSON Pointers have a document and location, unlike ID guesses.
        if(typeof value==='string'&&(key==='$ref'||/^(?:[^#]+)?#(?:\/|$)/.test(value))){
          const hash=value.indexOf('#'),file=hash<0?value:value.slice(0,hash);let targetPath;
          try{targetPath=hash<0?'':decodeURIComponent(value.slice(hash+1));}catch{continue;}
          if(targetPath&&!targetPath.startsWith('/'))continue;
          if(!(file?source.name===file:d.id===dataId))continue;
          if(C.at(source.value,targetPath)===undefined)continue;
          if(within(targetPath,path))add('The JSON Pointer targets the deleted subtree.');
          else if(shifted(targetPath)!==targetPath)add('Array indexes shifted; this JSON Pointer may now identify a different value.');
          continue;
        }
        const hint=referenceHint(field,n.value,{...rule,description:rule.description||(array?schema.description:'')});
        if(/Names?$/i.test(field))hint.field='name';
        if(!hint.recognized&&!/(?:Refs?|Ids?|Names?)$/i.test(field))continue;
        const matches=id=>id.value===value&&id.field===hint.field&&(!hint.target||!id.type||id.type.includes(hint.target));
        if(!deleted.some(matches))continue;
        // Prefer a document's own matching object. A duplicate document's
        // references still resolve to its own surviving copy.
        const local=identities.some(id=>id.dataId===d.id&&matches(id));
        const survives=remaining.some(id=>(!local||id.dataId===d.id)&&matches(id));
        if(!survives)add(local?'No matching target remains in this file.':'No matching target remains in the loaded files.');
      }
    }
    return {references:refs,containment:path?1:0};
  }
  function deleteData(state,dataId,path){
    const d=state.data.find(d=>d.id===dataId);if(!d)throw Error('The document no longer exists.');
    if(path){if(C.at(d.value,path)===undefined)throw Error('This node no longer exists.');const next=C.clone(d.value);C.remove(next,path);d.value=next;}
    else state.data=state.data.filter(d=>d.id!==dataId);
    if(!state.data.some(d=>d.id===state.activeData))state.activeData=state.data[0]?.id||null;
  }
  const api={planSchemaDelete,arrayField,replaceFieldType,referenceHint,dataDeletePlan,deleteData};if(typeof module!=='undefined')module.exports=api;root.SchemaEditing=api;
})(typeof window!=='undefined'?window:globalThis);
