# Component Status — Figma plugin

Scans the components of the current Figma library file, takes one JSON file per
platform (iOS and Android) with the versions implemented for the **COBA** and
**Purple** brands, and generates a component status table on the canvas.

Plain TypeScript, no UI framework, no runtime dependencies, no network access.

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

On open the plugin loads every page and collects the library components:

- a **component set** counts once, by its set name (variants are ignored);
- a plain **component** counts only if it is not inside a component set;
- components whose name starts with `.` or `_` are skipped.

For each component it reads the **description** field:

| Line in the description | Result |
| --- | --- |
| `Version: v2.3.0` (also `Version: 2.3.0`) | version, normalised to `vX.Y.Z` |
| `Type: Atom` or `Type: Component` | type |

If there is no `Type:` line, the component is an **Atom** when its page name or
any parent frame name contains "atom", otherwise a **Component**. Components
with no version get a "no version" tag. Duplicate names are kept and listed as
a warning.

### 2 · Upload

Drop (or click to browse) one `.json` file per platform. Both brands live in
the same file:

```json
{
  "platform": "ios",
  "brands": {
    "coba":   { "Button": "v2.3.0", "Select": "v1.5.1", "Date Picker": null },
    "purple": { "Button": "v2.1.0", "Select": "v1.5.0" }
  }
}
```

- `platform` must be `"ios"` or `"android"` and must match the drop zone.
- `brands.coba` and `brands.purple` must be objects. Values are version strings
  or `null`; `null` or a missing key means **Not Started**.
- Names are matched against library components case-insensitively, after
  trimming. A JSON name that matches several library components applies to all
  of them.

Once both files are valid the step shows how many library components were
matched and a collapsible list of JSON names that do not exist in the library
(warnings only).

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
├── manifest.json      Figma plugin manifest (dynamic-page access, no network)
├── package.json       build scripts (esbuild + tsc typecheck)
├── tsconfig.json
├── src/
│   ├── code.ts        main thread: scanning, status logic, table builder
│   └── ui.html        plugin UI with inline CSS/JS
├── samples/
│   ├── ios.json
│   └── android.json
└── dist/code.js       build output (generated, not committed)
```

## Messages between UI and main thread

| Direction | Message |
| --- | --- |
| main → UI | `scan-progress {count}`, `scan-done {components}`, `generate-progress {done, total}`, `generate-done {count}`, `error {message}` |
| UI → main | `generate {components, ios, android}`, `rescan`, `close` |
