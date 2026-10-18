// Stable contracts for regression tests, independent of the editable startup examples.
const fs=require('node:fs'),path=require('node:path');
const names=['RegionResponseV5.schema.json','EquipmentEffects.schema.json','MissionArrivalResponseV8.schema.json'];
const schemas=Object.fromEntries(names.map(name=>[name,JSON.parse(fs.readFileSync(path.join(__dirname,'test-fixtures',name),'utf8'))]));
exports.seed=page=>page.addInitScript(schemas=>{if(!localStorage.getItem('schema-dock.workspace.v1'))localStorage.setItem('schema-dock.workspace.v1',JSON.stringify({schemas,data:[],activeSchema:'RegionResponseV5.schema.json',activeData:null,mode:'schema'}));},schemas);
