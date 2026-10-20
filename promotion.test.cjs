const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('./core.js'),P=require('./promotion.js');
test('schema promotion creates an independent inline type with recursive links rebased to the copy',()=>{
  const reg={'a.json':{type:'object',properties:{person:{$ref:'#/$defs/Person',description:'Local description'}},required:['person'],$defs:{Person:{type:'object',properties:{name:{type:'string'},child:{$ref:'#/$defs/Person'},nameAlias:{$ref:'#/$defs/Person/properties/name'}},additionalProperties:false}}}};
  const copy=P.schemaCopy(reg,'a.json','/properties/person');
  assert.equal(copy.$ref,undefined);assert.equal(copy.description,'Local description');assert.equal(copy.properties.child.$ref,'#/properties/person');assert.equal(copy.properties.nameAlias.$ref,'#/properties/person/properties/name');
  copy.properties.name.minLength=3;assert.equal(reg['a.json'].$defs.Person.properties.name.minLength,undefined);assert.deepEqual(reg['a.json'].required,['person']);
});
test('cross-document aliases retain dependencies and literal JSON while removing duplicate schema identity',()=>{
  const reg={'a.json':{properties:{rows:{type:'array',minItems:2,items:{$ref:'b.json#/$defs/Alias'}}}},'b.json':{$defs:{Alias:{$ref:'#/$defs/Target',title:'Local title'},Target:{$id:'https://example.test/target',type:'object',properties:{external:{$ref:'#/$defs/Other'},self:{$ref:'#/$defs/Target'}},default:{$ref:'#/literal'}} ,Other:{type:'string',enum:['yes','no']}}}};
  const copy=P.schemaCopy(reg,'a.json','/properties/rows/items');C.put(reg['a.json'],'/properties/rows/items',copy);
  assert.equal(copy.$id,undefined);assert.equal(copy.title,'Local title');assert.equal(copy.properties.external.$ref,'b.json#/$defs/Other');assert.equal(copy.properties.self.$ref,'#/properties/rows/items');assert.deepEqual(copy.default,{$ref:'#/literal'});assert.equal(reg['a.json'].properties.rows.minItems,2);
  assert.equal(C.resolve(reg,'a.json',copy.properties.external.$ref).schema.type,'string');
});
test('conjunctive sibling constraints survive promotion, including references to copied descendants',()=>{
  const reg={'x.json':{properties:{copy:{$ref:'#/$defs/Node',required:['label'],properties:{extra:{$ref:'#/$defs/Node/properties/label'}}}},$defs:{Node:{type:'object',properties:{label:{type:'string'},self:{$ref:'#/$defs/Node'},alias:{$ref:'#/$defs/Node/properties/label'}}}}}};
  const copy=P.schemaCopy(reg,'x.json','/properties/copy'),original=C.clone(reg['x.json'].properties.copy);
  C.put(reg['x.json'],'/properties/copy',copy);
  assert.equal(copy.properties.self.$ref,'#/properties/copy');
  assert.equal(copy.properties.alias.$ref,'#/properties/copy/properties/label');
  assert.equal(copy.allOf[0].properties.extra.$ref,'#/properties/copy/properties/label');
  for(const value of [{},{label:'yes'},{label:3},{label:'yes',extra:7}])assert.deepEqual(C.validate(reg,'x.json',copy,value),C.validate(reg,'x.json',original,value));
});
test('pointer special characters stay resolvable and alias cycles or missing dependencies fail without mutation',()=>{
  const reg={'x.json':{properties:{'a/#%':{$ref:'#/$defs/N'}},$defs:{N:{type:'object',properties:{self:{$ref:'#/$defs/N'}}},Loop:{$ref:'#/$defs/Loop'},Missing:{$ref:'missing.json'}}}};
  const copy=P.schemaCopy(reg,'x.json','/properties/a~1#%');C.put(reg['x.json'],'/properties/a~1#%',copy);assert.equal(C.resolve(reg,'x.json',copy.properties.self.$ref).schema,copy);
  const before=C.clone(reg);assert.throws(()=>P.schemaCopy(reg,'x.json','/$defs/Loop'),/cycle/);assert.throws(()=>P.schemaCopy(reg,'x.json','/$defs/Missing'),/Missing schema/);assert.deepEqual(reg,before);
});
test('data references find loaded ID/name objects without treating matching prose or identity fields as references',()=>{
  const docs=[{id:'one',name:'one.json',value:{people:[{id:'p1',name:'Alex',nested:{x:1}}],ownerRef:'p1',personId:'p1',personName:'Alex',description:'p1',id:'p1'}},{id:'two',name:'two.json',value:{id:'p1',name:'Another Alex'}},{id:'raw',name:'raw.json',rawText:'{',value:{id:'p1'}}];
  assert.equal(P.dataTargets(docs,'one','/ownerRef',{key:'ownerRef'}).length,3);
  assert.equal(P.dataTargets(docs,'one','/personName',{key:'personName'})[0].path,'/people/0');
  assert.equal(P.dataTargets(docs,'one','/description',{key:'description'}).length,0);
  assert.equal(P.dataTargets(docs,'one','/id',{key:'id',description:'Stable ID'}).length,0);
  const target=P.dataTargets(docs,'one','/personId',{key:'personId'})[1];const copy=C.clone(target.value);copy.nested.x=9;assert.equal(docs[0].value.people[0].nested.x,1);
});
test('data JSON pointers resolve local and external object/array targets, with own-property safety',()=>{
  const docs=[{id:'a',name:'a.json',value:{objects:{'a/b':{name:'Child'}},link:{$ref:'#/objects/a~1b'},external:{$ref:'b.json#/items'},stringRef:'#/objects/a~1b',missing:{$ref:'#/objects/missing'},bad:{$ref:'#/toString'}}},{id:'b',name:'b.json',value:{items:[{id:7}]}}];
  assert.equal(P.dataTargets(docs,'a','/link',{key:'link'})[0].label,'Child');assert.ok(Array.isArray(P.dataTargets(docs,'a','/external',{key:'external'})[0].value));assert.equal(P.dataTargets(docs,'a','/stringRef',{key:'stringRef'})[0].path,'/objects/a~1b');assert.deepEqual(P.dataTargets(docs,'a','/missing',{key:'missing'}),[]);assert.deepEqual(P.dataTargets(docs,'a','/bad',{key:'bad'}),[]);
});
