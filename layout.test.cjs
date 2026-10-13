const {test}=require('node:test');
const assert=require('node:assert/strict');
const {layoutFamilies}=require('./layout.js');
const C=require('./core.js'),fs=require('node:fs'),path=require('node:path');
const nodes=keys=>keys.map(key=>({key,path:key==='root'?'':'/'+key}));
const edges=pairs=>pairs.map(([from,to])=>({from,to}));
const mid=p=>p.y+p.height/2;
function noOverlap(layout){const cols=new Map();for(const [key,p]of layout.positions){const col=layout.levels.get(key);if(!cols.has(col))cols.set(col,[]);cols.get(col).push(p);}for(const list of cols.values()){list.sort((a,b)=>a.y-b.y);for(let i=1;i<list.length;i++)assert.ok(list[i].y>=list[i-1].y+list[i-1].height+37,'Cards in a column must have a gap');}}
test('uneven families are contiguous and parents are centered on their children',()=>{
  const ns=nodes(['root','a','b','a1','a2','a3','a4','b1']);const es=edges([['root','a'],['root','b'],['a','a1'],['a','a2'],['a','a3'],['a','a4'],['b','b1']]);
  const l=layoutFamilies(ns,es);const p=k=>l.positions.get(k);
  assert.equal(mid(p('a')),(p('a1').y+p('a4').y+p('a4').height)/2);
  assert.equal(mid(p('b')),mid(p('b1')));assert.ok(p('b1').y>p('a4').y+p('a4').height);
  noOverlap(l);assert.deepEqual(layoutFamilies(ns,es),l);
});
test('variable card heights, shared types, self-links and disconnected cycles',()=>{
  const ns=nodes(['root','a','b','shared','x','y']);const es=edges([['root','a'],['root','b'],['a','shared'],['b','shared'],['shared','shared'],['x','y'],['y','x']]);
  const l=layoutFamilies(ns,es,{heights:new Map([['a',370],['b',90],['shared',180]])});
  assert.equal(l.positions.size,ns.length);assert.equal(l.parents.get('shared'),'a');assert.ok(l.positions.get('y').x>l.positions.get('x').x);noOverlap(l);
});
test('deep trees keep their columns instead of collapsing at a depth cap',()=>{
  const ns=nodes(['root',...Array.from({length:15},(_,i)=>String(i))]);const es=edges(ns.slice(1).map((n,i)=>[ns[i].key,n.key]));
  const l=layoutFamilies(ns,es);assert.equal(l.levels.get('14'),15);assert.equal(new Set([...l.positions.values()].map(mid)).size,1);noOverlap(l);
});
test('all three supplied schemas have finite, nonoverlapping canonical positions',()=>{
  const reg=Object.fromEntries(['RegionResponseV5','EquipmentEffects','MissionArrivalResponseV8'].map(n=>[n+'.schema.json',JSON.parse(fs.readFileSync(path.join(__dirname,n+'.schema.json'),'utf8'))]));
  const g=C.index(reg),l=layoutFamilies(g.nodes,g.edges);assert.equal(l.positions.size,g.nodes.length);for(const p of l.positions.values()){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(p.x>=0&&p.y>=0);}noOverlap(l);
});
