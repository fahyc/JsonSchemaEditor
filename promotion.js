/* Reference promotion plans. Inputs are never mutated; copies remain finite. */
(function(root){
  'use strict';
  const C=typeof module!=='undefined'?require('./core.js'):root.SchemaCore;
  const pointer=path=>'#'+encodeURI(path).replace(/#/g,'%23').replace(/\?/g,'%3F');
  const annotations=new Set(['title','description','default','examples','$comment','deprecated','readOnly','writeOnly']);
  function schemaCopy(reg,doc,path){
    const field=C.at(reg[doc],path);
    if(typeof field?.$ref!=='string')throw Error('This field is not a schema reference.');
    const chain=[],seen=new Set([doc+'#'+path]);let source=field,sourceDoc=doc,sourcePath=path;
    while(typeof source?.$ref==='string'){
      const target=C.resolve(reg,sourceDoc,source.$ref);
      if(seen.has(target.key))throw Error('Reference aliases form a cycle without a concrete schema to copy.');
      seen.add(target.key);chain.push({schema:source,doc:sourceDoc,path:sourcePath});
      source=target.schema;sourceDoc=target.doc;sourcePath=target.path;chain[chain.length-1].target=target;
    }
    const copies=new Map(),pending=[];
    function walk(schema,visit,p=''){
      visit(schema,p);if(!schema||typeof schema!=='object')return;
      for(const k of ['properties','$defs','definitions','patternProperties','dependentSchemas'])for(const [name,child]of Object.entries(schema[k]||{}))walk(child,visit,p+'/'+k+'/'+C.esc(name));
      for(const k of ['oneOf','anyOf','allOf','prefixItems'])for(const [i,child]of (schema[k]||[]).entries())walk(child,visit,p+'/'+k+'/'+i);
      for(const k of ['items','additionalProperties','propertyNames','not','if','then','else','contains'])if(Array.isArray(schema[k]))schema[k].forEach((child,i)=>walk(child,visit,p+'/'+k+'/'+i));else if(schema[k]!==undefined)walk(schema[k],visit,p+'/'+k);
    }
    function copy(schema,from,origin){
      const out=C.clone(schema);
      if(out&&typeof out==='object')delete out.$id;
      walk(out,(node,suffix)=>{
        copies.set(from+'#'+origin+suffix,node);
        if(typeof node?.$ref==='string')pending.push({node,target:C.resolve(reg,from,node.$ref)});
      });
      return out;
    }
    const last=chain[chain.length-1].target;
    let out=copy(source,sourceDoc,last.path);
    for(const alias of [...chain].reverse()){
      const siblings=C.clone(alias.schema);delete siblings.$ref;delete siblings.$id;
      const moved=copy(siblings,alias.doc,alias.path),rules=Object.keys(moved).filter(k=>!annotations.has(k));
      if(!rules.length&&out&&typeof out==='object'){Object.assign(out,moved);continue;}
      if(!Object.keys(moved).length)continue;
      // Keep the copied fields visible to the form editor. Additional sibling
      // rules are conjunctive rather than overwriting the target's constraints.
      if(out&&typeof out==='object')out={...out,...Object.fromEntries(Object.entries(moved).filter(([k])=>annotations.has(k))),allOf:[...(out.allOf||[]),moved]};
      else out={allOf:[out,moved]};
    }
    const locations=new Map();walk(out,(node,suffix)=>locations.set(node,path+suffix));
    const roots=new Set([doc+'#'+path,...chain.map(x=>x.target.key)]);
    for(const {node,target}of pending){
      const copied=copies.get(target.key),next=roots.has(target.key)?path:locations.get(copied);
      const targetDoc=next===undefined?target.doc:doc;
      node.$ref=(targetDoc===doc?'':targetDoc)+pointer(next===undefined?target.path:next);
    }
    return out;
  }
  function atOwn(value,path){
    if(path==='')return value;
    if(!path.startsWith('/'))return undefined;
    for(const part of path.slice(1).split('/')){const key=C.unesc(part);if(!value||typeof value!=='object'||!C.own(value,key))return undefined;value=value[key];}
    return value;
  }
  function dataTargets(documents,sourceId,path,{key='',description=''}={}){
    const source=documents.find(d=>d.id===sourceId);if(!source||source.rawText!==undefined)return [];
    const value=atOwn(source.value,path),wrapper=value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&typeof value.$ref==='string';
    // Offer the action on the owning reference object, not its $ref attribute.
    if(key==='$ref'&&!wrapper)return [];
    const ref=wrapper?value.$ref:value;
    const explicit=typeof ref==='string'&&(wrapper||/^(?:[^#]+)?#(?:\/|$)/.test(ref));
    if(explicit){
      const hash=ref.indexOf('#'),file=hash<0?ref:ref.slice(0,hash);let targetPath;
      try{targetPath=hash<0?'':decodeURIComponent(ref.slice(hash+1));}catch{return [];}
      if(targetPath&&!targetPath.startsWith('/'))return [];
      return documents.filter(d=>d.rawText===undefined&&(file?d.name===file:d.id===sourceId)).flatMap(d=>{
        const target=atOwn(d.value,targetPath);
        return target&&typeof target==='object'&&!(d.id===sourceId&&targetPath===path)?[{dataId:d.id,doc:d.name,path:targetPath,label:target.name||target.id||'JSON object',value:target}]:[];
      });
    }
    if(!['string','number'].includes(typeof value)||value===''||/^(?:id|name|address|\$ref|\$schema)$/i.test(key))return [];
    if(!/(?:Refs?|Ids?|Names?)$/i.test(key)&&! /\b(?:IDs?|names?|references?|tokens?)\b/i.test(description))return [];
    const wanted=/Names?$/i.test(key)?['name']:/Ids?$/i.test(key)?['id']:['id','name','address'];
    const found=[];
    for(const d of documents){if(d.rawText!==undefined)continue;
      function visit(v,p){
        if(!v||typeof v!=='object')return;
        if(!Array.isArray(v)&&wanted.some(k=>C.own(v,k)&&v[k]===value))found.push({dataId:d.id,doc:d.name,path:p,label:v.name||v.id||v.address||'Object',value:v});
        for(const [k,child]of Object.entries(v))visit(child,p+'/'+C.esc(k));
      }
      visit(d.value,'');
    }
    return found;
  }
  const api={schemaCopy,dataTargets};
  if(typeof module!=='undefined')module.exports=api;root.ReferencePromotion=api;
})(typeof window!=='undefined'?window:globalThis);
