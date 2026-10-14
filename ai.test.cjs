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
  const context={window:{}};require('node:vm').runInNewContext(fs.readFileSync('schemas.bundle.js','utf8'),context);const reg=context.window.DEFAULT_SCHEMAS;
  for(const name of Object.keys(reg))assert.ok(JSON.parse(AI.prompt(reg,name,[],'Generate')).output_contract.schema);
});
const reply=body=>async()=>new Response(JSON.stringify(body),{status:200});
const completed=data=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({data})}]}]});
test('Responses request keeps credentials out of body and unwraps arrays',async()=>{
  const value=await AI.generate({key:'secret',model:'chosen-model',prompt:'input JSON',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer secret');
    const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.model,'chosen-model');assert.equal(body.text.format.type,'json_object');assert.ok(!options.body.includes('secret'));
    return new Response(JSON.stringify(completed([{kind:'Shield'}])));
  }});assert.deepEqual(value,[{kind:'Shield'}]);
});
test('errors, incomplete output, refusal and malformed envelopes are rejected',async()=>{
  const base={key:'x',model:'m',prompt:'JSON'};
  await assert.rejects(AI.generate({...base,fetchImpl:async()=>new Response(JSON.stringify({error:{message:'Invalid key'}}),{status:401})}),/401/);
  await assert.rejects(AI.generate({...base,fetchImpl:reply({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}})}),/did not complete/);
  await assert.rejects(AI.generate({...base,fetchImpl:reply({status:'completed',output:[{content:[{type:'refusal',refusal:'Declined'}]}]})}),/declined/);
  await assert.rejects(AI.generate({...base,fetchImpl:reply({status:'completed',output:[{content:[{type:'output_text',text:'{"wrong":1}'}]}]})}),/data key/);
});
test('model list filters non-text families and keeps fine-tuned text models',async()=>{
  const ids=['gpt-6-astra','gpt-4o','o3-mini','ft:gpt-4.1:org:name:123','gpt-image-1','gpt-4o-audio-preview','gpt-realtime','gpt-4o-mini-transcribe','text-embedding-3-small','omni-moderation-latest','dall-e-3','tts-1','o3-deep-research','gpt-4o-search-preview'];
  const models=await AI.listModels({key:'test-secret',fetchImpl:reply({data:ids.map(id=>({id}))})});
  assert.deepEqual(new Set(models),new Set(ids.slice(0,4)));
});
test('options omitted by default; explicit reasoning, verbosity and token limits reach API',async()=>{
  assert.deepEqual(AI.optionsBody({effort:'',verbosity:'',maxOutputTokens:''}),{});
  assert.throws(()=>AI.optionsBody({maxOutputTokens:0}),/positive integer/);
  assert.throws(()=>AI.optionsBody({maxOutputTokens:1.5}),/positive integer/);
  await AI.generate({key:'secret',model:'gpt-6-astra',prompt:'JSON',options:{effort:'high',verbosity:'low',maxOutputTokens:'30000'},fetchImpl:async(url,opts)=>{
    const body=JSON.parse(opts.body);assert.deepEqual(body.reasoning,{effort:'high'});assert.equal(body.text.verbosity,'low');assert.equal(body.text.format.type,'json_object');assert.equal(body.max_output_tokens,30000);return new Response(JSON.stringify(completed([])));
  }});
});
test('entire response is retained before any parsing, HTTP or content error',async()=>{
  for(const [status,raw] of [[502,'<html>Gateway error</html>'],[400,'{"error":{"message":"bad parameter"},"detail":[1,2]}'],[200,JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'not JSON'}]}],usage:{total_tokens:123}})]]){
    let dump;
    await assert.rejects(AI.generate({key:'secret-key',model:'m',prompt:'JSON',onResponse:r=>dump=r,fetchImpl:async()=>new Response(raw,{status,headers:{'x-request-id':'request-123'}})}));
    assert.equal(dump.responseText,raw);assert.equal(dump.httpStatus,status);assert.equal(dump.headers['x-request-id'],'request-123');
  }
});
test('network failures and cancellations retain diagnostics; echoed keys are redacted',async()=>{
  for(const error of [new TypeError('Failed to fetch'),new DOMException('Aborted','AbortError')]){
    let dump;await assert.rejects(AI.generate({key:'secret-key',model:'m',prompt:'JSON',onResponse:r=>dump=r,fetchImpl:async()=>{throw error;}}));assert.equal(dump.responseText,null);assert.ok(dump.error);
  }
  let dump;await assert.rejects(AI.listModels({key:'secret-key',onResponse:r=>dump=r,fetchImpl:async()=>new Response('{"error":{"message":"Invalid secret-key"}}',{status:401})}));assert.ok(!JSON.stringify(dump).includes('secret-key'));assert.match(dump.responseText,/redacted API key/);
});
