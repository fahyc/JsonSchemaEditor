/* Dependency-free JSON Schema tools for the game contracts. Browser + Node. */
(function (root) {
  'use strict';
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o || {}, k);
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const esc = s => String(s).replace(/~/g,'~0').replace(/\//g,'~1');
  const unesc = s => s.replace(/~1/g,'/').replace(/~0/g,'~');
  const at = (o,p) => p === '' ? o : p.split('/').slice(1).reduce((v,k)=>v?.[unesc(k)],o);
  function put(o,p,v) { const ks=p.split('/').slice(1).map(unesc); const k=ks.pop(); const parent=ks.reduce((a,b)=>a[b],o); Object.defineProperty(parent,k,{value:v,writable:true,enumerable:true,configurable:true}); }
  function remove(o,p) { const ks=p.split('/').slice(1).map(unesc); const k=ks.pop(); const parent=ks.reduce((a,b)=>a[b],o); Array.isArray(parent)?parent.splice(+k,1):delete parent[k]; }
  const equal = (a,b) => a === b || (!!a && !!b && typeof a==='object' && typeof b==='object' && Array.isArray(a)===Array.isArray(b) && Object.keys(a).length===Object.keys(b).length && Object.keys(a).every(k=>own(b,k)&&equal(a[k],b[k])));
  const typeOf = v => v===null?'null':Array.isArray(v)?'array':typeof v;
  const isType = (v,t) => t==='integer'?Number.isInteger(v):t==='number'?typeof v==='number'&&Number.isFinite(v):typeOf(v)===t;
  function resolve(reg, doc, ref) {
    const pos=ref.indexOf('#'), file=pos<0?ref:ref.slice(0,pos), fragment=pos<0?'':decodeURIComponent(ref.slice(pos+1));
    let target=doc;
    if(file) { target=Object.keys(reg).find(k=>k===file || reg[k].$id===file); if(!target) { let abs; try { abs=new URL(file,reg[doc]?.$id || 'https://local/'+doc).href; } catch {} target=Object.keys(reg).find(k=>reg[k].$id===abs || k===file.split('/').pop()); } }
    if(!target || !reg[target]) throw Error('Missing schema: '+file);
    if(fragment && !fragment.startsWith('/')) throw Error('Unsupported reference anchor: '+ref);
    const schema=at(reg[target],fragment); if(schema===undefined) throw Error('Unresolved reference: '+ref);
    return {doc:target,path:fragment,schema,key:target+'#'+fragment};
  }
  function validate(reg, doc, schema, value, path='', stack=new Set()) {
    const errors=[], add=message=>errors.push({path,message});
    if(schema===false) {add('Value is not allowed');return errors;} if(schema===true) return errors;
    if(!schema || typeof schema!=='object') {add('Invalid schema');return errors;}
    const check=(s,v=value,p=path,d=doc,st=stack)=>validate(reg,d,s,v,p,st);
    if(schema.$ref) { try { const r=resolve(reg,doc,schema.$ref), token=r.key+'@'+path; if(stack.has(token)) {add('Non-productive reference cycle');return errors;} const next=new Set(stack);next.add(token);errors.push(...check(r.schema,value,path,r.doc,next)); } catch(e) {add(e.message);} }
    if(schema.type && ![].concat(schema.type).some(t=>isType(value,t))) add('Expected '+[].concat(schema.type).join(' or '));
    if(own(schema,'const')&&!equal(value,schema.const)) add('Must equal '+JSON.stringify(schema.const));
    if(schema.enum&&!schema.enum.some(v=>equal(v,value))) add('Choose one of the allowed values');
    if(typeof value==='string') {
      const len=[...value].length;
      if(schema.minLength!==undefined&&len<schema.minLength)add('Minimum length is '+schema.minLength);
      if(schema.maxLength!==undefined&&len>schema.maxLength)add('Maximum length is '+schema.maxLength);
      if(schema.pattern) {try {if(!new RegExp(schema.pattern,'u').test(value))add('Must match '+schema.pattern);}catch {add('Invalid regular expression in schema');}}
    }
    if(typeof value==='number') {
      if(!Number.isFinite(value))add('Must be a finite number');
      if(schema.minimum!==undefined&&value<schema.minimum)add('Minimum is '+schema.minimum);
      if(schema.maximum!==undefined&&value>schema.maximum)add('Maximum is '+schema.maximum);
      if(schema.exclusiveMinimum!==undefined&&value<=schema.exclusiveMinimum)add('Must be greater than '+schema.exclusiveMinimum);
      if(schema.exclusiveMaximum!==undefined&&value>=schema.exclusiveMaximum)add('Must be less than '+schema.exclusiveMaximum);
      if(schema.multipleOf!==undefined&&Math.abs(value/schema.multipleOf-Math.round(value/schema.multipleOf))>1e-9)add('Must be a multiple of '+schema.multipleOf);
    }
    if(Array.isArray(value)) {
      if(schema.minItems!==undefined&&value.length<schema.minItems)add('At least '+schema.minItems+' items required');
      if(schema.maxItems!==undefined&&value.length>schema.maxItems)add('At most '+schema.maxItems+' items allowed');
      if(schema.uniqueItems&&value.some((v,i)=>value.slice(0,i).some(w=>equal(v,w))))add('Items must be unique');
      value.forEach((v,i)=>{const s=schema.prefixItems?.[i]??schema.items;if(s!==undefined)errors.push(...check(s,v,path+'/'+i));});
    }
    if(value&&typeof value==='object'&&!Array.isArray(value)) {
      const keys=Object.keys(value);
      (schema.required||[]).forEach(k=>{if(!own(value,k))errors.push({path:path+'/'+esc(k),message:'Required field is missing'});});
      if(schema.minProperties!==undefined&&keys.length<schema.minProperties)add('At least '+schema.minProperties+' entries required');
      if(schema.maxProperties!==undefined&&keys.length>schema.maxProperties)add('At most '+schema.maxProperties+' entries allowed');
      keys.forEach(k=>{const p=path+'/'+esc(k);if(schema.propertyNames)errors.push(...check(schema.propertyNames,k,p));
        if(own(schema.properties,k))errors.push(...check(schema.properties[k],value[k],p));
        else if(schema.additionalProperties===false || (schema.additionalProperties===undefined && schema.type==='object')) errors.push({path:p,message:'Undeclared field is not allowed'});
        else if(schema.additionalProperties && typeof schema.additionalProperties==='object')errors.push(...check(schema.additionalProperties,value[k],p));
      });
    }
    for(const s of schema.allOf||[])errors.push(...check(s));
    if(schema.anyOf&&!schema.anyOf.some(s=>!check(s).length))add('Must match at least one variant');
    if(schema.oneOf) {const n=schema.oneOf.filter(s=>!check(s).length).length;if(n!==1)add('Must match exactly one variant (matched '+n+')');}
    if(schema.not&&!check(schema.not).length)add('Value matches a forbidden rule');
    if(schema.if) {const s=!check(schema.if).length?schema.then:schema.else;if(s)errors.push(...check(s));}
    return errors;
  }
  function deref(reg,doc,schema,seen=new Set()) {
    if(!schema?.$ref)return {schema,doc};
    const r=resolve(reg,doc,schema.$ref);if(seen.has(r.key))throw Error('Reference alias cycle: '+r.key);seen.add(r.key);
    const result=deref(reg,r.doc,r.schema,seen);const sibling={...schema};delete sibling.$ref;
    return {doc:result.doc,schema:{...result.schema,...sibling}};
  }
  function variantIndex(reg,doc,s,value) {
    const variants=s.oneOf||s.anyOf||[];let best=0,score=Infinity;
    variants.forEach((v,i)=>{const r=deref(reg,doc,v);let n=validate(reg,doc,v,value).length;
      for(const [k,f] of Object.entries(r.schema.properties||{}))if(own(f,'const')&&own(value,k)&&!equal(value[k],f.const))n+=100;
      if(n<score){score=n;best=i;}});return best;
  }
  function effective(reg,doc,schema,value,choice) {
    let r=deref(reg,doc,schema), s=clone(r.schema), d=r.doc, variants=s.oneOf||s.anyOf;
    if(variants) {const i=choice??variantIndex(reg,d,s,value), selected=effective(reg,d,variants[i],value);s={...s,...selected.schema};d=selected.doc;delete s.oneOf;delete s.anyOf;}
    const merge=x=>{if(!x)return;const r=effective(reg,d,x,value);s={...s,...r.schema,properties:{...s.properties,...r.schema.properties},required:[...new Set([...(s.required||[]),...(r.schema.required||[])])]};};
    const rules=s.allOf||[];delete s.allOf;for(const rule of rules) {if(rule.if)merge(validate(reg,d,rule.if,value).length?rule.else:rule.then);else merge(rule);}
    if(s.if){const condition=s.if, yes=s.then, no=s.else;delete s.if;merge(validate(reg,d,condition,value).length?no:yes);}
    return {schema:s,doc:d,variants};
  }
  function seed(reg,doc,schema,seen=new Set()) {
    if(schema?.$ref){const r=resolve(reg,doc,schema.$ref);if(seen.has(r.key))return undefined;seen=new Set(seen);seen.add(r.key);return seed(reg,r.doc,r.schema,seen);}
    if(own(schema,'default'))return clone(schema.default);if(own(schema,'const'))return clone(schema.const);if(schema.enum)return clone(schema.enum[0]);
    if(schema.oneOf||schema.anyOf)return seed(reg,doc,(schema.oneOf||schema.anyOf)[0],seen);
    const t=[].concat(schema.type||'string')[0];if(t==='null')return null;if(t==='boolean')return false;
    if(t==='number'||t==='integer'){let n=schema.minimum??0;if(schema.not?.const===n)n++;return n;}
    if(t==='array')return Array.from({length:Math.min(schema.minItems||0,100)},()=>seed(reg,doc,schema.items||{},seen)??null);
    if(t==='object'||schema.properties) {const out={};for(const k of schema.required||[]){if(!own(schema.properties,k))continue;const v=seed(reg,doc,schema.properties[k],seen);if(v!==undefined)Object.defineProperty(out,k,{value:v,writable:true,enumerable:true,configurable:true});}return out;}
    return '';
  }
  function index(reg) {
    const nodes=[], byKey=new Map(), edges=[];
    function walk(doc,s,path) {
      if(!s||typeof s!=='object')return;
      if(s.type==='object'||s.properties||s.oneOf||s.anyOf||path==='') {const key=doc+'#'+path;const token=path.split('/').pop();const name=s.title||s.properties?.kind?.const||unesc(token||doc.replace('.schema.json',''));const node={key,doc,path,schema:s,name:String(name)};nodes.push(node);byKey.set(key,node);}
      for(const keyword of ['properties','$defs','definitions'])for(const [k,v]of Object.entries(s[keyword]||{}))walk(doc,v,path+'/'+keyword+'/'+esc(k));
      for(const keyword of ['oneOf','anyOf','allOf','prefixItems'])for(const [i,v]of (s[keyword]||[]).entries())walk(doc,v,path+'/'+keyword+'/'+i);
      for(const keyword of ['items','additionalProperties','if','then','else','not'])if(typeof s[keyword]==='object')walk(doc,s[keyword],path+'/'+keyword);
    }
    Object.entries(reg).forEach(([doc,s])=>walk(doc,s,''));
    function links(source,doc,s,path,label,seen=new Set()) {
      if(!s||typeof s!=='object')return;
      if(s.$ref) {try{const r=resolve(reg,doc,s.$ref);if(seen.has(r.key))return;seen=new Set(seen);seen.add(r.key);if(byKey.has(r.key))edges.push({from:source.key,to:r.key,label});else links(source,r.doc,r.schema,r.path,label,seen);}catch{}return;}
      const key=doc+'#'+path;if(key!==source.key&&byKey.has(key)){edges.push({from:source.key,to:key,label});return;}
      for(const [k,v]of Object.entries(s.properties||{}))links(source,doc,v,path+'/properties/'+esc(k),k,seen);
      for(const [i,v]of (s.oneOf||s.anyOf||[]).entries())links(source,doc,v,path+'/'+(s.oneOf?'oneOf':'anyOf')+'/'+i,'variant '+(i+1),seen);
      if(s.items)links(source,doc,s.items,path+'/items',label+'[]',seen);
      if(typeof s.additionalProperties==='object')links(source,doc,s.additionalProperties,path+'/additionalProperties','{key}',seen);
    }
    nodes.forEach(n=>links(n,n.doc,n.schema,n.path,''));return {nodes,edges,byKey};
  }
  function dataNodes(reg,doc,schema,value) {
    const nodes=[],edges=[];
    function walk(d,s,v,p,parent,label) {if(!v||typeof v!=='object')return;let eff;try{eff=effective(reg,d,s,v);}catch{eff={doc:d,schema:{}};}
      const name=Array.isArray(v)?(label||'Root')+' ['+v.length+']':v.name||v.id||v.kind||label||'Root';nodes.push({key:p,path:p,name:String(name),value:v,schema:s,doc:d,effective:eff});if(parent!==null)edges.push({from:parent,to:p,label});
      Object.entries(v).forEach(([k,child])=>walk(eff.doc,Array.isArray(v)?eff.schema.items||{}:eff.schema.properties?.[k]||eff.schema.additionalProperties||{},child,p+'/'+esc(k),p,k));
    }walk(doc,schema,value,'',null,'Root');return {nodes,edges};
  }
  function schemaPath(root,target) {
    let found;
    const walk=(v,path)=>{
      if(found!==undefined||!v||typeof v!=='object')return;
      if(v===target){found=path;return;}
      for(const key of ['properties','$defs','definitions','patternProperties'])for(const [k,x]of Object.entries(v[key]||{}))walk(x,path+'/'+key+'/'+esc(k));
      for(const key of ['oneOf','anyOf','allOf','prefixItems'])for(const [i,x]of (v[key]||[]).entries())walk(x,path+'/'+key+'/'+i);
      for(const key of ['items','additionalProperties','if','then','else','not','propertyNames','contains'])if(typeof v[key]==='object')walk(v[key],path+'/'+key);
    };
    walk(root,'');
    return found;
  }
  function schemaForDataPath(reg,doc,schema,value,path='') {
    const parts=path.split('/').slice(1).map(unesc);
    let currentDoc=doc,currentSchema=schema,currentValue=value;
    for(const part of parts){
      if(!currentValue||typeof currentValue!=='object')return null;
      let eff;try{eff=effective(reg,currentDoc,currentSchema,currentValue);}catch{return null;}
      const child=Array.isArray(currentValue)?(eff.schema.prefixItems?.[+part]??eff.schema.items):(eff.schema.properties?.[part]??eff.schema.additionalProperties);
      if(child===undefined||child===false)return null;
      currentDoc=eff.doc;currentSchema=child;currentValue=currentValue[part];
    }
    const root=reg[currentDoc];
    return {doc:currentDoc,schema:currentSchema,value:currentValue,path:root?schemaPath(root,currentSchema):undefined};
  }
  function rewritePromotedRefs(reg,sourceDoc,prefix,out) {
    const walk=v=>{
      if(!v||typeof v!=='object')return;
      if(typeof v.$ref==='string') {
        try{
          const r=resolve(reg,sourceDoc,v.$ref), inside=r.doc===sourceDoc&&(r.path===prefix||r.path.startsWith(prefix+'/'));
          if(inside)v.$ref='#'+r.path.slice(prefix.length);
          else if(r.doc===sourceDoc&&prefix==='')v.$ref='#'+r.path;
          else v.$ref=r.doc+'#'+r.path;
        }catch{}
      }
      for(const key of ['properties','$defs','definitions','patternProperties'])Object.values(v[key]||{}).forEach(walk);
      for(const key of ['oneOf','anyOf','allOf','prefixItems'])(v[key]||[]).forEach(walk);
      for(const key of ['items','additionalProperties','if','then','else','not','propertyNames','contains'])if(typeof v[key]==='object')walk(v[key]);
    };
    walk(out);
  }
  function promoteSchema(reg,doc,pathOrSchema) {
    const byPath=typeof pathOrSchema==='string',prefix=byPath?pathOrSchema:'';
    const source=byPath?at(reg[doc],pathOrSchema):pathOrSchema;
    if(source===undefined)throw Error('Schema path not found: '+pathOrSchema);
    const out=clone(source);
    rewritePromotedRefs(reg,doc,prefix,out);
    if(out&&typeof out==='object'){
      if(byPath&&pathOrSchema&&reg[doc]?.$schema&&!own(out,'$schema'))out.$schema=reg[doc].$schema;
      if(reg[doc]?.$id&&out.$id===reg[doc].$id)delete out.$id;
    }
    return out;
  }
  const api={own,clone,esc,unesc,at,put,remove,equal,typeOf,isType,resolve,validate,deref,effective,seed,index,dataNodes,variantIndex,schemaPath,schemaForDataPath,promoteSchema};
  if(typeof module!=='undefined')module.exports=api;root.SchemaCore=api;
})(typeof window!=='undefined'?window:globalThis);
