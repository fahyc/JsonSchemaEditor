const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),path=require('node:path');
const schema={type:'object',properties:{nodes:{type:'array',items:{$ref:'#/$defs/Node'}},selectedRef:{type:'string'},childRef:{type:'string'},details:{type:'string'}},$defs:{Node:{type:'object',properties:{id:{type:'string',description:'Stable ID used by references'},name:{type:'string',description:'Name used by references'},child:{$ref:'#/$defs/Node'}}}}};
const value={nodes:[{id:'parent',name:'Parent',child:{id:'child',name:'Child'}}],selectedRef:'parent',childRef:'child',details:'parent'};
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
  for(const installed of [false,true])for(const bound of [false,true]){
    const context=await browser.newContext({viewport:{width:1450,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
    const workspace={examplesVersion:2,schemas:bound?{'nodes.schema.json':schema}:{},data:[{id:'source',name:'original.json',schema:bound?'nodes.schema.json':null,value:structuredClone(value)},{id:'duplicate',name:'duplicate.json',schema:bound?'nodes.schema.json':null,value:structuredClone(value)},{id:'external',name:'external.json',schema:bound?'nodes.schema.json':null,value:{selectedRef:'parent'}}],activeSchema:bound?'nodes.schema.json':null,activeData:'source',mode:'data'};
    await page.addInitScript(({workspace,installed})=>{const key=installed?'schema-dock.workspace.pwa.v1':'schema-dock.workspace.v1';if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(workspace));},{workspace,installed});
    await page.goto('file:///'+path.join(__dirname,'index.html').replace(/\\/g,'/')+(installed?'?app=1':''));await page.waitForFunction(()=>window.WorkspaceFiles);
    const saved=()=>page.evaluate(installed=>JSON.parse(localStorage.getItem(installed?'schema-dock.workspace.pwa.v1':'schema-dock.workspace.v1')),installed);
    const parent=page.locator('.node').filter({has:page.locator('.node-name',{hasText:/^Parent$/})});
    await parent.locator('.node-delete').click();assert.equal(await page.locator('[data-delete-ref]').count(),0);assert.match(await page.locator('#small-body').innerText(),/all other documents will be preserved/);await page.locator('#delete-cancel').click();assert.deepEqual((await saved()).data,workspace.data);
    await parent.locator('.node-delete').click();await page.locator('#delete-confirm').click();assert.equal(await parent.count(),0);assert.equal(await page.locator('.delete-report-reference').count(),2);assert.equal(await page.locator('#small-body input[type="checkbox"]').count(),0);const report=await page.locator('#small-body').innerText();assert.match(report,/original\.json/);assert.doesNotMatch(report,/duplicate\.json|external\.json|\/id/);
    let state=await saved();assert.deepEqual(state.data[0].value,{...value,nodes:[]});assert.deepEqual(state.data[1],workspace.data[1]);assert.deepEqual(state.data[2],workspace.data[2]);
    await page.screenshot({path:path.join(__dirname,'deletion-report'+(installed?'-pwa':'')+(bound?'-bound':'-free')+'.png')});
    await page.locator('#delete-report-undo').click();assert.deepEqual((await saved()).data,workspace.data);assert.equal(await parent.count(),1);
    await parent.locator('.node-delete').click();await page.locator('#delete-confirm').click();await page.locator('#delete-report-done').click();await page.locator('#undo').click();assert.deepEqual((await saved()).data,workspace.data);await page.locator('#redo').click();state=await saved();assert.deepEqual(state.data[0].value,{...value,nodes:[]});assert.deepEqual(state.data[1],workspace.data[1]);assert.deepEqual(state.data[2],workspace.data[2]);
    await page.reload();await page.waitForFunction(()=>window.WorkspaceFiles);state=await saved();assert.deepEqual(state.data[0].value,{...value,nodes:[]});assert.deepEqual(state.data[1],workspace.data[1]);assert.deepEqual(state.data[2],workspace.data[2]);
    // Deleting the whole original document also leaves the independent copy
    // and its references intact; its local targets still exist.
    await page.locator('.node-root .node-delete').click();await page.locator('#delete-confirm').click();assert.equal(await page.locator('#delete-report-count').count(),0);state=await saved();assert.deepEqual(state.data,workspace.data.slice(1));await page.locator('#undo').click();assert.equal((await saved()).data.length,3);
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Deletion safety passed in browser/PWA, bound/free JSON: subtree-only mutation, duplicate and external isolation, identity/reference preservation, read-only reports, cancel, Undo/Redo, root deletion and persistence.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
