const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('./core.js');

test('promoteSchema rewrites local subtree refs and keeps outside refs resolvable',()=>{
  const reg={'a.json':{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',$defs:{Node:{type:'object',properties:{self:{$ref:'#/$defs/Node'},leaf:{$ref:'#/$defs/Node/properties/self'},other:{$ref:'#/$defs/Other'}}},Other:{type:'object',properties:{id:{type:'string'}}}}}};
  const promoted=C.promoteSchema(reg,'a.json','/$defs/Node');
  assert.equal(promoted.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(promoted.properties.self.$ref,'#');
  assert.equal(promoted.properties.leaf.$ref,'#/properties/self');
  assert.equal(promoted.properties.other.$ref,'a.json#/$defs/Other');
});

test('schemaForDataPath maps object paths and rejects unmatched paths',()=>{
  const reg={'people.schema.json':{type:'object',properties:{people:{type:'array',items:{$ref:'#/$defs/Person'}},strict:{type:'object',additionalProperties:false}},$defs:{Person:{type:'object',properties:{id:{type:'string'}},required:['id']}}}};
  const value={people:[{id:'p1'}],strict:{extra:true}};
  const person=C.schemaForDataPath(reg,'people.schema.json',reg['people.schema.json'],value,'/people/0');
  assert.equal(person.doc,'people.schema.json');
  assert.deepEqual(C.validate(reg,person.doc,person.schema,value.people[0]),[]);
  assert.equal(C.schemaForDataPath(reg,'people.schema.json',reg['people.schema.json'],value,'/strict/extra'),null);
  const idSchema=C.schemaForDataPath(reg,'people.schema.json',reg['people.schema.json'],value,'/people/0/id');
  assert.deepEqual(C.validate(reg,idSchema.doc,idSchema.schema,value.people[0].id),[]);
});
