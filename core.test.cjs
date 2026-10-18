const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('./core.js');
const names=['RegionResponseV5.schema.json','EquipmentEffects.schema.json','MissionArrivalResponseV8.schema.json'];
const reg=Object.fromEntries(names.map(n=>[n,JSON.parse(fs.readFileSync(path.join(__dirname,'test-fixtures',n),'utf8'))]));
const [region,effects,mission]=names;
const check=(doc,s,v)=>C.validate(reg,doc,s,v);
const def=(name)=>reg[mission].$defs[name];
test('all supplied schema references resolve and graph nodes are canonical',()=>{
  const g=C.index(reg);assert.equal(g.nodes.length,new Set(g.nodes.map(n=>n.key)).size);
  const walk=(doc,v)=>{if(!v||typeof v!=='object')return;if(v.$ref)assert.ok(C.resolve(reg,doc,v.$ref).schema);Object.values(v).forEach(x=>walk(doc,x));};
  for(const n of names)walk(n,reg[n]);assert.ok(g.edges.some(e=>e.to.startsWith(effects+'#')));
  assert.ok(g.edges.some(e=>e.from.endsWith('/AllPrerequisite')&&e.to.endsWith('/StoryPrerequisite')));
});
test('all equipment oneOf variants seed validly and optional constraints apply',()=>{
  const variants=reg[effects].$defs.EquipmentEffect.oneOf;
  for(const v of variants){const value=C.seed(reg,effects,v);assert.deepEqual(check(effects,reg[effects],[value]),[],value.kind);
    if(v.properties.value){assert.ok(check(effects,reg[effects],[{...value,value:v.properties.value.maximum+1}]).length);}}
  assert.ok(check(effects,reg[effects],[{kind:'Shield',bogus:1}]).length);
  assert.ok(check(effects,reg[effects],[{kind:'Unknown'}]).length);
});
test('region validates enums, cross-file refs, numeric constants, array lengths and patterns',()=>{
  const value={id:'r1',schemaVersion:5,topologyVersion:'base7-damage-loop-v3',systems:[{address:'123',description:'A system'}]};
  assert.deepEqual(check(region,reg[region],value),[]);
  const equipment=C.seed(reg,region,reg[region].$defs.EquipmentDefinition);equipment.id='e1';equipment.name='Shield';equipment.effects=[{kind:'Shield',value:2}];
  value.equipmentDefinitions=[equipment];assert.deepEqual(check(region,reg[region],value),[]);
  equipment.effects[0].value=99;assert.ok(check(region,reg[region],value).length);equipment.effects[0].value=2;
  value.systems[0].address='8';assert.ok(check(region,reg[region],value).some(e=>e.message.includes('match')));
});
test('mission sample omits conditional rules and keeps title and speaker optional',()=>{
  const s=def('MissionJournalEvent');
  for(const operation of ['create','append']){
    assert.deepEqual(check(mission,s,{operation,text:'Begin'}),[]);
    assert.deepEqual(check(mission,s,{operation,title:'Start',text:'Begin'}),[]);
  }
  for(const kind of ['MissionNode','ConversationNode']){
    assert.deepEqual(check(mission,def('StorySnippet'),{id:'s1',kind,narrative:'An event',outcomes:['done']}),[]);
  }
  const walk=v=>{if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){assert.ok(!['allOf','if','then','else'].includes(k),k);walk(x);}};
  for(const schema of Object.values(reg))walk(schema);
});

test('schema-defined dictionaries reject empty keys and validate nested values',()=>{
  const s=def('MissionJournalBinding');const v={missionRef:'m1',onOutcome:{done:{operation:'complete',text:'Finished'}}};assert.deepEqual(check(mission,s,v),[]);
  v.onOutcome['']={operation:'complete',text:'x'};assert.ok(check(mission,s,v).some(e=>e.message.includes('length')));
  delete v.onOutcome[''];v.onOutcome.done.unknown=true;assert.ok(check(mission,s,v).length);
});
test('not, uniqueItems, nullable strings, Unicode lengths and type checks',()=>{
  assert.ok(check(mission,def('ChangeCargoFunction'),{kind:'ChangeCargo',cargoRef:'c',delta:0}).length);
  assert.ok(check(region,{type:'array',uniqueItems:true,items:{type:'integer'}},[1,1]).length);
  assert.deepEqual(check(region,{type:['string','null']},null),[]);
  assert.deepEqual(check(region,{type:'string',minLength:1,maxLength:1},'🦜'),[]);
  assert.ok(check(region,{type:'integer'},1.2).length);
});
test('recursive schema graph and finite instance tree terminate',()=>{
  const r={...reg,'Tree.json':{type:'object',properties:{name:{type:'string'},child:{$ref:'#'}},additionalProperties:false,required:['name']}};
  const g=C.index(r);assert.ok(g.edges.some(e=>e.from==='Tree.json#'&&e.to===e.from));
  const value={name:'root',child:{name:'child'}};assert.deepEqual(C.validate(r,'Tree.json',r['Tree.json'],value),[]);
  assert.equal(C.dataNodes(r,'Tree.json',r['Tree.json'],value).nodes.length,2);
  assert.deepEqual(C.seed(r,'Tree.json',r['Tree.json']),{name:''});
});
test('reference aliases, JSON pointer escaping and JSON round trips preserve definitions',()=>{
  const g=C.index(reg);for(const doc of names)assert.deepEqual(JSON.parse(JSON.stringify(reg[doc])),reg[doc]);
  const obj={};C.put(obj,'/a~1b~0c',12);assert.equal(C.at(obj,'/a~1b~0c'),12);
  C.put(obj,'/__proto__',{polluted:true});assert.equal({}.polluted,undefined);
  assert.ok(g.nodes.filter(n=>n.doc===effects&&n.path.includes('/oneOf/')).length>=30);
});
