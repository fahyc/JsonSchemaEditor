# JsonSchemaEditor — Schema Dock

A static HTML/CSS/JavaScript schema and game-data editor. No server-side code, build step, package install, external fonts, or CDN is needed to run it.

## Open it

Double-click `index.html`, or serve this entire folder on any static HTTP host. The supplied RegionResponseV5, EquipmentEffects, and MissionArrivalResponseV8 schemas are included. This app does not write to the game repository or change its original schemas.

`startup.js` is the explicit startup filename list. When served over HTTP(S), those files are fetched from beside `index.html`. When opened from disk, `schemas.bundle.js` supplies the same initial documents because browsers restrict file fetches. After changing the schema files, run `node bundle.cjs` to refresh the offline bundle. Add more filenames to `startup.js` and rerun the bundler to include them offline.

A saved browser workspace takes precedence over startup files. The **?** menu has **Reload startup schemas** to load updated copies. Export your edits first, or use Undo immediately after a reload.

## Schema authoring

- Click any graph node for the full-screen editor. Change field names, types, descriptions, and required flags.
- **Add child object** searches canonical types across all loaded schema files, including the current type. Selecting a type stores a `$ref`. Creating a type adds one `$defs` definition. Self-references and cycles are retained, never expanded recursively into duplicate graph nodes.
- Imported inline objects keep their original JSON Pointer identity. Reference aliases lead to the target's canonical node.
- Use the **Array** checkbox beside a field's type to make a list. While checked, the dropdown edits the item type, including an object reference or enum. Item constraints are preserved when wrapping/unwrapping. Changing the item type preserves array-level constraints; unchecking Array removes its array-level bounds and uniqueness constraints. Rules remains available for nested arrays and tuple schemas.
- Choose **enum** from the type dropdown to open the choices widget, or use **Edit enum** on an existing enum field. Add, remove, edit, and reorder typed choices without writing an enum JSON array. Strings (including empty strings), numbers, booleans, null, and JSON values are supported; duplicate and invalid values cannot be saved.
- **Rules** edits an individual field's full schema JSON. **Rules & constraints** edits object-level keywords, including dictionaries and conditional rules. **Advanced JSON** edits the entire selected schema node without losing keywords.
- The **×** on a schema node previews how many incoming references will be removed, then deletes the node and its referencing fields, aliases, or union variants across loaded schemas. Required lists and shifted union JSON Pointers are repaired. Removing the last choice makes the union unsatisfiable instead of allowing arbitrary data. Schema deletion keeps data drafts; deleting their root schema requires reimporting it before those drafts can validate. Undo restores the whole edit.
- `oneOf` nodes show their variants, with open, add, remove, and JSON-rule controls.
- **All schemas** shows the complete library. The normal view includes the selected schema and external types it references. Drag the canvas (or drag from a node) to pan; use the mouse wheel or trackpad scroll to zoom around the pointer. A normal click still opens a node. **Fit** shows the whole graph; the percentage button returns to 100% and recenters the root. The +/− buttons zoom around the viewport center. Editor forms retain normal scrolling. Hover over a connection for its field label.
- Parent-to-child columns use family spacing: descendants reserve vertical space, siblings stay together, and their parent is centered over the group. Shared types are positioned once under a deterministic primary parent; all other links, self-links, and cycles remain visible. Different documents and disconnected groups have extra separation.
- Export preserves `$defs`, inline structures, `$ref`, descriptions, defaults, and constraints. The app offers separate download buttons for external schema dependencies. Keep the exported schema and its dependencies together.

## Data authoring

1. Choose a schema, then use **+** beside Data Files to create a document, or **Import data** to load JSON and choose its schema.
2. Open a node and fill its declared fields. Required fields are initialized; optional fields stay absent until **Add value** is used. Missing required fields remain visible and can be added. Arrays support add, remove, and reorder.
3. Choose a `oneOf` variant in its instance editor. Switching replaces that instance with the selected variant's required fields/defaults after a confirmation, and can be undone.
4. **Find ID / name** searches all loaded data files, with instance-type and identifier-field filters. It inserts only a string. It never copies an object or creates a shared data node. Array reference fields such as `entryContacts` also support search. Import world/region data alongside mission data to supply cross-document candidates.
5. Schema-defined dictionaries support arbitrary keys constrained by `propertyNames`, with values edited against `additionalProperties`. Other undeclared fields cannot be created in the form editor.
6. Validation reports JSON Pointers and constraints. Click a data error to open the nearest owning node. Invalid imports are retained for repair, including undeclared fields that can be removed. Export and the data JSON editor require valid data.
7. The **×** on a data node removes that instance and its contained children. Confirmation shows the parent link plus matching ID/name reference fields in all loaded data files. Review the selected matches and uncheck ambiguous ones; the count updates. Scalar references are removed as fields, and array references are removed as elements. Ordinary same-valued prose is preserved. Missing required fields appear in Validation. Undo restores the instance and removed references together. Only loaded data files can be checked or changed.

Reference target meanings are not formally encoded in these JSON Schemas. Search uses field names/descriptions to suggest a type and identifier; its visible filters let you correct an ambiguous relationship. External IDs may be typed directly. It does not assert game-world existence or implement engine-only checks described in prose, such as outcome membership, journal event ordering, globally unique IDs, or whether a referenced location exists.

Contained objects remain independent JSON instances in a tree. There is no implicit copy/reuse operation for object-valued data fields.

## Saving

Edits and unfinished data drafts save to browser local storage. Export downloads files; it does not overwrite the originals on disk. Undo/redo is available during the current session. Clearing browser storage removes saved drafts. Browser storage under `file://` can vary by browser, so export work you want to keep. A storage failure is shown in the header.

## Supported schema behavior

The validator is intentionally scoped to these game contracts, with tests against all three supplied schemas. It supports local/cross-file JSON Pointer `$ref`, `$defs`, object/array/scalar types, nullable type arrays, `required`, `additionalProperties` schemas, `propertyNames`, `oneOf`, `anyOf`, `allOf`, `if`/`then`/`else`, `not`, `enum`, `const`, `default` initialization, string length/pattern, numeric bounds, `multipleOf`, array bounds/uniqueness, object property counts, and `prefixItems`.

Object schemas with `type: "object"` default to closed objects in this game's authoring mode. Partial conditional schemas still use normal JSON Schema semantics. Explicitly declared dictionaries remain available. The app is not a general JSON Schema 2020-12 conformance implementation: dynamic references/anchors, `unevaluatedProperties`, `patternProperties`, `contains`, formats, and other unlisted validation keywords are not implemented. Advanced schema JSON is preserved, but unimplemented keywords are not validated. The three bundled schemas use none of those unsupported validation features.

## Development checks

Run the dependency-free contract tests:

```sh
node --test core.test.cjs
node --test layout.test.cjs
node --test editing.test.cjs
```

For browser integration tests, install Playwright in your development environment and run `node browser.test.cjs`. The test uses a headless installed Microsoft Edge, isolated from your normal browser profile. Set `PLAYWRIGHT_MODULE` to a package directory if Playwright is installed outside this project. It exercises startup from disk, schema editing/undo, canonical self-links, data variants, import/export, persistence, cross-file ID search, array references, dictionaries, conditionals, and escaping imported text. It generates `preview.png`.

The production application uses no Playwright or Node dependency.

`node navigation.test.cjs` checks pointer-centered zoom, drag/click separation, editor scrolling, Fit/reset, and keyboard focus. It uses the same Playwright setup and generates layout screenshots.

`node feedback.test.cjs` checks array/reference toggles, typed enum editing, schema/data node deletion, reference counts, cancellation, undo, and persistence with the same Playwright setup.
