// Refresh the offline fallback from the explicit startup list.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'startup.js'),'utf8'),context);
const schemas=Object.fromEntries(context.window.STARTUP_SCHEMA_FILES.map(name=>{
  const file=path.resolve(__dirname,name);
  if(!file.startsWith(__dirname+path.sep))throw Error('Startup schemas must be inside this folder.');
  return [name,JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''))];
}));
const data=(context.window.STARTUP_DATA_FILES||[]).map(entry=>{
  const file=path.resolve(__dirname,entry.file);if(!file.startsWith(__dirname+path.sep))throw Error('Startup data must be inside this folder.');
  return {name:entry.file,schema:entry.schema||null,value:JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''))};
});
fs.writeFileSync(path.join(__dirname,'schemas.bundle.js'),'window.DEFAULT_SCHEMAS = '+JSON.stringify(schemas)+';\nwindow.DEFAULT_DATA_FILES = '+JSON.stringify(data)+';\n');
console.log('Bundled '+Object.keys(schemas).length+' startup schemas and '+data.length+' data examples.');
