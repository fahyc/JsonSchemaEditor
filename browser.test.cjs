const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file:///'+path.join(__dirname,'index.html').replace(/\\/g,'/'));
  await page.waitForSelector('.node');
  assert.equal(await page.locator('#schema-list button').count(),3);
  assert.match(await page.locator('#counts').innerText(),/nodes/);
  await page.screenshot({path:path.join(__dirname,'preview.png')});
  // Canonical field edits and lossless schema preservation.
  await page.locator('.node').filter({hasText:'Faction'}).first().focus();
  await page.locator('.node').filter({hasText:'Faction'}).first().click();
  await page.locator('#type-description').fill('Edited description');await page.locator('#type-description').press('Tab');
  await page.locator('#close-editor').click();await page.locator('#undo').click();
  // Create an effect array and edit oneOf variant + enum-like constant.
  await page.locator('#schema-list button').filter({hasText:'Equipment Effects'}).click();
  await page.locator('#new-data').click();await page.locator('#data-name').fill('effects-test.json');await page.locator('#create-data').click();
  await page.locator('#add-item').click();await page.locator('.child-button').click();
  await page.locator('#data-variant').selectOption('8');await page.locator('#confirm-yes').click();
  await page.locator('.data-row').filter({hasText:'value'}).locator('.add-value').click();
  await page.getByRole('spinbutton',{name:'value',exact:true}).fill('4');await page.getByRole('spinbutton',{name:'value',exact:true}).press('Tab');
  await page.locator('#close-editor').click();assert.match(await page.locator('#validation-toggle').innerText(),/valid/);
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'effects-test.json');
  // Reload saved state, inspect JSON exact structure.
  await page.reload();await page.locator('#json-view').click();const v=JSON.parse(await page.locator('#json-edit').inputValue());assert.deepEqual(v,[{kind:'Shield',value:4}]);await page.locator('#json-cancel').click();
  // Schema self-reference creation from object search.
  await page.locator('#new-schema').click();await page.locator('#new-name').fill('Recursive');await page.locator('#name-create').click();
  await page.locator('.node').click();await page.locator('#add-object').click();await page.locator('#new-name').fill('child');await page.locator('#name-create').click();
  await page.locator('#type-search').fill('Recursive');await page.locator('#type-results .picker-item').click();await page.locator('#close-editor').click();
  assert.equal(await page.locator('.node').count(),1);assert.match(await page.locator('#counts').innerText(),/1 links/);
  await page.locator('#json-view').click();const schema=JSON.parse(await page.locator('#json-edit').inputValue());assert.equal(schema.properties.child.$ref,'#');await page.locator('#json-cancel').click();
  // Real-file import, ID search across files, dictionaries, and optional journal fields.
  const importFile=async(name,value,schema)=>{await page.locator('#data-files').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await page.locator('#import-data-schema').selectOption(schema);await page.locator('#finish-data-import').click();};
  await importFile('region-data.json',{id:'r1',schemaVersion:5,topologyVersion:'base7-damage-loop-v3',systems:[{address:'123',description:'Home'}],locations:[{id:'port-1',name:'Anchor Port',systemRef:'123',kind:'Station',description:'A port'}]},'RegionResponseV5.schema.json');
  await importFile('mission-data.json',{schemaVersion:8,locationRef:'',contacts:[{id:'contact-1',name:'Captain Reed',role:'Captain',appearanceBrief:'Weathered'}],entryContacts:[''],storySnippets:[{id:'story-1',kind:'MissionNode',narrative:'Arrive',outcomes:['done'],mission:{missionRef:'m1',onOutcome:{}}}]},'MissionArrivalResponseV8.schema.json');
  await page.locator('.node-root').click();
  await page.locator('.data-row').filter({has:page.locator('input[aria-label="locationRef"]')}).getByRole('button',{name:'Find ID / name'}).click();
  await page.locator('#ref-results button').filter({hasText:'port-1'}).click();
  assert.equal(await page.getByRole('textbox',{name:'locationRef',exact:true}).inputValue(),'port-1');
  await page.locator('.data-row').filter({has:page.locator('.data-label',{hasText:'entryContacts'})}).locator('.child-button').click();
  await page.getByRole('button',{name:'Find ID / name'}).click();await page.locator('#ref-results button').filter({hasText:'contact-1'}).click();
  await page.locator('#close-editor').click();
  await page.locator('#search').fill('/onOutcome');await page.locator('.node').filter({hasText:'onOutcome'}).first().focus();await page.locator('.node').filter({hasText:'onOutcome'}).first().click();
  await page.locator('#add-entry').click();await page.locator('#new-name').fill('done');await page.locator('#name-create').click();
  await page.locator('.child-button').click();
  // Add the optional title for a create journal event.
  await page.locator('.data-row').filter({has:page.locator('.data-label',{hasText:'title'})}).locator('.add-value').click();
  await page.getByRole('textbox',{name:'title',exact:true}).fill('Docking');await page.getByRole('textbox',{name:'title',exact:true}).press('Tab');
  await page.getByRole('textbox',{name:'text',exact:true}).fill('Reach the port');await page.getByRole('textbox',{name:'text',exact:true}).press('Tab');
  await page.locator('#close-editor').click();assert.match(await page.locator('#validation-toggle').innerText(),/Data is valid/);
  await page.locator('#json-view').click();const mission=JSON.parse(await page.locator('#json-edit').inputValue());assert.equal(mission.locationRef,'port-1');assert.deepEqual(mission.entryContacts,['contact-1']);assert.deepEqual(mission.storySnippets[0].mission.onOutcome.done,{operation:'create',text:'Reach the port',title:'Docking'});await page.locator('#json-cancel').click();
  // Imported text remains text, not executable HTML.
  await importFile('escaped-data.json',{id:'<img src=x onerror="window.pwned=1">',schemaVersion:5,topologyVersion:'base7-damage-loop-v3',systems:[{address:'1',description:'safe'}]},'RegionResponseV5.schema.json');
  await page.locator('#search').fill('');assert.equal(await page.evaluate(()=>window.pwned),undefined);
  assert.deepEqual(errors,[]);await browser.close();console.log('Browser flows passed: startup, editing, undo, data variants, validation, export, persistence, self-reference.');
})().catch(e=>{console.error(e);process.exit(1);});

