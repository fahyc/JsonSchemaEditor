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
  const api={parse,classify,matchingSchemas,graph,initial,rename,schemaRefs,renameSchema};
  if(typeof module==='object')module.exports=api;else root.DocumentTools=api;
})(typeof window==='object'?window:globalThis);
