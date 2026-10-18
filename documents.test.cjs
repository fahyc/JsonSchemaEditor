const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('./documents.js');
test('schema detection separates declarations, hints and arbitrary JSON',()=>{
  assert.equal(D.classify('Tree.schema.json',{}),'schema');
  assert.equal(D.classify('rules.json',{$schema:'https://json-schema.org/draft/2020-12/schema'}),'schema');
  assert.equal(D.classify('data.json',{$schema:'rules.schema.json',name:'A'}),'json');
  assert.equal(D.classify('data.json',{type:'object',properties:{}}),'ambiguous');
  assert.equal(D.classify('data.json',false),'json');
});
test('free graphs handle object, array, scalar and null roots',()=>{
  for(const value of [null,false,3,'text',[],{}])assert.equal(D.graph(value).nodes.length,1);
  const graph=D.graph({a:[{},['x']]});assert.equal(graph.nodes.length,4);assert.equal(graph.edges.length,3);
});
test('property rename supports empty, escaped and prototype keys without pollution',()=>{
  const v={'a/b':3};D.rename(v,'','a/b','__proto__');assert.equal(v.__proto__,3);assert.equal({}.polluted,undefined);D.rename(v,'','__proto__','');assert.equal(v[''],3);
  v.duplicate=true;assert.throws(()=>D.rename(v,'','','duplicate'),/exists/);
});
test('schema matching recognizes references and constraints without accepting every empty schema',()=>{
  const reg={'any.json':{},'person.schema.json':{type:'object',properties:{name:{type:'string'}},required:['name'],additionalProperties:false},'count.schema.json':{type:'number'}};
  assert.deepEqual(D.matchingSchemas(reg,{name:'Joe'}),['person.schema.json']);assert.deepEqual(D.matchingSchemas(reg,4),['count.schema.json']);assert.deepEqual(D.matchingSchemas(reg,{unknown:3}),[]);
  assert.deepEqual(D.parse('\uFEFF{"a":1}'),{a:1});
});
test('renaming a saved schema preserves self references, consumers and canonical instances',()=>{
  const reg={'old.schema.json':{type:'object',properties:{self:{$ref:'old.schema.json#'}}},'consumer.schema.json':{type:'object',properties:{child:{$ref:'old.schema.json#'}}}};
  D.renameSchema(reg,'old.schema.json','new.schema.json');assert.equal(reg['old.schema.json'],undefined);assert.equal(reg['new.schema.json'].properties.self.$ref,'#');assert.equal(reg['consumer.schema.json'].properties.child.$ref,'new.schema.json#');
});
