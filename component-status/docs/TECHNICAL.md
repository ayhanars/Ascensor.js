# Component Status – Technical notes

Short notes for the person who changes the code later. The plugin is plain
TypeScript and HTML. No framework, no runtime dependency.

## Files

```
manifest.json      plugin manifest; network access: api.figma.com only
src/code.ts        main thread (runs inside Figma, has the document API)
src/ui.html        the window: HTML, CSS and JS in one file
dist/code.js       built from code.ts (npm run build); not committed
samples/           example JSON files in the three formats
docs/              this file and the user guide
```

Build: `npm install`, then `npm run build` (type check + esbuild). `npm run
watch` rebuilds on every change.

## Two sides, one message channel

Figma plugins run in two places. **`code.ts`** can read and write the
document but has no DOM. **`ui.html`** has the DOM (drop zones, fetch,
downloads) but cannot touch the document. They talk with `postMessage`.

Messages from the UI to the main thread (`figma.ui.onmessage` in `code.ts`):

| Message | What the main thread does |
| --- | --- |
| `rescan` | scan all pages again |
| `generate {components, coba, purple, mappings, history, dates}` | build the table |
| `remote-parse {key, fileName, componentSets, components}` | turn REST data into components |
| `resolve-ids {ids}` | find which component contains each node id |
| `changelog-from-selection`, `changelog-find-in-file`, `changelog-clear` | read / forget the change log |
| `save-token`, `save-files`, `save-mappings`, `save-excluded` | persist settings |

Messages from the main thread to the UI (`window.onmessage` in `ui.html`):
`init`, `scan-progress`, `scan-done`, `remote-done`, `ids-resolved`,
`changelog`, `token-saved`, `generate-progress`, `generate-done`, `error`.

Rule of thumb: parsing of Figma things (names, versions, change log rows,
node ids) lives in `code.ts`. Parsing of files the user uploads (JSON, CSV)
lives in `ui.html`.

## Where things are stored

| What | Where | Why |
| --- | --- | --- |
| mappings, excluded components, linked files, change log source | `figma.root.setPluginData(...)` | shared with everyone who opens the file |
| personal access token | `figma.clientStorage` | stays on this computer |

Keys are constants at the top of `code.ts` (`MAPPINGS_KEY`, `EXCLUDED_KEY`,
`FILES_KEY`, `CHANGELOG_KEY`, `TOKEN_KEY`).

## Main thread (`code.ts`) – the important functions

- `scanComponents()` – loads all pages, walks `COMPONENT_SET` and top-level
  `COMPONENT` nodes, skips pages in `SKIPPED_PAGES`, sections in
  `SKIPPED_SECTIONS`, hidden names (`.` or `_`) and variants. Yields to the
  UI every 50 nodes and posts progress every 5.
- `splitNameAndVersion()` + `stripDecorations()` – clean the name, pull the
  version out (`v1.2.0`, `1.2.0`, `v.1.2.0`). `parseVersion()` reads
  `Version:` from the description as fallback; `parseType()` reads `Type:`.
- `parseDescriptionLog()` – version lines in a description become history
  entries.
- `parseChangelogFrames()` – finds rows (`looksLikeChangelogRow`), reads the
  cells by layer name (`textInside`), takes the date from the nearest
  "Published on" text above the row.
- `parseRemote()` – converts REST API components into the same shape; also
  returns a variant → component-set map.
- `resolveNodeIds()` – `getNodeByIdAsync`, then walks up to the containing
  component or set.
- `computeStatus()` – the four statuses. `buildLookups()` merges `generic`
  with each platform.
- `buildClaims()` / `buildAliases()` / `lookupKeys()` – which JSON names a
  component may read: its own name, unless another component claimed it by
  mapping, plus every name mapped to it.
- `generateTable()` – fonts, caption, header, rows in batches of 20,
  history bands, replace the old table (found by plugin data
  `componentStatus = "table"`) at the same position.

Layout note: every cell hugs its content, then `equalizeHeights()` sets all
cells of a row to the row height. This avoids the hug/fill cycle in Auto
Layout.

Constants to change behaviour: `SKIPPED_PAGES`, `SKIPPED_SECTIONS`, `COLUMN`
widths, `COLOR`, `PURPLE_ROW_FILL`, `ROW_BATCH`, fonts in `PRIMARY_FONTS` and
`FALLBACK_FONTS`.

## UI (`ui.html`) – the important functions

- `state` at the top of the script holds everything: scanned components
  (`local`, `remote`, `allComponents`, `components` after the filter),
  files, mappings, excluded ids, change log.
- `applyComponents()` – merges local and remote components, applies the
  "hide without version" filter, renders the list.
- `parseAnnotatedJson()` – accepts the three file formats. Comments and
  `{ version, componentId, api }` objects go into `meta` (per cleaned name:
  `figmaId`, `altIds`, `apis`, `file`, `cleanName`); the data that goes to
  the main thread always has plain string values.
- `validateFile()` – checks brand, platforms, values, `updatedAt`.
- `renderSummary()` – the heart of matching. Order:
  1. For every JSON name, resolve its Figma ids with `componentForFigmaId()`
     (this file, resolved ids from the main thread, linked files and their
     variants). Unknown ids are sent to `resolve-ids`.
  2. Names with no library match, or whose id points elsewhere, go into the
     mapping list. Ids are applied first, then 1:1 names
     (`looseName` equality), then `bestMatch()` suggestions (bigram
     similarity, `SUGGEST_THRESHOLD` = 0.7) which are only offered.
  3. `state.mappings[key]` is the decision (`""` = Ignore). `autoMapped`
     remembers what was chosen automatically so a new id can replace it, but
     a manual choice is kept until **Re-apply Figma-IDs**.
- `persistMappings()`, `persistExcluded()` – save at once on every change.
- `downloadMappingCsv()` / `applyImportedCsv()` – the CSV in and out.
- `loadRemote()` – three REST calls per linked file; the main thread parses.

The list keeps its scroll position across re-renders (`mapUi`).

## Adding things – typical changes

- **New skipped page or section**: add the name to `SKIPPED_PAGES` or
  `SKIPPED_SECTIONS` in `code.ts`. Emojis and markers are ignored.
- **New JSON field**: read it in `flattenEntryObjects()` or `recordKey()` in
  `ui.html`, store it in `meta`, use it in `buildMappingRows()` for the CSV.
- **New status**: add a `StatusKind` and a branch in `computeStatus()`.
- **New column in the table**: add a width in `COLUMN`, a header cell in
  `buildHeader()`, a cell in `buildRow()`, and update `TABLE_WIDTH`.
- **New brand or platform**: `BRANDS` / `PLATFORMS` in `code.ts` and the
  matching lists in `ui.html`; the drop zones are static HTML.

## Testing

There is no test runner in the repo. During development the plugin was
checked with two throw-away harnesses: Playwright opening `src/ui.html` and
posting the same messages the main thread would, and a small Node mock of
the `figma` API running `dist/code.js`. The quickest manual check is: build,
re-import the manifest, run the plugin on a copy of the library with the
sample files in `samples/`.
