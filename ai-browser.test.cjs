const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try{
    const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    let request,mode='valid';
    await page.route('https://api.openai.com/v1/responses',async route=>{
      request=route.request().postDataJSON();
      if(mode==='html'){await route.fulfill({status:502,contentType:'text/html',body:'<h1>Gateway failure</h1>'});return;}
      if(mode==='malformed'){await route.fulfill({json:{status:'completed',output:[{content:[{type:'output_text',text:'unparseable response'}]}],usage:{total_tokens:456}}});return;}
      if(mode==='network'){await route.abort('failed');return;}
      const data=mode==='valid'?[{kind:'Shield',value:2}]:[{kind:'NotAnEffect'}];
      await route.fulfill({json:{status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({data})}]}]}});
    });
    await page.addInitScript(()=>localStorage.setItem('schema-dock.workspace.v1',JSON.stringify({schemas:{'test.schema.json':{type:'array',items:{type:'object',properties:{kind:{const:'Shield'},value:{type:'number'}},required:['kind','value'],additionalProperties:false}}},data:[],activeSchema:'test.schema.json',mode:'schema'})));
    await page.route('https://api.openai.com/v1/models',route=>route.fulfill({json:{data:[{id:'gpt-6-astra'},{id:'gpt-image-1'},{id:'text-embedding-3-small'}]}}));
    await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
    await page.locator('#ai-open').click();await page.locator('#ai-key').fill('test-key-never-persist');await page.locator('#ai-load-models').click();await page.locator('#ai-model option[value="gpt-6-astra"]').waitFor({state:'attached'});assert.equal(await page.locator('#ai-model option[value="gpt-image-1"]').count(),0);await page.locator('#ai-model').selectOption('gpt-6-astra');await page.locator('#ai-effort').selectOption('high');await page.locator('#ai-verbosity').selectOption('low');await page.locator('#ai-max-tokens').fill('30000');
    await page.locator('#ai-schema').selectOption('test.schema.json');await page.locator('#ai-prompt').fill('Make a shield.');await page.locator('#ai-generate').click();
    await page.waitForFunction(()=>!document.querySelector('#ai-dialog').open);
    assert.equal(await page.locator('#data-list .file-item').count(),1);assert.match(await page.locator('#validation-toggle').innerText(),/valid/i);
    assert.equal(request.model,'gpt-6-astra');assert.deepEqual(request.reasoning,{effort:'high'});assert.equal(request.text.verbosity,'low');assert.equal(request.max_output_tokens,30000);assert.equal(request.input.length,1);
    assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes('test-key-never-persist'));
    mode='invalid';await page.locator('#ai-open').click();await page.locator('[data-context]').check();await page.locator('#ai-generate').click();await page.locator('#ai-draft').waitFor({state:'visible'});
    assert.equal(JSON.parse(request.input[0].content).context_data_files.length,1);
    assert.equal(await page.locator('#data-list .file-item').count(),1);
    await page.locator('#ai-draft').click();assert.equal(await page.locator('#data-list .file-item').count(),2);
    assert.equal(await page.locator('#data-mode').getAttribute('class'),'active');
    assert.deepEqual(errors,[]);
    await page.locator('#ai-open').click();
    for(const [failureMode,expected] of [['html','Gateway failure'],['malformed','unparseable response'],['network','Failed to fetch']]){
      mode=failureMode;await page.locator('#ai-generate').click();await page.waitForFunction(()=>!document.querySelector('#ai-generate').disabled);assert.ok((await page.locator('#ai-raw').innerText()).includes(expected));
    }
    assert.equal(await page.locator('#ai-attempt option').count(),6);
    await page.locator('#ai-attempt').selectOption('3');assert.match(await page.locator('#ai-raw').innerText(),/Gateway failure/);
    const downloadPromise=page.waitForEvent('download');await page.locator('#ai-download-response').click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/openai-response/);
    await page.locator('#ai-close').click();await page.locator('#ai-open').click();assert.equal(await page.locator('#ai-attempt option').count(),6);
    await page.locator('#ai-model').selectOption('__custom');await page.locator('#ai-custom-model').fill('custom-text-model');
    mode='valid';await page.locator('#ai-generate').click();await page.waitForFunction(()=>!document.querySelector('#ai-dialog').open);assert.equal(request.model,'custom-text-model');
    await page.locator('#ai-open').click();assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes('Gateway failure'));
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(__dirname,'ai-preview.png')});
    console.log('AI browser flows passed: valid generation, context selection, invalid draft, data view, key isolation.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
