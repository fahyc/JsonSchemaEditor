const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),path=require('node:path');
const schema={title:'Team',type:'object',properties:{leader:{$ref:'#/$defs/Person',description:'Team leader'},people:{type:'array',minItems:1,items:{$ref:'#/$defs/Person'}},title:{type:'string'}},required:['leader'],$defs:{Person:{type:'object',properties:{id:{type:'string'},name:{type:'string'},manager:{$ref:'#/$defs/Person'}},additionalProperties:false}}};
const workspace={examplesVersion:2,schemas:{'team.schema.json':schema},data:[
  {id:'free',name:'links.json',schema:null,value:{people:[{id:'p1',name:'Alex',settings:{theme:'green'}},{id:'p2',name:'Sam'}],ownerRef:'p1',personId:'p2',note:'p1',missingRef:'absent',pointer:{$ref:'#/people/1'},remote:{$ref:'other.json#/child'}}},
  {id:'other',name:'other.json',schema:null,value:{id:'p1',name:'Another Alex',child:{label:'Remote object'}}},
  {id:'bound',name:'bound.json',schema:'team.schema.json',value:{leader:{id:'p3',name:'Jamie'},people:[],ownerRef:'p2'}}
],activeSchema:'team.schema.json',activeData:'free',mode:'schema'};
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
  for(const installed of [false,true]){
    const context=await browser.newContext({viewport:{width:1450,height:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({workspace,installed})=>{const key=installed?'schema-dock.workspace.pwa.v1':'schema-dock.workspace.v1';if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(workspace));},{workspace,installed});
    await page.goto('file:///'+path.join(__dirname,'index.html').replace(/\\/g,'/')+(installed?'?app=1':''));await page.waitForFunction(()=>window.WorkspaceFiles);
    const saved=()=>page.evaluate(installed=>JSON.parse(localStorage.getItem(installed?'schema-dock.workspace.pwa.v1':'schema-dock.workspace.v1')),installed);
    const row=name=>page.locator('.field-row').filter({has:page.locator('.field-name[value="'+name+'"]')});
    await page.locator('.node-root').click();assert.equal(await row('title').locator('.field-promote').count(),0);
    await page.screenshot({path:path.join(__dirname,'promotion-buttons'+(installed?'-pwa':'')+'.png')});
    await row('leader').locator('.field-promote').click();assert.equal(await row('leader').locator('.field-type').inputValue(),'object');
    await row('people').locator('.field-promote').click();assert.equal(await row('people').locator('.field-array').isChecked(),true);assert.equal(await row('people').locator('.field-type').inputValue(),'object');
    let state=await saved(),copy=state.schemas['team.schema.json'].properties.leader;assert.equal(copy.$ref,undefined);assert.equal(copy.description,'Team leader');assert.equal(copy.properties.manager.$ref,'#/properties/leader');assert.equal(state.schemas['team.schema.json'].properties.people.minItems,1);assert.deepEqual(state.schemas['team.schema.json'].$defs.Person,schema.$defs.Person);
    await page.screenshot({path:path.join(__dirname,'promotion-schema'+(installed?'-pwa':'')+'.png')});
    await page.locator('#close-editor').click();await page.locator('#undo').click();state=await saved();assert.equal(state.schemas['team.schema.json'].properties.people.items.$ref,'#/$defs/Person');await page.locator('#redo').click();
    await page.locator('[data-json="free"]').click();await page.locator('.node-root').click();
    const freeRow=name=>page.locator('.free-row').filter({has:page.locator('input[aria-label="Property name"][value="'+name+'"]')});
    assert.equal(await freeRow('note').locator('.promote-copy').count(),0);assert.equal(await freeRow('missingRef').locator('.promote-copy').count(),0);
    await freeRow('ownerRef').locator('.promote-copy').click();assert.equal(await page.locator('[data-copy]').count(),2);
    await page.locator('#copy-cancel').click();assert.equal((await saved()).data[0].value.ownerRef,'p1');
    await freeRow('ownerRef').locator('.promote-copy').click();await page.locator('#copy-search').fill('links.json');await page.locator('[data-copy]').click();
    state=await saved();assert.deepEqual(state.data[0].value.ownerRef,state.data[0].value.people[0]);assert.equal(state.data[0].value.ownerRef.id,'p1');assert.equal(await freeRow('ownerRef').locator('.promote-copy').count(),0);
    await freeRow('ownerRef').locator('.child-button').click();await page.locator('textarea[aria-label="name"]').fill('Copied Alex');await page.locator('textarea[aria-label="name"]').press('Tab');
    state=await saved();assert.equal(state.data[0].value.ownerRef.name,'Copied Alex');assert.equal(state.data[0].value.people[0].name,'Alex');
    await page.locator('#free-root').click();await freeRow('personId').locator('.promote-copy').click();await freeRow('pointer').locator('.promote-copy').click();await freeRow('remote').locator('.promote-copy').click();
    state=await saved();assert.deepEqual(state.data[0].value.pointer,{id:'p2',name:'Sam'});assert.deepEqual(state.data[0].value.remote,{label:'Remote object'});assert.deepEqual(state.data[0].value.personId,{id:'p2',name:'Sam'});assert.equal(state.data[1].value.child.label,'Remote object');
    await page.screenshot({path:path.join(__dirname,'promotion-data'+(installed?'-pwa':'')+'.png')});
    await page.locator('#close-editor').click();await page.locator('#undo').click();assert.deepEqual((await saved()).data[0].value.remote,{$ref:'other.json#/child'});await page.locator('#redo').click();
    await page.reload();await page.waitForFunction(()=>window.WorkspaceFiles);assert.equal((await saved()).data[0].value.ownerRef.name,'Copied Alex');
    // A bound data reference may be promoted too, but an incompatible schema
    // requires a warning, and cancelling it leaves the reference unchanged.
    await page.locator('[data-data="bound"]').click();await page.locator('.node-root').click();
    const bound=page.locator('.data-row').filter({has:page.locator('input[aria-label="ownerRef"]')});
    // Undeclared fields cannot be edited in the bound form; test a declared ID link.
    await page.locator('#close-editor').click();
    await page.evaluate(()=>{change(()=>{state.schemas['team.schema.json'].properties.ownerRef={type:'string'};});openData('');});
    await bound.locator('.promote-copy').click();await page.locator('#copy-search').fill('/people/1');await page.locator('[data-copy]').click();assert.match(await page.locator('#small-body').innerText(),/validation issues/);await page.locator('#confirm-cancel').click();assert.equal((await saved()).data[2].value.ownerRef,'p2');
    await bound.locator('.promote-copy').click();await page.locator('#copy-search').fill('/people/1');await page.locator('[data-copy]').click();await page.locator('#confirm-yes').click();assert.equal((await saved()).data[2].value.ownerRef.name,'Sam');
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Reference promotion passed in browser and installed workspaces: schemas, arrays, recursion, ID/name ambiguity, local/external pointers, independent child editing, warnings, undo/redo and persistence.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
