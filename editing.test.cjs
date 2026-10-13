const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('./core.js'),E=require('./editing.js');
test('schema deletion removes incoming aliases, array fields, required entries, and cross-file references',()=>{
  const reg={'a.json':{type:'object',properties:{targets:{type:'array',items:{$ref:'#/$defs/Target'}}},required:['targets'],$defs:{Target:{type:'object',properties:{self:{$ref:'#/$defs/Target'}}},Alias:{$ref:'#/$defs/Target'}}},'b.json':{type:'object',properties:{target:{$ref:'a.json#/$defs/Alias'},other:{type:'string'}},required:['target']}};
  const p=E.planSchemaDelete(reg,'a.json','/$defs/Target');assert.equal(p.references.length,3);assert.deepEqual(p.schemas['a.json'].properties,{});assert.deepEqual(p.schemas['a.json'].required,[]);assert.deepEqual(p.schemas['a.json'].$defs,{});assert.deepEqual(p.schemas['b.json'].required,[]);assert.ok(p.schemas['b.json'].properties.other);assert.ok(reg['a.json'].$defs.Target,'Plan must not mutate source');
});
test('deleting a union variant repairs surviving numeric JSON Pointer references',()=>{
  const reg={'u.json':{oneOf:[{type:'object',properties:{a:{type:'string'}}},{type:'object',properties:{b:{type:'string'}}}],$defs:{Second:{$ref:'#/oneOf/1'}}}};
  const p=E.planSchemaDelete(reg,'u.json','/oneOf/0');assert.equal(p.schemas['u.json'].oneOf.length,1);assert.equal(p.schemas['u.json'].$defs.Second.$ref,'#/oneOf/0');assert.ok(C.resolve(p.schemas,'u.json','#/$defs/Second').schema);
});
test('deleting the final union choice does not turn it into an unrestricted schema',()=>{
  const p=E.planSchemaDelete({'u.json':{oneOf:[{type:'object',properties:{}}]}},'u.json','/oneOf/0');assert.ok(C.validate(p.schemas,'u.json',p.schemas['u.json'],{}).length);assert.equal(p.schemas['u.json'].oneOf,undefined);
});
test('deleting an inline array object removes its whole field and references to descendants',()=>{
  const reg={'a.json':{type:'object',properties:{rows:{type:'array',items:{type:'object',properties:{n:{type:'integer'}}}},copy:{$ref:'#/properties/rows/items'}},required:['rows']}};
  const p=E.planSchemaDelete(reg,'a.json','/properties/rows/items');assert.deepEqual(p.schemas['a.json'].properties,{});assert.equal(p.references.length,1);assert.equal(p.containment,1);
});
test('array checkbox round trip preserves item constraints and references',()=>{
  const scalar={type:'integer',enum:[4,6,8],minimum:1,description:'Dice'};assert.deepEqual(E.arrayField(E.arrayField(scalar,true),false),scalar);
  const array={type:'array',minItems:3,maxItems:3,uniqueItems:true,items:{$ref:'#/$defs/X'},description:'Items'};const changed=E.replaceFieldType(array,{type:'boolean'});assert.equal(changed.minItems,3);assert.equal(changed.maxItems,3);assert.equal(changed.uniqueItems,true);assert.deepEqual(changed.items,{type:'boolean'});assert.deepEqual(E.arrayField(array,false),{$ref:'#/$defs/X',description:'Items'});
});
test('data deletion clears ID reference strings in multiple files and arrays, not same-valued prose',()=>{
  const schema={type:'object',properties:{contacts:{type:'array',items:{$ref:'#/$defs/Contact'}},entryContacts:{type:'array',items:{type:'string'}},speakerRef:{type:'string'},description:{type:'string'}},$defs:{Contact:{type:'object',properties:{id:{type:'string'},name:{type:'string'}}}}};
  const state={schemas:{'s.json':schema},activeData:'one',data:[{id:'one',name:'one.json',schema:'s.json',value:{contacts:[{id:'c1',name:'Reed'},{id:'c2',name:'Bird'}],entryContacts:['c1','c2','c1'],description:'c1'}},{id:'two',name:'two.json',schema:'s.json',value:{speakerRef:'c1'}}]};
  const plan=E.dataDeletePlan(state,'one','/contacts/0');assert.equal(plan.references.length,3);E.deleteData(state,'one','/contacts/0',plan.references);assert.deepEqual(state.data[0].value.contacts,[{id:'c2',name:'Bird'}]);assert.deepEqual(state.data[0].value.entryContacts,['c2']);assert.equal(state.data[0].value.description,'c1');assert.deepEqual(state.data[1].value,{});
});
test('root document deletion removes its loaded references and can leave an empty workspace',()=>{
  const p=E.planSchemaDelete({'a.json':{type:'object'},'b.json':{$ref:'a.json#'}},'a.json','');assert.deepEqual(p.schemas,{});assert.equal(p.references.length,1);
  const state={data:[{id:'a',value:{}}],activeData:'a'};E.deleteData(state,'a','',[]);assert.deepEqual(state.data,[]);assert.equal(state.activeData,null);
});
