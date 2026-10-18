const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\//,'')||'index.html';const file=path.resolve(__dirname,name);if(!file.startsWith(__dirname+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,body)=>{if(e){res.writeHead(404).end();return;}const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.webmanifest':'application/manifest+json','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(body);});});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(()=>{Object.defineProperty(window,'launchQueue',{value:{setConsumer(fn){window.testLaunch=fn;}},configurable:true});});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(origin+'/?app=1');await page.waitForFunction(()=>window.WorkspaceFiles);
    assert.equal(await page.locator('#schema-list .file-item').count(),0);assert.equal(await page.locator('#recent-files').count(),1);const cdp=await context.newCDPSession(page);const manifest=await cdp.send('Page.getAppManifest');assert.deepEqual(manifest.errors,[]);assert.equal(JSON.parse(manifest.data).file_handlers[0].launch_type,'single-client');
    await page.evaluate(async()=>{
      const dir=await navigator.storage.getDirectory();window.testFiles={};
      for(const [name,value]of Object.entries({'child.schema.json':{type:'object',properties:{count:{type:'number'}},required:['count'],additionalProperties:false},'root.schema.json':{type:'object',properties:{child:{$ref:'child.schema.json'}},required:['child'],additionalProperties:false},'data.json':{child:{count:2}},'loose.json':{a:'hello',nested:[null,4]}})){
        const handle=await dir.getFileHandle(name,{create:true});const writer=await handle.createWritable();await writer.write(JSON.stringify(value));await writer.close();testFiles[name]=handle;
      }
      await testLaunch({files:[testFiles['data.json'],testFiles['child.schema.json'],testFiles['root.schema.json'],testFiles['loose.json']]});
    });
    await page.waitForFunction(()=>document.querySelectorAll('#schema-list .file-item').length===2&&document.querySelectorAll('#json-list .file-item').length===1);
    assert.equal(await page.locator('#data-list .file-item').count(),1);
    await page.locator('#json-list .file-item').click();await page.locator('.node-root').click();
    await page.getByRole('textbox',{name:'a',exact:true}).fill('changed');await page.getByRole('textbox',{name:'a',exact:true}).press('Tab');
    await page.keyboard.press('Control+s');await page.waitForFunction(async()=>JSON.parse(await (await testFiles['loose.json'].getFile()).text()).a==='changed');
    await page.locator('#free-add').click();await page.locator('#free-name').fill('new');await page.locator('#free-create').click();
    const newRow=page.locator('[data-free]').filter({has:page.locator('input[value="new"]')});await newRow.locator('.free-type').selectOption('array');await newRow.locator('.child-button').click();await page.locator('#free-add').click();assert.equal(await page.locator('.free-row').count(),1);
    await page.locator('.free-row .free-type').selectOption('boolean');await page.locator('#close-editor').click();
    // Source replacement supports scalar and null roots, and keyboard save applies it first.
    await page.locator('#json-view').click();await page.locator('#json-edit').fill('null');await page.keyboard.press('Control+s');await page.waitForFunction(async()=>await (await testFiles['loose.json'].getFile()).text()==='null\n');
    await page.locator('.node-root').click();assert.equal(await page.locator('#free-root-type').inputValue(),'null');await page.locator('#close-editor').click();
    // Invalid schema data can be edited, but saving requires explicit acknowledgement.
    await page.locator('#data-list .file-item').click();await page.locator('#json-view').click();await page.locator('#json-edit').fill('{"child":{"count":"invalid"}}');await page.locator('#json-apply').click();await page.keyboard.press('Control+s');await page.locator('#file-yes').waitFor();await page.locator('#file-yes').click();await page.locator('#naming-save-anyway').click();await page.waitForFunction(async()=>JSON.parse(await (await testFiles['data.json'].getFile()).text()).child.count==='invalid');
    await page.waitForFunction(()=>!document.querySelector('#save-file').disabled);
    // OS repeated-open focuses the existing document; it does not duplicate it.
    await page.evaluate(()=>WorkspaceFiles.openHandles([testFiles['data.json']]));assert.equal(await page.locator('#data-list .file-item').count(),1);
    await page.locator('#file-menu summary').click();assert.equal(await page.locator('#recent-files option').count(),5);await page.locator('#file-menu summary').click();
    await page.reload();await page.waitForFunction(()=>window.WorkspaceFiles);await page.evaluate(()=>WorkspaceFiles.ready);assert.equal(await page.locator('#schema-list .file-item').count(),2);assert.equal(await page.locator('#recent-files option').count(),5);
    // A new installed workspace reopens actual recent handles after clearing only its workspace.
    await page.evaluate(()=>localStorage.removeItem('schema-dock.workspace.pwa.v1'));await page.reload();await page.waitForFunction(()=>window.WorkspaceFiles);await page.evaluate(()=>WorkspaceFiles.ready);assert.equal(await page.locator('#schema-list .file-item').count(),0);
    await page.locator('#file-menu summary').click();await page.locator('#recent-files').selectOption({label:'data.json · data'});await page.waitForFunction(()=>document.querySelectorAll('#data-list .file-item').length===1);assert.equal(await page.locator('#schema-list .file-item').count(),2);
    // Browser keeps example startup and does not show the installed recent menu.
    const tab=await context.newPage();tab.on('pageerror',e=>errors.push(e.message));await tab.goto(origin+'/');await tab.waitForFunction(()=>window.WorkspaceFiles&&document.querySelectorAll('#schema-list .file-item').length===3);assert.equal(await tab.locator('#recent-files').count(),0);
    // Save As preserves the original recent record and repairs loaded references.
    await page.evaluate(async()=>{const dir=await navigator.storage.getDirectory();testFiles=window.testFiles||{};testFiles.copy=await dir.getFileHandle('renamed-child.schema.json',{create:true});window.testPickerCount=0;window.showSaveFilePicker=async()=>{window.testPickerCount++;return testFiles.copy;};});
    await page.locator('#schema-list [data-file="child.schema.json"]').click();await page.locator('#export').click();await page.waitForFunction(()=>document.querySelector('[data-file="renamed-child.schema.json"]'));await page.waitForFunction(()=>!document.querySelector('#save-file').disabled);
    await page.locator('#json-view').click();const exported=JSON.parse(await page.locator('#json-edit').inputValue());exported.description='Saved after export';await page.locator('#json-edit').fill(JSON.stringify(exported));await page.keyboard.press('Control+s');await page.waitForFunction(()=>!document.querySelector('#save-file').disabled);assert.equal(await page.evaluate(()=>testPickerCount),1);assert.equal(await page.evaluate(async()=>JSON.parse(await (await testFiles.copy.getFile()).text()).description),'Saved after export');
    await page.locator('#schema-list [data-file="root.schema.json"]').click();await page.locator('#json-view').click();assert.equal(JSON.parse(await page.locator('#json-edit').inputValue()).properties.child.$ref,'renamed-child.schema.json#');await page.locator('#json-cancel').click();
    await page.locator('#file-menu summary').click();assert.equal(await page.locator('#recent-files option').count(),6);await page.locator('#file-menu summary').click();
    // Malformed JSON remains available for correction instead of being discarded.
    await page.evaluate(async()=>{const dir=await navigator.storage.getDirectory(),handle=await dir.getFileHandle('broken.json',{create:true});const w=await handle.createWritable();await w.write('{"broken":');await w.close();await WorkspaceFiles.openHandles([handle]);});
    await page.locator('#json-list [data-json]').filter({hasText:'broken.json'}).click();await page.locator('.node-root').click();await page.locator('#raw-json-source').fill('{"repaired":true}');await page.keyboard.press('Control+s');await page.waitForFunction(async()=>{const h=await (await navigator.storage.getDirectory()).getFileHandle('broken.json');try{return JSON.parse(await (await h.getFile()).text()).repaired===true;}catch{return false;}});await page.locator('#close-editor').click();
    // External modifications require confirmation; cancelling leaves disk untouched.
    await page.locator('#json-view').click();await page.locator('#json-edit').fill('{"mine":1}');await page.locator('#json-apply').click();
    await page.evaluate(async()=>{const h=await (await navigator.storage.getDirectory()).getFileHandle('broken.json'),w=await h.createWritable();await w.write('{"external":1}');await w.close();});
    await page.keyboard.press('Control+s');await page.locator('#file-no').click();assert.equal(await page.evaluate(async()=>JSON.parse(await (await (await (await navigator.storage.getDirectory()).getFileHandle('broken.json')).getFile()).text()).external),1);
    // Cache the shell, then verify an offline installed launch does not fetch examples.
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>window.WorkspaceFiles);await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.WorkspaceFiles);assert.equal(await page.locator('#json-list').count(),1);await context.setOffline(false);
    await page.screenshot({path:path.join(__dirname,'pwa-preview.png')});assert.deepEqual(errors,[]);
    console.log('PWA browser tests passed: separate startup, launch batch, dependencies, free JSON, native save / Save As, validation warning, recents, malformed JSON recovery, external-change protection, offline.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
