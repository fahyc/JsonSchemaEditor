/* Document detection and JSON operations shared by browser, installed app and tests. */
(function(root){
  'use strict';
  const C=typeof module==='object'?require('./core.js'):root.SchemaCore;
  const parse=text=>JSON.parse(text.replace(/^\uFEFF/,''));
  function classify(name,value){
    if(/(?:\.schema(?:v\d+)?\.json|^schema\.json)$/i.test(name))return 'schema';
    if(value&&typeof value==='object'&&!Array.isArray(value)){
      if(typeof value.$schema==='string'&&/json-schema\.org\//i.test(value.$schema))return 'schema';
      if(value.$defs||value.definitions||(value.properties&&value.type)||value.oneOf||value.anyOf)return 'ambiguous';
    }
    return 'json';
  }
  function matchingSchemas(reg,value){
    if(value&&typeof value.$schema==='string'){
      const exact=Object.keys(reg).filter(n=>n===value.$schema||reg[n]?.$id===value.$schema);if(exact.length)return exact;
    }
    return Object.keys(reg).filter(n=>{
      const s=reg[n];if(!s||typeof s!=='object'||!['type','properties','oneOf','anyOf','$ref','const','enum'].some(k=>C.own(s,k)))return false;
      try{return !C.validate(reg,n,s,value).length;}catch{return false;}
    });
  }
  function graph(value){
    const g=C.dataNodes({},'',{},value);
    if(!g.nodes.length)g.nodes.push({key:'',path:'',name:'Root',value,schema:{},doc:'',effective:{doc:'',schema:{}}});
    return g;
  }
  const initial=type=>({object:{},array:[],string:'',number:0,boolean:false,null:null})[type];
  function rename(value,parentPath,key,newKey){
    const parent=C.at(value,parentPath);
    if(C.own(parent,newKey)&&newKey!==key)throw Error('That property already exists.');
    if(newKey===key)return;
    Object.defineProperty(parent,newKey,{value:parent[key],enumerable:true,writable:true,configurable:true});delete parent[key];
  }
  function schemaRefs(schema,visit){
    if(!schema||typeof schema!=='object')return;if(typeof schema.$ref==='string')visit(schema);
    for(const key of ['properties','$defs','definitions','dependentSchemas','patternProperties'])Object.values(schema[key]||{}).forEach(s=>schemaRefs(s,visit));
    for(const key of ['oneOf','anyOf','allOf','prefixItems'])for(const s of schema[key]||[])schemaRefs(s,visit);
    for(const key of ['items','additionalProperties','propertyNames','not','if','then','else','contains'])if(Array.isArray(schema[key]))schema[key].forEach(s=>schemaRefs(s,visit));else schemaRefs(schema[key],visit);
  }
  function renameSchema(reg,oldName,newName){
    if(oldName===newName)return;if(C.own(reg,newName))throw Error('A schema with that filename is already open.');
    const updates=[];for(const [source,schema]of Object.entries(reg))schemaRefs(schema,s=>{try{const target=C.resolve(reg,source,s.$ref);if(target.doc===oldName)updates.push([s,(source===oldName?'':newName)+'#'+target.path]);}catch{}});
    for(const [s,ref]of updates)s.$ref=ref;
    Object.defineProperty(reg,newName,{value:reg[oldName],enumerable:true,writable:true,configurable:true});delete reg[oldName];
  }
  function referenceFilename(ref){
    if(typeof ref!=='string'||ref.startsWith('#'))return null;
    try{const file=decodeURIComponent(ref.split('#')[0].split('?')[0].replace(/\\/g,'/').split('/').pop());return /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/i.test(file)?file:null;}catch{return null;}
  }
  function schemaCandidates(name,value,remembered){
    const explicit=referenceFilename(value?.$schema);if(explicit)return [explicit];if(remembered)return [remembered];
    const parts=name.replace(/\.json$/i,'').split('.'),names=[];while(parts.length){names.push(parts.join('.')+'.schema.json');parts.pop();}return names;
  }
  function namingWarnings(kind,name,schema){
    const warnings=[];
    if(kind==='schema'){
      if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.schema\.json$/.test(name))warnings.push('Schema filenames should use lowercase words separated by hyphens: type.schema.json.');
    }else{
      if(!/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*\.json$/.test(name)||/\.schema\.json$/i.test(name))warnings.push('Data filenames should use lowercase names such as type.json or type.name.json, without the .schema suffix.');
      if(schema){const stem=schema.replace(/\.schema\.json$/i,'');if(!name.startsWith(stem+'.')||!name.endsWith('.json'))warnings.push('Use '+stem+'.json or '+stem+'.name.json so the matching schema can be found automatically.');}
    }return warnings;
  }
  const api={parse,classify,matchingSchemas,graph,initial,rename,schemaRefs,renameSchema,referenceFilename,schemaCandidates,namingWarnings};
  if(typeof module==='object')module.exports=api;else root.DocumentTools=api;
})(typeof window==='object'?window:globalThis);
