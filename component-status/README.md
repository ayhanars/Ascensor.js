# Component Status — Figma plugin

Scans the components of the current Figma library file, takes one JSON file per
brand (**COBA** and **Purple**) with the versions implemented on iOS and
Android, and generates a component status table on the canvas.

Plain TypeScript, no UI framework, no runtime dependencies. The only network
access is to the Figma API, and only when you link other library files.

## Install

1. Build the plugin:

   ```sh
   cd component-status
   npm install
   npm run build
   ```

   This bundles `src/code.ts` into `dist/code.js`. The UI is `src/ui.html` and is
   loaded directly by the manifest.

2. In the Figma desktop app open any file, then go to
   **Plugins → Development → Import plugin from manifest…** and pick
   `component-status/manifest.json`.

3. Run **Plugins → Development → Component Status** inside your library file.

While developing, `npm run watch` rebuilds `dist/code.js` on every change. Use
**Plugins → Development → Hot reload plugin** (or re-run the plugin) to pick the
change up.

## How it works

The plugin window has three steps on one scrolling screen. Later steps unlock
as earlier ones complete.

### 1 · Components (automatic)

On open the plugin loads every page and collects the library components, with a
live counter and the page currently being scanned. These pages are skipped
(emojis, markers such as `▸` or `🟣`, and extra spaces are ignored, so
`🟣 WIP Purple` and `WIP Purple` both match): **WIP**, **WIP Purple**,
**File template assets**, **Annotations**, **Text Resizing & Landscape** and
**Local components**. The list lives in `SKIPPED_PAGES` in `src/code.ts`.

- a **component set** counts once, by its set name (variants are ignored);
- a plain **component** counts only if it is not inside a component set;
- components whose name starts with `.` or `_` are skipped.

Component names are cleaned for the table: emojis are removed and a version
token in the name (`🔵 Button v2.3.0`, `Card (1.2.0)`, `Modal - v2.0.0`) is
moved into the Version column, leaving `Button`, `Card`, `Modal`. The cleaned
name is what JSON names are matched against. The original Figma name is shown
as a tooltip in the list. Accepted version styles: `v2.3.0`, `2.3.0`, `v.2.3.0`.

Components whose name contains "purple" get a light purple row background in
the table and in the Step 1 list.

If the name has no version, the plugin reads the **description** field:

| Line in the description | Result |
| --- | --- |
| `Version: v2.3.0` (also `Version: 2.3.0` or `Version: v.2.3.0`) | version, normalised to `vX.Y.Z` |
| `Type: Atom` or `Type: Component` | type |

If there is no `Type:` line, the component is an **Atom** when its page name or
any parent frame name contains "atom", otherwise a **Component**. Components
with no version get a "no version" tag. Duplicate names are kept and listed as
a warning.

#### Other library files

A plugin can only read the file it runs in, so other files (an atoms library,
for example) are scanned through the Figma REST API:

1. Click **Set token** and paste a personal access token
   (Figma → Settings → Security → Personal access tokens, scope
   *File content: read*). It is stored with `figma.clientStorage`, on your
   computer only, never in the file.
2. Paste a file link (or file key) and click **Add**. The plugin fetches the
   file's published component sets and components, applies the same page
   skipping, name cleaning and version rules, and merges them into the list.

Remote components show their file name next to the type, in the list and in
the table, and their **Go to Component →** button opens the component in its
own file. Linked files are remembered on the current document so they reload
on the next run. The API lists **published** components only; unpublished
ones in the other file are not visible to it.

#### Change log sub-rows

The table can show the history of every component as sub-rows (version,
date, change type, description), newest first. Two sources are combined:

- **The change log table on the canvas.** Select its frame(s) once and click
  **Use selection as change log**. Every layer named "Change log Row" is read
  through its text layers (`Name`, `version`, the Status cell text,
  `Description`) and the nearest "Published on dd.mm.yyyy" text above it gives
  the date. The frames are remembered on the document and re-read on the next
  run; **Clear** forgets them.
- **Version lines in component descriptions**, for older history:

  ```
  v1.2.0 - Added outlined variant
  1.1.0 (12.03.2024) Fixed padding
  ```

  A line starting with a version starts an entry; following lines without a
  version continue it. `Version:` and `Type:` lines are ignored.

When both sources have the same version the change log entry wins. Step 3 has
a checkbox to include the sub-rows and a "last N versions" limit (0 = all).

### 2 · Upload

Drop (or click to browse) one `.json` file per brand. Both platforms live in
the same file:

```json
{
  "brand": "coba",
  "platforms": {
    "ios":     { "Button": "v2.3.0", "Select": "v1.5.1", "Date Picker": null },
    "android": { "Button": "v2.3.0", "Select": "v1.4.0" }
  }
}
```

- `brand` must be `"coba"` or `"purple"` and must match the drop zone.
- `platforms.ios` and `platforms.android` must be objects. Values are version
  strings or `null`; `null` or a missing key means **Not Started**.
- Names are matched against library components case-insensitively, after
  trimming. A JSON name that matches several library components applies to all
  of them.

Once both files are valid the step shows how many library components were
matched and a list of JSON names that do not exist in the library. Each of
those gets a **manual mapping** dropdown: pick the library component the JSON
name belongs to, or leave it on *Ignore*. Names that differ only by spacing or
punctuation (`DatePicker` vs `Date Picker`) are pre-selected. Mappings are
saved on the Figma file, so they are restored the next time the plugin runs.

Sample files live in [`samples/`](samples).

### 3 · Generate

**Generate table** builds the table on the current page with Auto Layout only.
Status per component × brand × platform:

| Condition | Status |
| --- | --- |
| implemented is `null` or missing | ○ Not Started |
| implemented equals the library version (or the library has no version) | ● Implemented |
| anything else | ◐ Update available, with `on vX.Y.Z` underneath |

Each row stores the component id as plugin data, and the **Go to Component →**
button is a node hyperlink: clicking it in Figma jumps to the component.

Regenerating finds the previous table on the page (by plugin data) and replaces
it in place, keeping its position. Rows are built in batches so large libraries
do not freeze Figma.

Fonts: IBM Plex Sans / IBM Plex Mono, falling back to Inter / Roboto Mono if
they cannot be loaded.

## Project layout

```
component-status/
├── manifest.json      Figma plugin manifest (dynamic-page access, api.figma.com only)
├── package.json       build scripts (esbuild + tsc typecheck)
├── tsconfig.json
├── src/
│   ├── code.ts        main thread: scanning, status logic, table builder
│   └── ui.html        plugin UI with inline CSS/JS
├── samples/
│   ├── coba.json
│   └── purple.json
└── dist/code.js       build output (generated, not committed)
```

## Messages between UI and main thread

| Direction | Message |
| --- | --- |
| main → UI | `init {token, remoteFiles}`, `scan-progress {count, scanned, total, pageName}`, `scan-done {components, skippedPages, mappings}`, `remote-done {key, fileName, components, skippedPages}`, `changelog {entries, rows, frames}`, `token-saved {hasToken}`, `generate-progress {done, total}`, `generate-done {count}`, `error {message}` |
| UI → main | `generate {components, coba, purple, mappings, history}`, `rescan`, `changelog-from-selection`, `changelog-clear`, `remote-parse {key, fileName, componentSets, components}`, `save-token {token}`, `save-files {files}`, `close` |
