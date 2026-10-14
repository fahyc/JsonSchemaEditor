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
      const data=mode==='valid'?[{kind:'Shield',value:2}]:[{kind:'NotAnEffect'}];
      await route.fulfill({json:{status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({data})}]}]}});
    });
    await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
    await page.locator('#ai-open').click();await page.locator('#ai-key').fill('test-key-never-persist');await page.locator('#ai-model').fill('test-model');
    await page.locator('#ai-schema').selectOption('EquipmentEffects.schema.json');await page.locator('#ai-prompt').fill('Make a shield.');await page.locator('#ai-generate').click();
    await page.waitForFunction(()=>!document.querySelector('#ai-dialog').open);
    assert.equal(await page.locator('#data-list .file-item').count(),1);assert.match(await page.locator('#validation-toggle').innerText(),/valid/i);
    assert.equal(request.model,'test-model');assert.equal(request.input.length,1);
    assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes('test-key-never-persist'));
    mode='invalid';await page.locator('#ai-open').click();await page.locator('[data-context]').check();await page.locator('#ai-generate').click();await page.locator('#ai-draft').waitFor({state:'visible'});
    assert.equal(JSON.parse(request.input[0].content).context_data_files.length,1);
    assert.equal(await page.locator('#data-list .file-item').count(),1);
    await page.locator('#ai-draft').click();assert.equal(await page.locator('#data-list .file-item').count(),2);
    assert.equal(await page.locator('#data-mode').getAttribute('class'),'active');
    assert.deepEqual(errors,[]);
    await page.locator('#ai-open').click();await page.screenshot({path:path.join(__dirname,'ai-preview.png')});
    console.log('AI browser flows passed: valid generation, context selection, invalid draft, data view, key isolation.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
