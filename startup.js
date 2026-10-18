// These files are loaded automatically when served over HTTP(S).
// The bundled copies also make double-click / file:// startup work offline.
window.STARTUP_SCHEMA_FILES = [
  'project.schema.json',
  'person.schema.json',
  'task.schema.json'
];
window.STARTUP_DATA_FILES = [
  {file:'project.example.json',schema:'project.schema.json'},
  {file:'notes.example.json',schema:null}
];
