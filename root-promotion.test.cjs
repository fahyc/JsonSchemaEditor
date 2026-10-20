const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('./core.js'),R=require('./root-promotion.js');
test('promoting a schema subtree rebases recursive and descendant links while preserving external dependencies',()=>{
  const reg={'source.schema.json':{$schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://example.test/source',type:'object',$defs:{Node:{type:'object',properties:{name:{type:'string'},self:{$ref:'#/$defs/Node'},nameAgain:{$ref:'#/$defs/Node/properties/name'},other:{$ref:'#/$defs/Other'},external:{$ref:'extra.schema.json'}},required:['name']},Other:{type:'object'}}},'extra.schema.json':{type:'string',enum:['yes']}};
  const before=C.clone(reg),copy=R.schemaRoot(reg,'source.schema.json','/$defs/Node');reg['new.schema.json']=copy;
  assert.equal(copy.$schema,before['source.schema.json'].$schema);assert.equal(copy.properties.self.$ref,'#');assert.equal(copy.properties.nameAgain.$ref,'#/properties/name');assert.equal(copy.properties.other.$ref,'source.schema.json#/$defs/Other');assert.equal(copy.properties.external.$ref,'extra.schema.json#');
  for(const field of ['self','nameAgain','other','external'])assert.ok(C.resolve(reg,'new.schema.json',copy.properties[field].$ref));
  copy.properties.name.minLength=5;assert.deepEqual(reg['source.schema.json'],before['source.schema.json']);
});
test('whole schema root cloning removes its identity, preserves literal JSON and supports escaped pointers',()=>{
  const reg={'source.schema.json':{$id:'https://example.test/source',type:'object',properties:{'a/#':{type:'object',properties:{self:{$ref:'#/properties/a~1%23'}}}},default:{$ref:'#/literal'}}};
  const whole=R.schemaRoot(reg,'source.schema.json','');assert.equal(whole.$id,undefined);assert.deepEqual(whole.default,{$ref:'#/literal'});
  const copy=R.schemaRoot(reg,'source.schema.json','/properties/a~1#');assert.equal(copy.properties.self.$ref,'#');
  assert.throws(()=>R.schemaRoot(reg,'source.schema.json','/missing'),/no longer exists/);
});
test('schema ranking accepts exactly 80%, rejects lower matches, and prefers exact fits',()=>{
  const approximate={type:'object',properties:{a:{type:'string'},b:{type:'integer'},c:{type:'boolean'}},required:['a','b','c'],additionalProperties:false};
  const value={a:'text',b:3,c:true,extra:'retained'};
  const reg={'approx.schema.json':approximate,'exact.schema.json':{...C.clone(approximate),properties:{...approximate.properties,extra:{type:'string'}}},'generic.schema.json':{type:'object',additionalProperties:true},'wrong.schema.json':{type:'object',properties:{other:{type:'string'}},required:['other']}};
  assert.equal(R.schemaMatch(reg,'approx.schema.json',value).score,.8);
  assert.deepEqual(R.rankSchemas(reg,value).map(m=>m.doc),['exact.schema.json','approx.schema.json']);
  assert.equal(R.rankSchemas({'approx.schema.json':approximate},{...value,another:4}).length,0);
  assert.equal(R.schemaMatch(reg,'approx.schema.json',{a:'text',b:'bad',c:true,extra:7}).score,.6);
});
test('required, nested values, enum choices, dictionaries, arrays, and references affect fit',()=>{
  const reg={'child.schema.json':{type:'object',properties:{id:{type:'integer'},state:{enum:['open','done']}},required:['id','state']},'list.schema.json':{type:'array',items:{$ref:'child.schema.json'}},'dictionary.schema.json':{type:'object',additionalProperties:{type:'string'}},'union.schema.json':{oneOf:[{type:'object',properties:{kind:{const:'a'},text:{type:'string'}},required:['kind','text']},{type:'object',properties:{kind:{const:'b'},count:{type:'integer'}},required:['kind','count']}]}};
  assert.equal(R.schemaMatch(reg,'child.schema.json',{id:1}).score,2/3);assert.equal(R.schemaMatch(reg,'child.schema.json',{id:1,state:'done'}).score,1);
  assert.equal(R.rankSchemas(reg,[{id:1,state:'open'}])[0].doc,'list.schema.json');assert.equal(R.schemaMatch(reg,'list.schema.json',[{id:1,state:'unknown'}]).score,.75);
  assert.equal(R.schemaMatch(reg,'dictionary.schema.json',{a:'text',b:'more'}).score,1);
  assert.equal(R.rankSchemas(reg,{kind:'b',count:2})[0].doc,'union.schema.json');
});
test('empty/generic schemas, unrelated shapes, broken dependencies and alias cycles are never suggested',()=>{
  const reg={'empty.schema.json':{},'generic.schema.json':{type:'object'},'missing.schema.json':{$ref:'absent.schema.json'},'cycle.schema.json':{$ref:'cycle.schema.json'},'object.schema.json':{type:'object',properties:{name:{type:'string'}}}};
  assert.deepEqual(R.rankSchemas(reg,{}),[]);assert.deepEqual(R.rankSchemas(reg,[]),[]);assert.deepEqual(R.rankSchemas(reg,{unrelated:true}),[]);
  assert.equal(R.schemaMatch(reg,'missing.schema.json',{}),null);assert.equal(R.schemaMatch(reg,'cycle.schema.json',{}),null);
  const literal={'enum.schema.json':{enum:[{foo:1,bar:2}]}};assert.equal(R.rankSchemas(literal,{foo:1,bar:2})[0].score,1);
});
