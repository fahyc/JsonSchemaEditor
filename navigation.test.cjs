const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await require('./test-fixtures.cjs').seed(page);
  await page.goto('file:///'+path.join(__dirname,'index.html').replace(/\\/g,'/'));await page.waitForSelector('.node');
    const camera=()=>page.evaluate(()=>{const m=new DOMMatrix(getComputedStyle(document.querySelector('#graph')).transform);return {x:m.e,y:m.f,z:m.a};});
    const bounds=await page.locator('#canvas').boundingBox();
    const pointer={x:Math.round(bounds.x+bounds.width*.65),y:Math.round(bounds.y+bounds.height*.4)};
    const before=await camera();await page.mouse.move(pointer.x,pointer.y);await page.mouse.wheel(0,-200);
    await page.waitForFunction(z=>new DOMMatrix(getComputedStyle(document.querySelector('#graph')).transform).a>z,before.z);
    const after=await camera(),px=pointer.x-bounds.x,py=pointer.y-bounds.y;
    assert.ok(after.z>before.z);assert.ok(Math.abs((px-before.x)/before.z-(px-after.x)/after.z)<.01);assert.ok(Math.abs((py-before.y)/before.z-(py-after.y)/after.z)<.01);
    // Dragging a card moves only that node, updates edges, and preserves file content.
    await page.locator('#zoom-reset').click();const card=await page.locator('.node-root').first().boundingBox();const start={x:card.x+80,y:card.y+35};
    const panBefore=await camera(),oldNode=await page.locator('.node-root').first().evaluate(e=>({x:parseFloat(e.style.left),y:parseFloat(e.style.top)})),oldEdge=await page.locator('#edges path[marker-end]').first().getAttribute('d'),beforeData=await page.evaluate(()=>localStorage.getItem('schema-dock.workspace.v1'));await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+120,start.y+75,{steps:8});await page.mouse.up();
    const panAfter=await camera();assert.deepEqual(panAfter,panBefore);const moved=await page.locator('.node-root').first().evaluate(e=>({x:parseFloat(e.style.left),y:parseFloat(e.style.top)}));assert.ok(Math.abs(moved.x-oldNode.x-120)<1);assert.ok(Math.abs(moved.y-oldNode.y-75)<1);assert.notEqual(await page.locator('#edges path[marker-end]').first().getAttribute('d'),oldEdge);assert.equal(await page.evaluate(()=>localStorage.getItem('schema-dock.workspace.v1')),beforeData);assert.equal(await page.locator('#editor').evaluate(e=>e.open),false);
    await page.locator('.node-root').first().click();assert.equal(await page.locator('#editor').evaluate(e=>e.open),true);
    const editorZoom=await camera();await page.mouse.move(1000,700);await page.mouse.wheel(0,300);assert.deepEqual(await camera(),editorZoom);await page.locator('#close-editor').click();
    // Background dragging supports both axes and doesn't alter persisted data.
    const stored=await page.evaluate(()=>localStorage.getItem('schema-dock.workspace.v1'));
    const backgroundBefore=await camera();await page.mouse.move(bounds.x+10,bounds.y+10);await page.mouse.down();await page.mouse.move(bounds.x+70,bounds.y+55,{steps:5});await page.mouse.up();const backgroundAfter=await camera();assert.ok(Math.abs(backgroundAfter.x-backgroundBefore.x-60)<1);assert.ok(Math.abs(backgroundAfter.y-backgroundBefore.y-45)<1);assert.equal(await page.evaluate(()=>localStorage.getItem('schema-dock.workspace.v1')),stored);
    await page.locator('#zoom-fit').click();const fit=await camera();assert.ok(fit.z<1);
    const allInside=await page.locator('.node').evaluateAll(els=>{const b=document.querySelector('#canvas').getBoundingClientRect();return els.every(e=>{const r=e.getBoundingClientRect();return r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;});});assert.ok(allInside);
    await page.screenshot({path:path.join(__dirname,'layout-overview.png')});
    await page.locator('#zoom-reset').click();assert.equal((await camera()).z,1);await page.screenshot({path:path.join(__dirname,'preview.png')});
    const offscreen=page.locator('.node').filter({hasText:'Faction'}).first();await offscreen.focus();
    assert.deepEqual(await page.locator('#canvas').evaluate(e=>[e.scrollLeft,e.scrollTop]),[0,0]);
    const focused=await offscreen.boundingBox();assert.ok(focused.x+focused.width>bounds.x&&focused.x<bounds.x+bounds.width&&focused.y+focused.height>bounds.y&&focused.y<bounds.y+bounds.height);
    await page.reload();await page.waitForSelector('.node-root');assert.equal(await page.locator('.node-root').first().evaluate(e=>parseFloat(e.style.left)),moved.x);await page.locator('#layout-reset').click();assert.equal(await page.locator('.node-root').first().evaluate(e=>parseFloat(e.style.left)),oldNode.x);
    // A small imbalanced tree makes the new family alignment easy to inspect.
    const sample={type:'object',properties:{fleet:{$ref:'#/$defs/Fleet'},port:{$ref:'#/$defs/Port'}},$defs:{Fleet:{type:'object',properties:{captain:{$ref:'#/$defs/Captain'},ship:{$ref:'#/$defs/Ship'},crew:{$ref:'#/$defs/Crew'}}},Port:{type:'object',properties:{market:{$ref:'#/$defs/Market'}}},Captain:{type:'object',properties:{name:{type:'string'}}},Ship:{type:'object',properties:{hull:{type:'integer'}}},Crew:{type:'object',properties:{role:{type:'string'}}},Market:{type:'object',properties:{stock:{type:'integer'}}}}};
    await page.locator('#schema-files').setInputFiles({name:'Family.schema.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sample))});await page.waitForFunction(()=>document.querySelector('#page-title').textContent==='Family');
    await page.locator('#zoom-fit').click();await page.screenshot({path:path.join(__dirname,'family-layout.png')});
    assert.deepEqual(errors,[]);console.log('Navigation passed: cursor-centered wheel zoom, node/background drag, click editing, modal scrolling, Fit, root reset, and data preservation.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

