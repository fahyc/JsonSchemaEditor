# JsonSchemaEditor — Schema Dock

A static HTML/CSS/JavaScript schema and game-data editor. No server-side code, build step, package install, external fonts, or CDN is needed to run it.

## Open it

Serve this folder on a static HTTP server, for example `python -m http.server 8000`, then open `http://localhost:8000`. The browser version retains the example schemas listed in `startup.js`. Double-clicking `index.html` also supports the browser editor with bundled examples, but installation and native file saving require localhost or HTTPS. The app only writes to files you explicitly open and save.

`startup.js` is the explicit startup filename list. When served over HTTP(S), those files are fetched from beside `index.html`. When opened from disk, `schemas.bundle.js` supplies the same initial documents because browsers restrict file fetches. After changing the schema files, run `node bundle.cjs` to refresh the offline bundle. Add more filenames to `startup.js` and rerun the bundler to include them offline.

A saved browser workspace takes precedence over startup files. The **?** menu has **Reload startup schemas** to load updated copies. Export your edits first, or use Undo immediately after a reload.

## Install as an app

Open the site in desktop Edge or Chrome and choose **Install app** (when offered), or use the browser's app-install menu. Keep the same localhost hostname and port, or the same HTTPS origin, when reopening and updating it. The installed app opens in its own window; multiple files share its sidebar workspace. The manifest registers `.json` file handling. On Windows, use **Open with → Choose another app**, select **Schema Dock JSON Editor**, and choose it as the default for JSON if desired. File association is a Windows/browser installation action, not something the site changes silently. File-handler availability depends on the browser and OS.

The installed app has an independent workspace and starts empty on first use: it does not fetch or load startup examples. **File → Recent files** reopens real files with remembered file handles. Read/write permission may need to be granted again, and moved/deleted files must be located again through **Open JSON**. Open drafts recover on restart; clearing the recent list does not discard open files. Browser mode keeps its existing example startup and does not display the recent-files dropdown. Both modes have the schema-free JSON editor. The launch URL `?app=1` selects the installed workspace explicitly; normal browser visits to `/` use the browser workspace.

After installation and initial offline setup, the application shell works without the local server or an internet connection. Examples are not part of the installed offline shell. AI requests need internet access. Serve the site again to receive updates; **Update ready · Reload** activates a waiting update after confirmation. Changes to the offline shell must increment the cache version in `sw.js`. OpenAI requests, API keys, user documents, and example JSON files are not cached by the service worker.

## Open files and schema-free JSON

Use **File → Open JSON**, **Ctrl+O**, the **Open JSON files** button, or Windows file opening. Select several files at once to load their schemas and data into one workspace. Schemas are registered before data is matched, so dependencies opened in the same batch are available. An already-open file handle focuses its existing sidebar document instead of making another copy. Different files with the same schema filename require a replacement confirmation, since schema references use canonical filenames.

Schema filenames and JSON Schema dialect declarations identify schemas. Documents with suggestive but ambiguous schema fields prompt for their kind. Otherwise a unique compatible open schema is assigned when possible; unmatched data goes under **JSON Files · No Schema**. **Choose schema** attaches/removes a schema later, and **File → Change document kind** corrects schema/data classification. Missing schema dependencies stay visible as validation issues; the browser cannot silently read neighboring files without access, so open those files together (or reopen their previously granted handles from Recent files).

The **+** beside JSON Files creates a blank JSON object. Its node editor supports property creation/renaming/removal, empty property names, escaped names, arbitrary JSON types, nested objects/arrays, heterogeneous array items, and reordering. Object/array children remain nodes. Scalars and null can also be root documents. **JSON** edits source text. Malformed opened JSON retains its original source for correction instead of being discarded; syntax must be fixed before disk saving. Schema-free documents receive syntax checks, with no schema property restrictions or game-specific reference inference. Saving formats JSON with two-space indentation; exact whitespace and arbitrary-precision numbers are not preserved by the JavaScript value editor. JSONC/JSON5 and large-file virtualization are outside this version.

## Schema authoring

- Click any graph node for the full-screen editor. Change field names, types, descriptions, and required flags.
- **Add child object** searches canonical types across all loaded schema files, including the current type. Selecting a type stores a `$ref`. Creating a type adds one `$defs` definition. Self-references and cycles are retained, never expanded recursively into duplicate graph nodes.
- Imported inline objects keep their original JSON Pointer identity. Reference aliases lead to the target's canonical node.
- Use the **Array** checkbox beside a field's type to make a list. While checked, the dropdown edits the item type, including an object reference or enum. Item constraints are preserved when wrapping/unwrapping. Changing the item type preserves array-level constraints; unchecking Array removes its array-level bounds and uniqueness constraints. Rules remains available for nested arrays and tuple schemas.
- Choose **enum** from the type dropdown to open the choices widget, or use **Edit enum** on an existing enum field. Add, remove, edit, and reorder typed choices without writing an enum JSON array. Strings (including empty strings), numbers, booleans, null, and JSON values are supported; duplicate and invalid values cannot be saved.
- **Rules** edits an individual field's full schema JSON. **Rules & constraints** edits object-level keywords, including dictionaries and conditional rules. **Advanced JSON** edits the entire selected schema node without losing keywords.
- The **×** on a schema node previews how many incoming references will be removed, then deletes the node and its referencing fields, aliases, or union variants across loaded schemas. Required lists and shifted union JSON Pointers are repaired. Removing the last choice makes the union unsatisfiable instead of allowing arbitrary data. Schema deletion keeps data drafts; deleting their root schema requires reimporting it before those drafts can validate. Undo restores the whole edit.
- `oneOf` nodes show their variants, with open, add, remove, and JSON-rule controls.
- **All schemas** shows the complete library. The normal view includes the selected schema and external types it references. Drag empty canvas space to pan; drag a node to move that node, with its connections following it. Use the mouse wheel or trackpad scroll to zoom around the pointer. A normal click still opens a node. **Fit** includes manually moved nodes; the percentage button returns to 100% and recenters the root. **Auto layout** restores the family layout for visible nodes. Manual positions are remembered separately from document contents, independently for browser and installed workspaces. The +/− buttons zoom around the viewport center. Editor forms retain normal scrolling. Hover over a connection for its field label.
- Hover over a node (or focus it with the keyboard) for a larger, scrollable summary. Data previews show fields beyond the compact card, longer strings, and bounded nested-value previews. Schema previews include field types, descriptions, required flags and enum choices. Escape hides the summary. Moving/zooming the graph or opening an editor also dismisses it.
- Parent-to-child columns use family spacing: descendants reserve vertical space, siblings stay together, and their parent is centered over the group. Shared types are positioned once under a deterministic primary parent; all other links, self-links, and cycles remain visible. Different documents and disconnected groups have extra separation.
- Export preserves `$defs`, inline structures, `$ref`, descriptions, defaults, and constraints. The app offers separate download buttons for external schema dependencies. Keep the exported schema and its dependencies together.

## Data authoring

1. Choose a schema, then use **+** beside Data Files to create a document, or **Import data** to load JSON and choose its schema.
2. Open a node and fill its declared fields. Required fields are initialized; optional fields stay absent until **Add value** is used. Missing required fields remain visible and can be added. Arrays support add, remove, and reorder.
3. Choose a `oneOf` variant in its instance editor. Switching replaces that instance with the selected variant's required fields/defaults after a confirmation, and can be undone.
4. **Find ID / name** searches all loaded data files, with instance-type and identifier-field filters. It inserts only a string. It never copies an object or creates a shared data node. Array reference fields such as `entryContacts` also support search. Import world/region data alongside mission data to supply cross-document candidates.
5. Schema-defined dictionaries support arbitrary keys constrained by `propertyNames`, with values edited against `additionalProperties`. Other undeclared fields cannot be created in the form editor.
6. Validation reports JSON Pointers and constraints. Click a data error to open the nearest owning node. Invalid imports and source edits are retained for repair, including undeclared fields that can be removed. Saving/exporting valid JSON that violates its schema requires an explicit warning confirmation.
7. The **×** on a data node removes that instance and its contained children. Confirmation shows the parent link plus matching ID/name reference fields in all loaded data files. Review the selected matches and uncheck ambiguous ones; the count updates. Scalar references are removed as fields, and array references are removed as elements. Ordinary same-valued prose is preserved. Missing required fields appear in Validation. Undo restores the instance and removed references together. Only loaded data files can be checked or changed.

Reference target meanings are not formally encoded in these JSON Schemas. Search uses field names/descriptions to suggest a type and identifier; its visible filters let you correct an ambiguous relationship. External IDs may be typed directly. It does not assert game-world existence or implement engine-only checks described in prose, such as outcome membership, journal event ordering, globally unique IDs, or whether a referenced location exists.

Contained objects remain independent JSON instances in a tree. There is no implicit copy/reuse operation for object-valued data fields.

## Saving

Edits and unfinished drafts recover from local storage, separately for browser and installed workspaces. That is different from saving a physical file: the sidebar dot and header report unsaved file changes. **Save / Ctrl+S** writes to the original file handle; a new/imported document gets a native Save dialog. **Save As / Ctrl+Shift+S** chooses another file. In the installed PWA, **Export…** also uses the native Save dialog and binds the chosen file to the document: subsequent Ctrl+S writes to that exported file. In browser mode, **Export** retains its ordinary download behavior. Browsers without native file access fall back to downloading a copy and cannot claim to have overwritten the source. Ordinary browser downloads do not expose writable handles; reopen an existing downloaded copy via **Open JSON** to bind it. Diagnostic response-dump downloads remain separate from editor documents. The legacy **Import schemas/data** inputs import copies; **Open JSON** preserves native handles for saving in place.

Schema validation issues require confirmation before saving, while malformed JSON must be corrected first. An open JSON source modal is applied before Ctrl+S; active field edits are committed before capturing the save value. External file changes trigger a separate overwrite confirmation. Save As for a schema updates its canonical filename and loaded references/data associations; affected dependent documents become unsaved and must also be saved. Keep referenced files beside each other on disk. Close individual files through **File → Close current file**; unsaved files require confirmation. Undo/redo remains available within the session.

Recent file handles and disk baselines use IndexedDB, while workspace values use local storage. Clearing site data removes recovery drafts and recent handles, but does not delete the files on disk. The app cannot guarantee protection from another program changing a file in the small interval between its pre-save check and write.

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

For browser integration tests, install Playwright in your development environment and run `node browser.test.cjs`. The test uses a headless installed Microsoft Edge, isolated from your normal browser profile. Set `PLAYWRIGHT_MODULE` to a package directory if Playwright is installed outside this project. It exercises startup from disk, schema editing/undo, canonical self-links, data variants, import/export, persistence, cross-file ID search, array references, dictionaries, optional journal fields, and escaping imported text. It generates `preview.png`.

The production application uses no Playwright or Node dependency.

`node --test documents.test.cjs` checks schema detection, matching, schema-free graph roots, property names, and Save As reference repair. `node pwa-browser.test.cjs` runs an isolated localhost server and headless Edge to exercise simulated OS launch batches with real browser file handles, native saving, schema warnings, recent-file restoration, source repair, external-change cancellation, browser/installed startup separation, and offline reload. The actual Windows installation/default-association UI is a manual check. Stable legacy regression schemas live under `test-fixtures/`; they are not loaded by the app or included in its offline cache.

## AI data generation

Click **Generate with AI**, enter an OpenAI API key, and click **Load / refresh text models** to populate the model dropdown from your account. The Models API does not report modality or endpoint compatibility, so the list uses a name-based filter for GPT/chat/reasoning text families (including fine-tuned variants), excluding image, audio, embedding, moderation, and specialized search models. **Enter model ID manually** is available if the filter misses a model or listing is unavailable. The selected model must support the Responses API with JSON mode.

Choose the required schema, select any open reference data files, and enter your prompt. **Preview outgoing prompt** shows exactly what content will be sent: checked JSON data files (without their schemas), the target schema and its transitive dependencies, then your prompt. Missing schema references stop the request before it is sent.

**Generation options** provides thinking effort (`reasoning.effort`), text verbosity (`text.verbosity`), and maximum output tokens (`max_output_tokens`, including reasoning and visible output). Blank/default settings are omitted from the request. Accepted options vary by model; use the model default if an explicit setting is rejected. See the official [reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) and [model-list API](https://developers.openai.com/api/reference/resources/models/methods/list).

**API response history** retains each model-list and generation attempt until page reload or **Clear history**. It includes the full received response text before parsing, HTTP status, available response headers, and any local error or validation issues. Failures automatically expand the panel. Select an earlier attempt or **Download response dump** to inspect or save it. Malformed JSON, HTML error pages, refusals and incomplete output are preserved. Network failures/cancellation may provide no response body. API keys echoed by the service are redacted; request authorization headers are never recorded. History is not saved in browser storage.

Generation uses the OpenAI Responses API with `store: false` and JSON mode. It does not restrict your game schemas to OpenAI's strict Structured Outputs subset. Returned data is validated using the editor's existing validator and its documented supported keywords. Valid data becomes a new editable data file; use **Export** to download it. Invalid results show validation errors and may be opened explicitly as drafts. Regeneration requires another click and may incur another API charge. Cancel stops waiting for the request; it may not stop work or billing already underway at the provider.

The API key stays in page memory, is sent only in the authorization header, and is never saved in workspace storage or included in the prompt. Reloading clears it. This static prototype calls OpenAI directly from the browser and requires internet access; shared production deployments should keep credentials behind a backend. Model availability, permissions, rate limits, and browser/network restrictions may cause requests to fail; errors appear in the generation screen. Settings and selected context persist only while the page stays open.

Run `node --test ai.test.cjs` for prompt ordering, dependencies, model filtering, options, raw response retention, and failure handling. Run `node ai-browser.test.cjs` using the Playwright setup above for mocked model loading, generation, options, draft editing, context selection, response-history downloads, malformed responses, network failures, and credential-storage isolation. No real API key is used by these tests. The browser test writes `ai-preview.png`.

`node navigation.test.cjs` checks pointer-centered zoom, drag/click separation, editor scrolling, Fit/reset, and keyboard focus. It uses the same Playwright setup and generates layout screenshots.

`node graph-browser.test.cjs` checks expanded schema/data summaries, escaped user text, tooltip placement, zoom-correct node dragging, stationary siblings/camera, and click-to-edit behavior. The navigation suite also checks live link updates, persisted manual positions, Auto layout reset, and document-content preservation. The PWA suite verifies Export followed by Ctrl+S writes to the same selected file without another picker.

`node feedback.test.cjs` checks array/reference toggles, typed enum editing, schema/data node deletion, reference counts, cancellation, undo, and persistence with the same Playwright setup.
