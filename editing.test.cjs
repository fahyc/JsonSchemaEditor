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
test('data deletion preserves every reference and other document while reporting possible broken references',()=>{
  const schema={type:'object',properties:{contacts:{type:'array',items:{$ref:'#/$defs/Contact'}},entryContacts:{type:'array',items:{type:'string'}},speakerRef:{type:'string'},description:{type:'string'}},$defs:{Contact:{type:'object',properties:{id:{type:'string'},name:{type:'string'}}}}};
  const state={schemas:{'s.json':schema},activeData:'one',data:[{id:'one',name:'one.json',schema:'s.json',value:{contacts:[{id:'c1',name:'Reed'},{id:'c2',name:'Bird'}],entryContacts:['c1','c2','c1'],description:'c1'}},{id:'two',name:'two.json',schema:'s.json',value:{speakerRef:'c1'}}]};
  const before=C.clone(state),plan=E.dataDeletePlan(state,'one','/contacts/0');assert.equal(plan.references.length,3);
  // An old caller passing a reference-removal list cannot cause pruning.
  E.deleteData(state,'one','/contacts/0',[...plan.references,{dataId:'two',path:''}]);
  assert.deepEqual(state.data[0].value,{...before.data[0].value,contacts:[{id:'c2',name:'Bird'}]});assert.deepEqual(state.data[1],before.data[1]);
});

test('duplicate documents keep their identities, child IDs and references, without false broken-reference reports',()=>{
  const schema={type:'object',properties:{nodes:{type:'array',items:{type:'object',properties:{id:{type:'string',description:'Stable ID used by references'},child:{type:'object',properties:{id:{type:'string',description:'ID'}}}}}},selectedRef:{type:'string'},childRef:{type:'string'}}};
  const value={nodes:[{id:'parent',child:{id:'child'}}],selectedRef:'parent',childRef:'child'};
  const state={schemas:{'s.json':schema},data:[{id:'a',name:'original.json',schema:'s.json',value:C.clone(value)},{id:'b',name:'duplicate.json',schema:'s.json',value:C.clone(value)}]};
  const before=C.clone(state),plan=E.dataDeletePlan(state,'a','/nodes/0');assert.deepEqual(plan.references.map(r=>[r.dataId,r.path]),[['a','/selectedRef'],['a','/childRef']]);assert.deepEqual(state,before);
  E.deleteData(state,'a','/nodes/0');assert.deepEqual(state.data[1],before.data[1]);assert.deepEqual(state.data[0].value,{...value,nodes:[]});
  assert.equal(E.dataDeletePlan(before,'a','').references.length,0);
});

test('a surviving same-file target prevents warnings, including schema-free numeric IDs',()=>{
  const state={schemas:{},data:[{id:'a',name:'a.json',schema:null,value:{nodes:[{id:7},{id:7}],selectedId:7}}]};
  assert.deepEqual(E.dataDeletePlan(state,'a','/nodes/0').references,[]);E.deleteData(state,'a','/nodes/0');assert.deepEqual(state.data[0].value,{nodes:[{id:7}],selectedId:7});
});

test('reports use surviving array indexes and escaped property names; deletion preserves all sibling values',()=>{
  const value={'a/b':[ {id:'gone'}, {id:'keep',targetRef:'gone',description:'gone'}],selectedRef:'gone'};
  const state={schemas:{},data:[{id:'a',name:'a.json',schema:null,value:C.clone(value)}]};
  const plan=E.dataDeletePlan(state,'a','/a~1b/0');assert.deepEqual(plan.references.map(r=>r.path),['/selectedRef','/a~1b/0/targetRef']);
  E.deleteData(state,'a','/a~1b/0');assert.deepEqual(state.data[0].value,{'a/b':[value['a/b'][1]],selectedRef:'gone'});
});

test('JSON Pointer deletion and array shifts are reported without rewriting local or external references',()=>{
  const state={schemas:{},data:[{id:'a',name:'a.json',schema:null,value:{nodes:[{id:'gone'},{id:'keep'}],gone:{$ref:'#/nodes/0'},shifted:{$ref:'#/nodes/1'}}},{id:'b',name:'b.json',schema:null,value:{ref:{$ref:'a.json#/nodes/0'}}}]};
  const before=C.clone(state),plan=E.dataDeletePlan(state,'a','/nodes/0');assert.equal(plan.references.length,3);assert.ok(plan.references.some(r=>r.reason.includes('indexes shifted')));
  E.deleteData(state,'a','/nodes/0');assert.deepEqual(state.data[1],before.data[1]);assert.deepEqual(state.data[0].value.gone,before.data[0].value.gone);assert.deepEqual(state.data[0].value.shifted,before.data[0].value.shifted);
});

test('root schema deletion removes aliases; root data deletion can leave an empty workspace',()=>{
  const p=E.planSchemaDelete({'a.json':{type:'object'},'b.json':{$ref:'a.json#'}},'a.json','');assert.deepEqual(p.schemas,{});assert.equal(p.references.length,1);
  const state={data:[{id:'a',value:{}}],activeData:'a'};E.deleteData(state,'a','',[]);assert.deepEqual(state.data,[]);assert.equal(state.activeData,null);
});
