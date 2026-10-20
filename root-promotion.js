/* Extract schema roots and rank whole-file schema suggestions for JSON roots. */
(function(root){
  'use strict';
  const C=typeof module!=='undefined'?require('./core.js'):root.SchemaCore;
  const D=typeof module!=='undefined'?require('./documents.js'):root.DocumentTools;
  const pointer=path=>'#'+encodeURI(path).replace(/#/g,'%23').replace(/\?/g,'%3F');
  function schemaRoot(reg,doc,path){
    const source=C.at(reg[doc],path);if(source===undefined)throw Error('This schema node no longer exists.');
    const copy=C.clone(source);
    if(copy&&typeof copy==='object'){
      delete copy.$id;
      if(!copy.$schema&&reg[doc]?.$schema)copy.$schema=reg[doc].$schema;
      D.schemaRefs(copy,node=>{
        const target=C.resolve(reg,doc,node.$ref),inside=target.doc===doc&&(target.path===path||target.path.startsWith(path+'/'));
        node.$ref=(inside?'':target.doc)+pointer(inside?target.path.slice(path.length):target.path);
      });
    }
    return copy;
  }
  function schemaMatch(reg,doc,value){
    const schema=reg[doc];let passed=0,total=0,evidence=0,errorPaths;
    const check=ok=>{total++;if(ok)passed++;};
    // Score concrete value slots instead of dividing a validator's error count
    // by field count: a single invalid field can produce many validator errors.
    function inspect(d,original,v,depth=0,path=''){
      if(depth>150)throw Error('Object is too deeply nested to score.');
      const effective=C.effective(reg,d,original,v),s=effective.schema;d=effective.doc;
      if(s===false){check(false);return;}if(s===true||!s||typeof s!=='object'){check(true);return;}
      const types=s.type?[].concat(s.type):null;
      if(types&&!types.some(t=>C.isType(v,t))){check(false);return;}
      if(v===null||typeof v!=='object'){
        check(!errorPaths.has(path)&&C.validate(reg,d,s,v).length===0);
        if(['type','const','enum','minLength','maxLength','pattern','minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf'].some(k=>C.own(s,k)))evidence++;
        return;
      }
      const local={...s};
      for(const k of ['properties','patternProperties','additionalProperties','required','items','prefixItems','$defs','definitions','dependentSchemas'])delete local[k];
      if(!Array.isArray(v))local.additionalProperties=true;
      check(!errorPaths.has(path)&&C.validate(reg,d,local,v).length===0);
      if(C.own(s,'const')||s.enum)evidence++;
      if((C.own(s,'const')||s.enum)&&!s.properties&&!s.items&&!s.prefixItems)return;
      if(Array.isArray(v)){
        v.forEach((item,i)=>{const itemSchema=s.prefixItems?.[i]??s.items;if(itemSchema===undefined){check(false);return;}inspect(d,itemSchema,item,depth+1,path+'/'+i);});
        return;
      }
      for(const key of s.required||[])if(!C.own(v,key))check(false);
      for(const [key,item]of Object.entries(v)){
        const declared=C.own(s.properties,key),patterns=Object.entries(s.patternProperties||{}).filter(([pattern])=>new RegExp(pattern,'u').test(key));
        if(declared){evidence++;inspect(d,s.properties[key],item,depth+1,path+'/'+C.esc(key));}
        for(const [,rule]of patterns){evidence++;inspect(d,rule,item,depth+1,path+'/'+C.esc(key));}
        if(!declared&&!patterns.length){
          if(s.additionalProperties&&typeof s.additionalProperties==='object'){inspect(d,s.additionalProperties,item,depth+1,path+'/'+C.esc(key));}
          else check(false); // Unknown keys provide no evidence for a specific schema.
        }
      }
    }
    try{
      const errors=C.validate(reg,doc,schema,value);
      // Broken dependencies and alias cycles are not approximate matches.
      if(errors.some(e=>/Missing schema:|Unresolved reference:|Unsupported reference anchor:|Non-productive reference cycle/.test(e.message)))return null;
      errorPaths=new Set(errors.map(e=>e.path));inspect(doc,schema,value);
      return {doc,passed,total,evidence,score:evidence&&total?passed/total:0,errors};
    }catch{return null;}
  }
  function rankSchemas(reg,value,threshold=.8){
    return Object.keys(reg).map(doc=>schemaMatch(reg,doc,value)).filter(r=>r&&r.evidence&&r.score>=threshold)
      .sort((a,b)=>b.score-a.score||a.errors.length-b.errors.length||b.evidence-a.evidence||a.doc.localeCompare(b.doc));
  }
  const api={schemaRoot,schemaMatch,rankSchemas};
  if(typeof module!=='undefined')module.exports=api;root.RootPromotion=api;
})(typeof window!=='undefined'?window:globalThis);
