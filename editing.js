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
  function dataDeletePlan(state,dataId,path){const source=state.data.find(d=>d.id===dataId),identities=[];
    for(const n of C.dataNodes(state.schemas,source.schema,state.schemas[source.schema],source.value).nodes)if(within(n.path,path)&&!Array.isArray(n.value)){const type=n.schema?.$ref?.split('/').pop()||n.path.split('/').slice(-2,-1)[0]||'';for(const field of ['id','name','address'])if(typeof n.value[field]==='string'&&n.value[field])identities.push({value:n.value[field],field,type:type.toLowerCase()});}
    const refs=[];for(const d of state.data)for(const n of C.dataNodes(state.schemas,d.schema,state.schemas[d.schema],d.value).nodes){if(d.id===dataId&&within(n.path,path))continue;const a=Array.isArray(n.value),schema=n.effective.schema;for(const [key,value]of Object.entries(n.value)){if(typeof value!=='string')continue;const field=a?C.unesc(n.path.split('/').pop()):key,s=a?schema.items||{}:schema.properties?.[key]||{};const hint=referenceHint(field,n.value,{...s,description:s.description||(a?schema.description:'')});if(!hint.recognized)continue;const match=identities.some(id=>id.value===value&&id.field===hint.field&&(!hint.target||id.type.includes(hint.target)));if(match)refs.push({dataId:d.id,name:d.name,path:n.path+'/'+C.esc(key),value});}}
    return {references:refs,containment:path?1:0};
  }
  function deleteData(state,dataId,path,references){const grouped=new Map();for(const r of [...references,{dataId,path}]){if(!grouped.has(r.dataId))grouped.set(r.dataId,new Set());grouped.get(r.dataId).add(r.path);}
    for(const [id,paths]of grouped){const d=state.data.find(x=>x.id===id);if(!d)continue;if(paths.has('')){state.data=state.data.filter(x=>x.id!==id);continue;}
      // Remove through a recursive filter using original paths: array indexes
      // never drift when deleting several references in the same array.
      const visit=(v,p)=>{if(Array.isArray(v))return v.flatMap((x,i)=>paths.has(p+'/'+i)?[]:[visit(x,p+'/'+i)]);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!paths.has(p+'/'+C.esc(k))).map(([k,x])=>[k,visit(x,p+'/'+C.esc(k))]));return v;};d.value=visit(d.value,'');
    }
    if(!state.data.some(d=>d.id===state.activeData))state.activeData=state.data[0]?.id||null;
  }
  const api={planSchemaDelete,arrayField,replaceFieldType,referenceHint,dataDeletePlan,deleteData};if(typeof module!=='undefined')module.exports=api;root.SchemaEditing=api;
})(typeof window!=='undefined'?window:globalThis);
