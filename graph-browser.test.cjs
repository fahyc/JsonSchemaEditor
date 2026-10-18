const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1450,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const description='A longer description that must be readable in the hover summary. '.repeat(10);
    await page.addInitScript(description=>{localStorage.setItem('schema-dock.workspace.v1',JSON.stringify({schemas:{},data:[{id:'preview',name:'preview.json',schema:null,value:{id:'sample',a:1,b:true,c:null,d:'four',extra:'Beyond the five-field card preview',description,unsafe:'<img src=x onerror="window.pwned=1">',child:{label:'Nested child'}}}],activeData:'preview',mode:'data'}));},description);
    await page.goto('file:///'+path.join(__dirname,'index.html').replace(/\\/g,'/'));await page.waitForFunction(()=>window.WorkspaceFiles);
    const root=page.locator('.node-root');await root.hover();await page.locator('#node-tooltip').waitFor({state:'visible'});const text=await page.locator('#node-tooltip').innerText();assert.ok(text.includes('Beyond the five-field card preview'));assert.ok(text.includes(description.trim()));assert.equal(await page.evaluate(()=>window.pwned),undefined);
    const tooltip=await page.locator('#node-tooltip').boundingBox();assert.ok(tooltip.x>=0&&tooltip.x+tooltip.width<=1450&&tooltip.y>=0&&tooltip.y+tooltip.height<=1000);
    await page.screenshot({path:path.join(__dirname,'node-tooltip.png')});await page.keyboard.press('Escape');assert.equal(await page.locator('#node-tooltip').isVisible(),false);
    // The node follows the pointer at non-default zoom without moving its siblings or camera.
    await page.locator('#zoom-in').click();await page.locator('#zoom-in').click();const box=await root.boundingBox(),before=await root.evaluate(e=>[parseFloat(e.style.left),parseFloat(e.style.top)]),sibling=await page.locator('.node').nth(1).evaluate(e=>[e.style.left,e.style.top]),matrix=await page.locator('#graph').evaluate(e=>getComputedStyle(e).transform),stored=await page.evaluate(()=>localStorage.getItem('schema-dock.workspace.v1'));
    await page.mouse.move(box.x+150,box.y+30);await page.mouse.down();await page.mouse.move(box.x+270,box.y+90,{steps:8});await page.mouse.up();const after=await root.evaluate(e=>[parseFloat(e.style.left),parseFloat(e.style.top)]);assert.ok(Math.abs(after[0]-before[0]-100)<.1);assert.ok(Math.abs(after[1]-before[1]-50)<.1);assert.equal(await page.locator('#graph').evaluate(e=>getComputedStyle(e).transform),matrix);assert.deepEqual(await page.locator('.node').nth(1).evaluate(e=>[e.style.left,e.style.top]),sibling);assert.equal(await page.evaluate(()=>localStorage.getItem('schema-dock.workspace.v1')),stored);assert.equal(await page.locator('#editor').evaluate(e=>e.open),false);assert.equal(await page.locator('#node-tooltip').isVisible(),false);
    await root.click();assert.equal(await page.locator('#editor').evaluate(e=>e.open),true);await page.locator('#close-editor').click();
    // Schema previews include descriptions and constraints as well as field names.
    await page.locator('#schema-files').setInputFiles({name:'Demo.schema.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({type:'object',properties:{status:{type:'string',description:'The current stage',enum:['ready','done']}},required:['status']}))});await page.locator('.node-root').hover();await page.locator('#node-tooltip').waitFor({state:'visible'});assert.match(await page.locator('#node-tooltip').innerText(),/The current stage/);assert.match(await page.locator('#node-tooltip').innerText(),/ready/);
    assert.deepEqual(errors,[]);console.log('Graph previews and dragging passed: expanded fields, escaped content, schema descriptions, zoom-correct dragging, fixed camera/siblings, click editing.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
