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
   description, and any links attached to the component (both
   publish-time documentation links and Dev Mode "dev resources" links —
   see below).
6. The header shows the screen's name and a direct link to it in Figma.
7. For a variant (e.g. `Button` with `Size`/`State` variants), the row
   shows the component set's name with the specific variant (e.g.
   `Size=Large, State=Hover`) underneath it in a lighter color.
8. By default only **DS Component** and **DS Atom** rows are shown. Check
   "Show unclassified" above the list to also see unclassified instances.
9. Rows are listed in the order the components first appear on the
   screen (top-to-bottom in the layers tree), not alphabetically.

The list re-analyzes automatically whenever your selection changes while
the plugin is open, and has a manual "Refresh" button for re-reading a
description or link you just edited.

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

- **Component links.** Figma exposes two independent, unrelated link
  features, and this plugin reads both, merging them into one "Links"
  list per component:
  - `documentationLinks` on `ComponentNode`/`ComponentSetNode` — the
    links attached via the "Add link" control in the component's
    properties panel (the same data used when preparing a component for
    library publishing).
  - **Dev Mode links ("dev resources")** — the links you attach via the
    link/paperclip control in the **Dev Mode Inspect panel** on a
    component. These are read via `figma.getDevResourcesAsync()`, a
    separate Plugin API not used in the first version of this plugin —
    this is what was missing when links weren't showing up for
    components tagged from Dev Mode. Reading these does **not** require
    the plugin itself to be running in Dev Mode.
  In both cases the plugin only displays links it read from Figma; it
  never infers, guesses, or fetches links from anywhere else. Dev
  resources also require a Figma plan with Dev Mode enabled on the
  file — on a plan/file without it, `getDevResourcesAsync` returns
  nothing and the plugin silently falls back to documentation links
  only.
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
