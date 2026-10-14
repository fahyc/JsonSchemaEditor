const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const AI=require('./ai.js');
test('prompt orders context, contract, request; includes transitive cyclic dependencies only',()=>{
  const reg={'a.json':{type:'array',items:{$ref:'b.json'},default:{$ref:'not-a-schema.json'}},'b.json':{type:'object',properties:{child:{$ref:'a.json'}}},'unused.json':{}};
  const p=JSON.parse(AI.prompt(reg,'a.json',[{name:'reference.json',schema:'unused.json',value:{id:'x'}}],'Make one'));
  assert.deepEqual(Object.keys(p),['context_data_files','output_contract','user_prompt']);
  assert.deepEqual(p.context_data_files,[{filename:'reference.json',data:{id:'x'}}]);
  assert.deepEqual(p.output_contract.dependencies.map(d=>d.filename),['b.json']);
  assert.throws(()=>AI.prompt({'a.json':{$ref:'missing.json'}},'a.json',[],'Make one'),/Missing schema/);
});
test('all bundled schema dependencies resolve',()=>{
  const reg=Object.fromEntries(['RegionResponseV5','EquipmentEffects','MissionArrivalResponseV8'].map(n=>[n+'.schema.json',JSON.parse(fs.readFileSync(n+'.schema.json','utf8'))]));
  for(const name of Object.keys(reg))assert.ok(JSON.parse(AI.prompt(reg,name,[],'Generate')).output_contract.schema);
});
const reply=body=>async()=>({ok:true,json:async()=>body});
const completed=data=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({data})}]}]});
test('Responses request keeps credentials out of body and unwraps arrays',async()=>{
  const value=await AI.generate({key:'secret',model:'chosen-model',prompt:'input JSON',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer secret');
    const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.model,'chosen-model');assert.equal(body.text.format.type,'json_object');assert.ok(!options.body.includes('secret'));
    return {ok:true,json:async()=>completed([{kind:'Shield'}])};
  }});assert.deepEqual(value,[{kind:'Shield'}]);
});
test('errors, incomplete output, refusal and malformed envelopes are rejected',async()=>{
  const base={key:'x',model:'m',prompt:'JSON'};
  await assert.rejects(AI.generate({...base,fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:{message:'Invalid key'}})})}),/401/);
  await assert.rejects(AI.generate({...base,fetchImpl:reply({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}})}),/did not complete/);
  await assert.rejects(AI.generate({...base,fetchImpl:reply({status:'completed',output:[{content:[{type:'refusal',refusal:'Declined'}]}]})}),/declined/);
  await assert.rejects(AI.generate({...base,fetchImpl:reply({status:'completed',output:[{content:[{type:'output_text',text:'{"wrong":1}'}]}]})}),/data key/);
});
