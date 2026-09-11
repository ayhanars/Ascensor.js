# Screen Component Inspector (Figma Plugin — MVP)

A local, offline Figma plugin that inspects a selected screen/frame and
lists the design-system components and atoms it contains, aggregated by
usage count and classified via tags in each component's description.

This is an inspector only — it reads data from Figma and never modifies
your document.

## What it does

1. You select a frame (a "screen") in Figma and run the plugin.
2. It walks every component instance nested inside that frame.
3. Instances are grouped by their **underlying Figma component**, not by
   instance/layer name — two instances named "Button" that point at two
   different components are kept separate; four instances of the same
   component are collapsed into one row with a `× 4` count.
4. Each component's description is read (never written) and scanned for:
   - `[ds-component]` → classified as **DS Component**
   - `[ds-atom]` → classified as **DS Atom**
   - neither → **Unclassified**
5. Each row can be expanded to show the detected tags, the full raw
   description, and any documentation links attached to the component.
6. The header shows the screen's name and a direct link to it in Figma.

The list re-analyzes automatically whenever your selection changes while
the plugin is open, and has a manual "Refresh" button for re-reading a
description you just edited.

## Installing locally (no build step required)

This plugin is plain JavaScript/HTML — there is nothing to compile or
`npm install`.

1. Open the Figma desktop app.
2. Go to **Menu → Plugins → Development → Import plugin from manifest…**
3. Select the `manifest.json` file in this folder.
4. Open any file, select a frame, and run **Plugins → Development →
   Screen Component Inspector**.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Plugin manifest (entry points, permissions). |
| `code.js` | Main plugin thread — reads the document via the Figma Plugin API, classifies components, sends results to the UI. Runs sandboxed, no network access. |
| `ui.html` | The plugin's UI (HTML/CSS/vanilla JS, no dependencies, no CDN). |

## Tagging your components

Add one of these tokens anywhere in a component's **description** field
(Figma properties panel → Description, when you have the component or
component-set selected):

```
[ds-component]
```
```
[ds-atom]
```

For a variant set (e.g. `Button` with `Size`/`State` variants), you can
set the tag either on each individual variant's description or once on
the component set's description — the plugin falls back to the set's
description and documentation links when a specific variant has none of
its own.

## Technical notes & known limitations (MVP)

- **Component links.** Figma's Plugin API exposes `documentationLinks` on
  `ComponentNode`/`ComponentSetNode` — these are the links attached via
  the "Add link" control in the component's properties panel (the same
  data used when preparing a component for library publishing). This
  plugin reads and displays exactly those links; it does not infer,
  guess, or fetch links from anywhere else. If a component has no
  documentation links set in Figma, none will be shown — the plugin does
  not fabricate them.
- **Figma screen link.** The "Open in Figma" link is built from
  `figma.fileKey` and the selected node's id. If the file has never been
  saved to Figma's servers (e.g. a brand-new unsaved local file), no file
  key exists yet and the link is shown as unavailable rather than broken.
- **Scope of analysis.** The plugin walks the *entire* descendant tree of
  the selected frame and counts every component instance it finds,
  including instances nested inside other instances (e.g. an icon inside
  a button). Deeper atom-hierarchy visualization (component → atom tree)
  is out of scope for this MVP per the PRD and is a candidate for a
  future version.
- **Multiple tags.** If a description contains both `[ds-component]` and
  `[ds-atom]`, the plugin classifies it as **DS Component** and lists
  both detected tags in the expanded detail view — the PRD does not
  define a precedence rule, so this is a deliberate, documented default.
- **No network access.** `manifest.json` declares
  `"networkAccess": { "allowedDomains": ["none"] }` — the plugin cannot
  make any network requests, matching the privacy requirement that all
  analysis stays local to your Figma session.

## Out of scope (by design, per PRD)

No code generation, no AI analysis, no design-token extraction, no
design-system validation, no external backend/auth/storage. This plugin
only reads and displays.
